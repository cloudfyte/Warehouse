"""
Sending stock from this godown to the retail shop.

The shop is one subsite over there — its own products, its own stores, its own
tenant boundary. Everything here is pinned to that one subsite, and a
consignment moves through a state machine whose whole purpose is that stock
leaves this building exactly once and lands over there exactly once.

Where the counting happens matters:

  DRAFT   lines are being written. Nothing has moved.
  PACKED  the cartons are scanned shut. Stock has LEFT this warehouse.
  SENT    the retail side has been told. It may or may not have heard us.
  ACKED   the retail side gave us a receipt id. It definitely heard us.

Stock leaves at PACKED rather than at SENT because that is when it physically
leaves — a lorry that has gone has gone whether or not the API call worked.
"""
import json
import urllib.error
import urllib.request
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from graphql import GraphQLError

from warehouse.models import (
    EmployeeProfile, FinishedProduct, RetailChannel, RetailDispatch,
    RetailDispatchItem, RetailProductLink, RetailStore,
)
from warehouse.permissions import get_scoped, get_warehouse, require_role

_MANAGE = (EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER,
           EmployeeProfile.Role.STORE_KEEPER)
_ADMIN = (EmployeeProfile.Role.ADMIN,)


# ── the channel ───────────────────────────────────────────────────────────────

def get_channel():
    """The one subsite this warehouse ships to, or None before it is set up."""
    return RetailChannel.objects.filter(pk=1).first()


def _require_channel():
    channel = get_channel()
    if not channel or not channel.active:
        raise GraphQLError(
            "No retail shop is connected yet. Set the subsite up under "
            "Settings before dispatching anything to it."
        )
    return channel


def configure_channel(*, user, subsite_id, subsite_name, api_url,
                      service_username=None, service_password=None, active=None):
    """Point this warehouse at its retail subsite. Admin only, and only one."""
    require_role(user, *_ADMIN)
    if int(subsite_id) <= 0:
        raise GraphQLError("The subsite id must be a positive number.")

    channel = get_channel() or RetailChannel()
    channel.subsite_id = int(subsite_id)
    channel.subsite_name = (subsite_name or "").strip()
    channel.api_url = (api_url or "").strip()
    if service_username is not None:
        channel.service_username = service_username.strip()
    # Blank means "leave the stored password alone", the same rule the mail and
    # messaging credentials follow. Erasing one is done by disabling the channel.
    if service_password:
        channel.service_password = service_password
    if active is not None:
        channel.active = active
    channel.save()
    return channel


def add_store(*, user, building_id, name):
    """Register a store of that subsite as somewhere goods can be sent."""
    require_role(user, *_ADMIN)
    channel = _require_channel()
    if int(building_id) <= 0:
        raise GraphQLError("The store id must be a positive number.")
    if not (name or "").strip():
        raise GraphQLError("Give the store a name.")

    store, created = RetailStore.objects.get_or_create(
        channel=channel, building_id=int(building_id),
        defaults={"name": name.strip()},
    )
    if not created:
        store.name = name.strip()
        store.active = True
        store.save(update_fields=["name", "active"])
    return store


# ── the catalogue mapping ─────────────────────────────────────────────────────

def link_product(*, user, finished_product_id, product_id, variant_id=None):
    """Say which product over there this product is. Never inferred."""
    require_role(user, *_MANAGE)
    _require_channel()
    product = get_scoped(user, FinishedProduct, finished_product_id)
    if int(product_id) <= 0:
        raise GraphQLError("The retail product id must be a positive number.")

    link, _ = RetailProductLink.objects.update_or_create(
        finished_product=product,
        defaults={
            "product_id": int(product_id),
            "variant_id": int(variant_id) if variant_id else None,
            "linked_by": user,
        },
    )
    return link


def unlink_product(*, user, finished_product_id):
    require_role(user, *_MANAGE)
    RetailProductLink.objects.filter(finished_product_id=finished_product_id).delete()
    return True


# ── the consignment ───────────────────────────────────────────────────────────

