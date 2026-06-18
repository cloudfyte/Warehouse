"""Stock movement and product creation business logic."""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Sum
from graphql import GraphQLError

from warehouse.models import (
    InventoryBalance,
    Product,
    StockMovement,
    Vendor,
    WarehouseLocation,
)
from warehouse.permissions import get_warehouse
from .notifications import send_low_stock_alert


def apply_stock_change(*, product, warehouse, delta, movement_type, user, reference="", notes=""):
    """Apply a signed quantity delta to a product/warehouse balance and record the movement."""
    balance, _ = InventoryBalance.objects.select_for_update().get_or_create(
        product=product,
        warehouse=warehouse,
        defaults={"reorder_level": product.reorder_level, "bin_location": product.location},
    )
    previous = balance.quantity
    new_stock = previous + delta
    if new_stock < 0:
        raise GraphQLError(
            f"Insufficient stock. {product.name} has {previous} units at {warehouse.name}."
        )
    balance.quantity = new_stock
    balance.save(update_fields=["quantity", "updated_at"])
    product.current_stock = product.balances.aggregate(total=Sum("quantity"))["total"] or 0
    product.save(update_fields=["current_stock", "updated_at"])
    movement = StockMovement.objects.create(
        product=product,
        warehouse=warehouse,
        movement_type=movement_type,
        quantity=delta,
        previous_stock=previous,
        new_stock=new_stock,
        reference=reference,
        notes=notes,
        created_by=user,
    )
    if previous > balance.reorder_level and new_stock <= balance.reorder_level:
        transaction.on_commit(lambda: send_low_stock_alert(product, warehouse, balance))
    return movement


def create_product(
    *,
    user,
    name,
    sku,
    warehouse_id,
    category="",
    description="",
    vendor_id=None,
    unit_price="0",
    gst_rate="0",
    hsn_code="",
    initial_stock=0,
    reorder_level=10,
    location="",
):
    if Product.objects.filter(sku__iexact=sku.strip()).exists():
        raise GraphQLError("A product with this SKU already exists.")
    if initial_stock < 0 or reorder_level < 0:
        raise GraphQLError("Stock and reorder level cannot be negative.")
    try:
        price, tax_rate = Decimal(unit_price), Decimal(gst_rate)
    except InvalidOperation as exc:
        raise GraphQLError("Unit price and GST rate must be valid numbers.") from exc

    warehouse = get_warehouse(user, warehouse_id)
    vendor = Vendor.objects.filter(pk=vendor_id, active=True).first() if vendor_id else None
    product = Product.objects.create(
        name=name.strip(),
        sku=sku.strip().upper(),
        category=category.strip(),
        description=description.strip(),
        vendor=vendor,
        unit_price=price,
        gst_rate=tax_rate,
        hsn_code=hsn_code.strip(),
        current_stock=initial_stock,
        reorder_level=reorder_level,
        location=location.strip(),
    )
    InventoryBalance.objects.create(
        product=product,
        warehouse=warehouse,
        quantity=initial_stock,
        reorder_level=reorder_level,
        bin_location=location.strip(),
    )
    if initial_stock:
        StockMovement.objects.create(
            product=product,
            warehouse=warehouse,
            movement_type=StockMovement.MovementType.RECEIPT,
            quantity=initial_stock,
            previous_stock=0,
            new_stock=initial_stock,
            notes="Opening stock",
            created_by=user,
        )
    return product


def update_stock(*, user, product_id, warehouse_id, movement_type, quantity, reference="", notes=""):
    from warehouse.permissions import get_product
    if quantity <= 0:
        raise GraphQLError("Quantity must be greater than zero.")
    movement_type = movement_type.upper()
    allowed = {
        StockMovement.MovementType.RECEIPT: 1,
        StockMovement.MovementType.ISSUE: -1,
        StockMovement.MovementType.ADJUSTMENT: 1,
    }
    if movement_type not in allowed:
        raise GraphQLError("Movement type must be RECEIPT, ISSUE, or ADJUSTMENT.")
    return apply_stock_change(
        product=get_product(product_id),
        warehouse=get_warehouse(user, warehouse_id),
        delta=quantity * allowed[movement_type],
        movement_type=movement_type,
        user=user,
        reference=reference,
        notes=notes,
    )