def create_dispatch(*, user, store_id, warehouse_id, lines, dispatch_date=None, notes="",
                    transporter_name="", lr_number="", vehicle_number="",
                    driver_phone="", photos=""):
    """
    Open a consignment. Nothing moves yet — this is the packing list.

    lines = [{finished_product_id, quantity}]
    """
    require_role(user, *_MANAGE)
    channel = _require_channel()
    warehouse = get_warehouse(user, warehouse_id)

    try:
        store = RetailStore.objects.get(pk=store_id, channel=channel, active=True)
    except RetailStore.DoesNotExist as exc:
        raise GraphQLError("That store is not one this warehouse ships to.") from exc

    if not lines:
        raise GraphQLError("A consignment needs at least one product in it.")

    with transaction.atomic():
        dispatch = RetailDispatch.objects.create(
            store=store, from_warehouse=warehouse, created_by=user,
            dispatch_date=dispatch_date, notes=(notes or "").strip(),
            transporter_name=transporter_name.strip(), lr_number=lr_number.strip(),
            vehicle_number=vehicle_number.strip(), driver_phone=driver_phone.strip(),
            photos=photos or "",
        )
        seen = set()
        for line in lines:
            product = get_scoped(user, FinishedProduct, line["finished_product_id"])
            if product.pk in seen:
                raise GraphQLError(f"{product.sku} is listed twice on this consignment.")
            seen.add(product.pk)
            if product.warehouse_id != warehouse.id:
                raise GraphQLError(
                    f"{product.sku} is in {product.warehouse.name}, not {warehouse.name}. "
                    f"A consignment leaves one warehouse."
                )
            quantity = int(line.get("quantity") or 0)
            if quantity <= 0:
                raise GraphQLError(f"How many of {product.sku} are you sending?")
            RetailDispatchItem.objects.create(
                dispatch=dispatch, finished_product=product,
                quantity=quantity, unit_cost=product.cost_price,
            )
    return dispatch


def scan_into_dispatch(*, user, id, barcode):
    """
    Scan one garment into the carton.

    The manifest becomes what was actually scanned rather than what someone
    typed, so a short consignment is found here — at the loading bay, with the
    goods still in reach — instead of at the shop a day later.
    """
    require_role(user, *_MANAGE)
    code = (barcode or "").strip()
    if not code:
        raise GraphQLError("Nothing was scanned.")

    with transaction.atomic():
        dispatch = _locked(id)
        if dispatch.status != RetailDispatch.Status.DRAFT:
            raise GraphQLError(
                f"{dispatch.dispatch_number} is {dispatch.get_status_display().lower()} — "
                f"its cartons are already closed."
            )

        # A reprice mints a new code and retires the old one, so a garment
        # tagged before that still scans. Matching only the current code would
        # reject stock that is genuinely on the list.
        item = next(
            (i for i in dispatch.items.select_related("finished_product")
             if i.finished_product.barcode == code
             or code in i.finished_product.past_codes()),
            None,
        )
        if item is None:
            raise GraphQLError(
                f"{code} is not on consignment {dispatch.dispatch_number}. "
                f"Add the product to the list first, or check the carton."
            )
        if item.packed_quantity >= item.quantity:
            raise GraphQLError(
                f"All {item.quantity} of {item.finished_product.sku} are already "
                f"packed. Raise the line if you are sending more."
            )
        item.packed_quantity += 1
        item.save(update_fields=["packed_quantity"])
    return item


def pack_dispatch(*, user, id, allow_short=False):
    """
    Close the cartons. This is where stock leaves the building.

    Every line has to name a product over there before anything moves: a
    consignment that cannot be described to the shop should not be on a lorry.
    """
    require_role(user, *_MANAGE)
    _require_channel()

    with transaction.atomic():
        dispatch = _locked(id)
        if dispatch.status != RetailDispatch.Status.DRAFT:
            raise GraphQLError(f"{dispatch.dispatch_number} is already packed.")

        items = list(dispatch.items.select_related("finished_product"))
        if not items:
            raise GraphQLError("There is nothing on this consignment.")

        unlinked = [i.finished_product.sku for i in items
                    if not RetailProductLink.objects.filter(
                        finished_product=i.finished_product).exists()]
        if unlinked:
            raise GraphQLError(
                "These have no matching product at the shop yet: "
                + ", ".join(unlinked)
                + ". Link them first — creating them over there automatically "
                  "would fork the two catalogues."
            )

        short = [i for i in items if i.packed_quantity < i.quantity]
        if short and not allow_short:
            detail = ", ".join(
                f"{i.finished_product.sku} ({i.packed_quantity} of {i.quantity})"
                for i in short)
            raise GraphQLError(
                f"Not everything is in the carton: {detail}. Scan the rest, or "
                f"pack it short on purpose to send what is actually there."
            )

        # Packing short sends what is in the carton, not what was hoped for.
        for item in items:
            if item.packed_quantity < item.quantity:
                item.quantity = item.packed_quantity
                item.save(update_fields=["quantity"])

        dispatch.items.filter(quantity=0).delete()
        if not dispatch.items.exists():
            raise GraphQLError("Nothing was scanned into this consignment.")

        # The stock physically leaves now. Locked per product so two people
        # packing two consignments cannot both take the last piece.
        for item in dispatch.items.select_related("finished_product"):
            product = FinishedProduct.objects.select_for_update().get(
                pk=item.finished_product_id)
            if product.quantity < item.quantity:
                raise GraphQLError(
                    f"Only {product.quantity} of {product.sku} left in stock, "
                    f"but the carton has {item.quantity}."
                )
            product.quantity -= item.quantity
            product.save(update_fields=["quantity", "updated_at"])

        dispatch.status = RetailDispatch.Status.PACKED
        dispatch.packed_at = timezone.now()
        dispatch.save(update_fields=["status", "packed_at", "updated_at"])
    return dispatch


def cancel_dispatch(*, user, id):
    """Call it off. Stock already out of the building comes back."""
    require_role(user, *_MANAGE)
    with transaction.atomic():
        dispatch = _locked(id)
        if dispatch.status in (RetailDispatch.Status.SENT,
                               RetailDispatch.Status.ACKNOWLEDGED):
            raise GraphQLError(
                f"{dispatch.dispatch_number} has already gone to the shop. "
                f"Send it back as a return instead of cancelling it."
            )
        if dispatch.status == RetailDispatch.Status.CANCELLED:
            return dispatch

        if dispatch.status in (RetailDispatch.Status.PACKED,
                               RetailDispatch.Status.FAILED):
            for item in dispatch.items.select_related("finished_product"):
                product = FinishedProduct.objects.select_for_update().get(
                    pk=item.finished_product_id)
                product.quantity += item.quantity
                product.save(update_fields=["quantity", "updated_at"])

        dispatch.status = RetailDispatch.Status.CANCELLED
        dispatch.save(update_fields=["status", "updated_at"])
    return dispatch


def _locked(id):
    try:
        return RetailDispatch.objects.select_for_update().get(pk=id)
    except RetailDispatch.DoesNotExist as exc:
        raise GraphQLError("Consignment not found.") from exc


# ── telling the shop ──────────────────────────────────────────────────────────

_RECORD_RECEIPT = (
    "mutation R($hms:Int!,$building:Int!,$items:[StockReceiptItemInput!]!,"
    "$supplier:String,$notes:String){"
    "recordStockReceipt(hmsId:$hms,buildingId:$building,items:$items,"
    "supplierName:$supplier,notes:$notes)"
    "{success message receipt{id}}}"
)


def send_dispatch(*, user, id, _transport=None):
    """
    Tell the shop what is coming.

    The one rule here: a consignment lands over there exactly once. The retail
    receipt endpoint has no idempotency key of its own, so posting twice would
    add the stock twice with nothing to show it happened. Two things stand in
    the way of that — a consignment that already has a receipt id refuses to
    send again, and the dispatch number goes over in the notes so a repeat is
    recognisable by a person reading the shop's goods-in log.

    A call that fails without an answer is the dangerous case: it may or may
    not have landed. That leaves the consignment FAILED and waiting for a human
    rather than retrying on its own, because an automatic retry is exactly how
    stock gets doubled.
    """
    require_role(user, *_MANAGE)
    channel = _require_channel()

    with transaction.atomic():
        dispatch = _locked(id)
        if dispatch.status == RetailDispatch.Status.ACKNOWLEDGED:
            raise GraphQLError(
                f"{dispatch.dispatch_number} has already landed at the shop "
                f"(their receipt #{dispatch.receipt_id}). Sending it again "
                f"would add the stock a second time."
            )
        if dispatch.status not in (RetailDispatch.Status.PACKED,
                                   RetailDispatch.Status.FAILED,
                                   RetailDispatch.Status.SENT):
            raise GraphQLError(
                f"{dispatch.dispatch_number} is {dispatch.get_status_display().lower()}. "
                f"Pack it before sending it."
            )

        items = []
        for item in dispatch.items.select_related("finished_product"):
            link = RetailProductLink.objects.filter(
                finished_product=item.finished_product).first()
            if not link:
                raise GraphQLError(
                    f"{item.finished_product.sku} lost its link to the shop's "
                    f"catalogue. Link it again before sending."
                )
            entry = {"quantity": item.quantity, "unitCost": float(item.unit_cost)}
            # A variant is the sellable thing when the product has them; the
            # product itself is, when it does not.
            if link.variant_id:
                entry["variantId"] = link.variant_id
            else:
                entry["productId"] = link.product_id
            items.append(entry)

        dispatch.status = RetailDispatch.Status.SENT
        dispatch.sent_at = timezone.now()
        dispatch.attempts += 1
        dispatch.save(update_fields=["status", "sent_at", "attempts", "updated_at"])

    payload = {
        "hms": channel.subsite_id,
        "building": dispatch.store.building_id,
        "items": items,
        "supplier": f"Godown — {dispatch.from_warehouse.name}",
        # The consignment number is the only thing tying their goods-in row
        # back to ours. It is what a reconciliation is done on.
        "notes": f"{dispatch.dispatch_number} · {dispatch.notes}".strip(" ·"),
    }

    post = _transport or _post
    try:
        result = post(channel, _RECORD_RECEIPT, payload)
    except Exception as exc:  # noqa: BLE001 — every failure is the same failure here
        return _failed(dispatch, str(exc))

    receipt_id = (((result or {}).get("recordStockReceipt") or {}).get("receipt") or {}).get("id")
    if not receipt_id:
        message = ((result or {}).get("recordStockReceipt") or {}).get("message")
        return _failed(dispatch, message or "The shop did not confirm the consignment.")

    dispatch.status = RetailDispatch.Status.ACKNOWLEDGED
    dispatch.receipt_id = int(receipt_id)
    dispatch.acknowledged_at = timezone.now()
    dispatch.last_error = ""
    dispatch.save(update_fields=["status", "receipt_id", "acknowledged_at",
                                 "last_error", "updated_at"])
    return dispatch


def _failed(dispatch, message):
    """
    Park it where a person will see it.

    Deliberately not re-sent on a timer. A call that timed out may already have
    landed, and the only safe next step is somebody checking the shop's
    goods-in log against this consignment number.
    """
    dispatch.status = RetailDispatch.Status.FAILED
    dispatch.last_error = message[:2000]
    dispatch.save(update_fields=["status", "last_error", "updated_at"])
    return dispatch


def _post(channel, query, variables):
    """One HTTP call to the retail GraphQL endpoint."""
    body = json.dumps({"query": query, "variables": variables}).encode()
    request = urllib.request.Request(
        channel.api_url, data=body,
        headers={"Content-Type": "application/json", **_auth_header(channel)},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"The shop answered {exc.code}.") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach the shop: {exc.reason}.") from exc

    if payload.get("errors"):
        raise RuntimeError(payload["errors"][0].get("message", "The shop refused it."))
    return payload.get("data") or {}


def _auth_header(channel):
    """A token for the service account, fetched per send rather than stored."""
    if not channel.service_username:
        return {}
    body = json.dumps({
        "query": "mutation T($u:String!,$p:String!){tokenAuth(username:$u,password:$p){token}}",
        "variables": {"u": channel.service_username, "p": channel.service_password},
    }).encode()
    request = urllib.request.Request(
        channel.api_url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode())
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Could not sign in to the shop: {exc}") from exc
    token = ((payload.get("data") or {}).get("tokenAuth") or {}).get("token")
    if not token:
        raise RuntimeError("The shop rejected the warehouse's service login.")
    return {"Authorization": f"JWT {token}"}


# ── reading the shop ──────────────────────────────────────────────────────────
#
# Store ids and product ids are the shop's, not ours, and they differ between
# their test site and their real one. Typing them by hand is how a consignment
# ends up in the wrong shop or against the wrong garment, so both are fetched
# and matched instead.

_LIST_BUILDINGS = (
    "query B($company:Int!){listBuildings(companyId:$company,isActive:true)"
    "{id name location propertyType}}"
)

_LIST_PRODUCTS = (
    "query P($hms:Int!,$limit:Int){listProducts(hmsId:$hms,limit:$limit)"
    "{id name isActive hasVariants "
    "variants{id sku barcode price isActive label options{name value}}}}"
)


def pull_stores(*, user, _transport=None):
    """
    Fetch the shop's stores and keep our list in step with theirs.

    A store that disappears over there is deactivated rather than deleted:
    consignments already sent to it still have to name where they went.
    """
    require_role(user, *_ADMIN)
    channel = _require_channel()
    post = _transport or _post

    data = post(channel, _LIST_BUILDINGS, {"company": channel.subsite_id})
    buildings = data.get("listBuildings") or []

    seen = []
    for building in buildings:
        building_id = int(building["id"])
        seen.append(building_id)
        store, created = RetailStore.objects.get_or_create(
            channel=channel, building_id=building_id,
            defaults={"name": building.get("name") or f"Store {building_id}"},
        )
        if not created:
            store.name = building.get("name") or store.name
            store.active = True
            store.save(update_fields=["name", "active"])

    RetailStore.objects.filter(channel=channel).exclude(building_id__in=seen).update(active=False)
    return RetailStore.objects.filter(channel=channel)


def pull_catalogue(*, user, _transport=None, limit=2000):
    """
    Match our finished products to the shop's catalogue by barcode.

    Their variants carry a barcode of their own, and ours are unique — so where
    the two agree there is nothing to decide and the link is made. Anything
    left over is reported, not guessed: a wrong link sends the right garment
    against the wrong product, and nobody finds out until the stock is counted.

    Returns (linked, unmatched) — what it settled, and what still needs a person.
    """
    require_role(user, *_MANAGE)
    channel = _require_channel()
    post = _transport or _post

    data = post(channel, _LIST_PRODUCTS, {"hms": channel.subsite_id, "limit": limit})
    products = data.get("listProducts") or []

    # Their barcode -> what to link to. A barcode they have used twice is
    # ambiguous and therefore useless for matching, so it is dropped.
    by_barcode = {}
    duplicates = set()
    for product in products:
        for variant in (product.get("variants") or []):
            code = (variant.get("barcode") or "").strip()
            if not code:
                continue
            if code in by_barcode:
                duplicates.add(code)
                continue
            by_barcode[code] = (int(product["id"]), int(variant["id"]))
    for code in duplicates:
        by_barcode.pop(code, None)

    from warehouse.permissions import accessible_warehouses

    ours = (FinishedProduct.objects
            .filter(warehouse__in=accessible_warehouses(user), retail_link__isnull=True)
            .select_related("item_type"))

    linked, unmatched = [], []
    with transaction.atomic():
        for product in ours:
            # A reprice retires a code without killing it, so an older tag that
            # is still on their shelf is just as good a match as the current one.
            match = next(
                (by_barcode[c] for c in [product.barcode, *product.past_codes()]
                 if c in by_barcode),
                None,
            )
            if not match:
                unmatched.append(product)
                continue
            product_id, variant_id = match
            RetailProductLink.objects.create(
                finished_product=product, product_id=product_id,
                variant_id=variant_id, linked_by=user,
            )
            linked.append(product)
    return linked, unmatched


def browse_catalogue(*, user, search="", _transport=None, limit=200):
    """The shop's catalogue as a list to pick from, for the ones that need a person."""
    require_role(user, *_MANAGE)
    channel = _require_channel()
    post = _transport or _post

    data = post(channel, _LIST_PRODUCTS, {"hms": channel.subsite_id, "limit": limit})
    term = (search or "").strip().lower()
    rows = []
    for product in (data.get("listProducts") or []):
        if product.get("isActive") is False:
            continue
        if term and term not in (product.get("name") or "").lower():
            continue
        variants = [v for v in (product.get("variants") or []) if v.get("isActive") is not False]
        if variants:
            rows.extend({
                "product_id": int(product["id"]),
                "variant_id": int(v["id"]),
                "label": f"{product.get('name')} — {v.get('label') or v.get('sku') or v['id']}",
                "barcode": v.get("barcode") or "",
            } for v in variants)
        else:
            rows.append({
                "product_id": int(product["id"]), "variant_id": None,
                "label": product.get("name") or f"Product {product['id']}",
                "barcode": "",
            })
    return rows
