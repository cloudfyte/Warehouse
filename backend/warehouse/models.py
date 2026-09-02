"""
Garment ERP — core domain models.
Covers: cloth master data, supplier/buyer registry, purchase & sales orders,
raw cloth batches, cutting assignments, stitching jobs, finished products,
barcode tags, credit transactions, OTP auth, notifications, and system settings.
"""
import secrets as _secrets
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db.models import Q
from django.db import models, transaction
from django.utils import timezone


# ─── shared choices ───────────────────────────────────────────────────────────

class AgeGroup(models.TextChoices):
    MEN    = "MEN",    "Men"
    WOMEN  = "WOMEN",  "Women"
    BOYS   = "BOYS",   "Boys"
    GIRLS  = "GIRLS",  "Girls"
    INFANT = "INFANT", "Infant / Baby"
    UNISEX = "UNISEX", "Unisex"


# ─── helpers ──────────────────────────────────────────────────────────────────

def _serial(prefix: str, model) -> str:
    """Generate next sequential number like PO-202406-0042."""
    stamp = timezone.now().strftime("%Y%m")
    with transaction.atomic():
        last = (
            model.objects
            .select_for_update()
            .order_by("-pk")
            .values_list("pk", flat=True)
            .first()
        )
        seq = (last or 0) + 1
    return f"{prefix}-{stamp}-{seq:04d}"


# ─── master data ──────────────────────────────────────────────────────────────

class WarehouseLocation(models.Model):
    """Physical warehouse or store location."""
    class LocationType(models.TextChoices):
        WAREHOUSE = "WAREHOUSE", "Warehouse"
        STORE = "STORE", "Retail Store"
        PRODUCTION = "PRODUCTION", "Production Floor"

    name = models.CharField(max_length=160)
    code = models.CharField(max_length=30, unique=True)
    location_type = models.CharField(max_length=20, choices=LocationType.choices, default=LocationType.WAREHOUSE)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    pincode = models.CharField(max_length=10, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.code} — {self.name}"


class CustomRole(models.Model):
    """Admin-defined roles with custom tab visibility and a backend permission level."""
    name = models.CharField(max_length=50, unique=True, help_text="Slug key — auto-uppercased")
    display_name = models.CharField(max_length=100)
    color = models.CharField(max_length=7, default="#6366f1", help_text="#RRGGBB")
    # Which system role's backend mutation permissions this role inherits
    backend_level = models.CharField(max_length=50, default="STORE_KEEPER",
        help_text="Inherits backend permissions from this system role")
    # Which tabs are visible: {"dashboard": true, "cutting": true, ...}
    tab_permissions = models.JSONField(default=dict)
    is_system = models.BooleanField(default=False, help_text="System roles cannot be deleted")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["display_name"]

    def save(self, *args, **kwargs):
        self.name = self.name.upper().replace(" ", "_").replace("-", "_")
        super().save(*args, **kwargs)

    def __str__(self):
        return self.display_name


class EmployeeProfile(models.Model):
    class Role(models.TextChoices):
        SUPER_ADMIN = "SUPER_ADMIN", "Super Administrator"
        ADMIN = "ADMIN", "Administrator"
        MANAGER = "MANAGER", "Manager"
        STORE_KEEPER = "STORE_KEEPER", "Store Keeper"
        CUTTING_MASTER = "CUTTING_MASTER", "Cutting Master"
        TAILOR = "TAILOR", "Tailor / Maker"
        AUDITOR = "AUDITOR", "Auditor (Read-only)"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        related_name="profile",
        on_delete=models.CASCADE,
    )
    role = models.CharField(max_length=50, choices=Role.choices, default=Role.STORE_KEEPER, db_index=True)
    custom_role = models.ForeignKey(
        CustomRole, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="employees",
        help_text="If set, overrides tab visibility and role badge display",
    )
    phone = models.CharField(max_length=20, blank=True)
    locations = models.ManyToManyField(WarehouseLocation, related_name="employees", blank=True)
    active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} — {self.get_role_display()}"


class ClothCategory(models.Model):
    """Fabric type: Silk, Cotton, Georgette, Velvet …"""
    name = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=255, blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "Cloth categories"

    def __str__(self):
        return self.name


class ClothColor(models.Model):
    name = models.CharField(max_length=100, unique=True)
    hex_code = models.CharField(max_length=7, blank=True, help_text="#RRGGBB")
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class ItemType(models.Model):
    """Garment types produced: Sherwani, Wedding Cap, Kurta …"""
    name = models.CharField(max_length=100, unique=True)
    category = models.CharField(max_length=100, blank=True, help_text="Bridal, Casual, …")
    cloth_length_per_piece = models.DecimalField(
        max_digits=6, decimal_places=2, default=Decimal("0.00"),
        help_text="Standard meters of raw cloth needed to cut one piece",
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    hsn_code = models.CharField(max_length=10, blank=True, help_text="HSN/SAC code for GST compliance")
    gst_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("0.00"),
        help_text="GST rate % applicable to this item type (0 / 5 / 12 / 18 / 28)",
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


# ─── supplier (import side) ───────────────────────────────────────────────────

class Supplier(models.Model):
    """Vendors who SELL TO us — raw cloth or readymade items."""
    class SupplyType(models.TextChoices):
        RAW_CLOTH = "RAW_CLOTH", "Raw Cloth"
        READYMADE = "READYMADE", "Readymade Items"
        BOTH = "BOTH", "Both"

    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    whatsapp = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    gstin = models.CharField(max_length=15, blank=True)
    supply_type = models.CharField(max_length=20, choices=SupplyType.choices, default=SupplyType.RAW_CLOTH)
    credit_days = models.PositiveSmallIntegerField(default=0, help_text="Payment terms in days")
    notes = models.TextField(blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


# ─── buyer (export side) ──────────────────────────────────────────────────────

class Buyer(models.Model):
    """Customers / wholesale buyers — people we SELL TO."""
    class BuyerType(models.TextChoices):
        WHOLESALE = "WHOLESALE", "Wholesale"
        RETAIL = "RETAIL", "Retail"
        EXPORT = "EXPORT", "Export"

    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    whatsapp = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    gstin = models.CharField(max_length=15, blank=True)
    buyer_type = models.CharField(max_length=20, choices=BuyerType.choices, default=BuyerType.WHOLESALE)
    credit_limit = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


# ─── purchase orders (inbound) ────────────────────────────────────────────────

class PurchaseOrder(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PLACED = "PLACED", "Placed"
        DISPATCHED = "DISPATCHED", "Dispatched"
        PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED", "Partially Received"
        RECEIVED = "RECEIVED", "Received"
        VERIFIED = "VERIFIED", "Verified"
        CANCELLED = "CANCELLED", "Cancelled"

    class OrderType(models.TextChoices):
        RAW_CLOTH = "RAW_CLOTH", "Raw Cloth"
        READYMADE = "READYMADE", "Readymade Items"
        MIXED = "MIXED", "Mixed"

    po_number = models.CharField(max_length=30, unique=True, editable=False)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchase_orders")
    order_type = models.CharField(max_length=20, choices=OrderType.choices, default=OrderType.RAW_CLOTH)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    order_date = models.DateField(default=timezone.now)
    expected_delivery = models.DateField(null=True, blank=True)
    actual_delivery = models.DateField(null=True, blank=True)
    warehouse = models.ForeignKey(WarehouseLocation, on_delete=models.PROTECT, related_name="purchase_orders")
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="purchase_orders")
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="received_purchase_orders")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.po_number:
            self.po_number = _serial("PO", PurchaseOrder)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.po_number


class PurchaseOrderItem(models.Model):
    class ItemKind(models.TextChoices):
        RAW_CLOTH = "RAW_CLOTH", "Raw Cloth"
        READYMADE = "READYMADE", "Readymade"

    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="items")
    item_kind = models.CharField(max_length=20, choices=ItemKind.choices)

    # Raw cloth fields
    cloth_category = models.ForeignKey(ClothCategory, null=True, blank=True, on_delete=models.SET_NULL)
    cloth_color = models.ForeignKey(ClothColor, null=True, blank=True, on_delete=models.SET_NULL, related_name="po_items")
    ordered_meters = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    received_meters = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))

    # Readymade fields
    item_type = models.ForeignKey(ItemType, null=True, blank=True, on_delete=models.SET_NULL, related_name="po_items")
    item_name = models.CharField(max_length=200, blank=True)
    age_group = models.CharField(max_length=10, choices=AgeGroup.choices, blank=True)
    size = models.CharField(max_length=30, blank=True)
    ordered_quantity = models.PositiveIntegerField(default=0)
    received_quantity = models.PositiveIntegerField(default=0)

    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    notes = models.CharField(max_length=255, blank=True)
    # What was ordered, as a picture: a shade of cloth or a sample garment is
    # far easier to match against a delivery than a category and a colour name.
    # Comma-separated storage paths, same as parcel inspection photos.
    photos = models.TextField(blank=True, help_text="Comma-separated photo paths of the item ordered")

    def __str__(self):
        return f"{self.purchase_order.po_number} — {self.item_kind}"


# ─── direct purchase bills ────────────────────────────────────────────────────

class PurchaseBill(models.Model):
    """Direct walk-in purchase — items bought and received in one step (no formal PO needed)."""
    class PaymentStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PARTIAL = "PARTIAL", "Partially Paid"
        PAID = "PAID", "Fully Paid"

    bill_number = models.CharField(max_length=30, unique=True, editable=False)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchase_bills")
    warehouse = models.ForeignKey(WarehouseLocation, on_delete=models.PROTECT, related_name="purchase_bills")
    bill_date = models.DateField(default=timezone.now)
    invoice_ref = models.CharField(max_length=100, blank=True, help_text="Supplier's invoice / bill number")
    bill_image = models.TextField(blank=True, help_text="Base64-encoded photo of the bill")
    taxable_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    cgst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    sgst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    igst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    payment_status = models.CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)
    notes = models.TextField(blank=True)
    source_po = models.ForeignKey(
        'PurchaseOrder', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='generated_bills',
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="purchase_bills")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.bill_number:
            self.bill_number = _serial("PB", PurchaseBill)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.bill_number

    @property
    def amount_pending(self):
        return self.total_amount - self.amount_paid


class PurchaseBillItem(models.Model):
    class ItemKind(models.TextChoices):
        RAW_CLOTH = "RAW_CLOTH", "Raw Cloth"
        READYMADE = "READYMADE", "Readymade"

    bill = models.ForeignKey(PurchaseBill, on_delete=models.CASCADE, related_name="items")
    item_kind = models.CharField(max_length=20, choices=ItemKind.choices)

    # Raw cloth fields
    cloth_category = models.ForeignKey(ClothCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name="bill_items")
    cloth_color = models.ForeignKey(ClothColor, null=True, blank=True, on_delete=models.SET_NULL, related_name="bill_items")
    total_meters = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    cost_per_meter = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    bin_location = models.CharField(max_length=100, blank=True)
    cloth_code = models.CharField(max_length=20, blank=True)

    # Readymade fields
    item_type = models.ForeignKey(ItemType, null=True, blank=True, on_delete=models.SET_NULL, related_name="bill_items")
    age_group = models.CharField(max_length=10, choices=AgeGroup.choices, blank=True)
    size = models.CharField(max_length=30, blank=True)
    quantity = models.PositiveIntegerField(default=0)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    notes = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"{self.bill.bill_number} — {self.item_kind}"


# ─── raw cloth inventory ──────────────────────────────────────────────────────

class RawClothBatch(models.Model):
    """A physical roll/lot of raw cloth received into the warehouse."""
    batch_number = models.CharField(max_length=40, unique=True, editable=False)
    po_item = models.ForeignKey(PurchaseOrderItem, null=True, blank=True, on_delete=models.SET_NULL, related_name="batches")
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="cloth_batches")
    cloth_category = models.ForeignKey(ClothCategory, on_delete=models.PROTECT, related_name="batches")
    cloth_color = models.ForeignKey(ClothColor, on_delete=models.PROTECT, related_name="batches")
    warehouse = models.ForeignKey(WarehouseLocation, on_delete=models.PROTECT, related_name="cloth_batches")
    total_meters = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    available_meters = models.DecimalField(max_digits=10, decimal_places=2)
    cost_per_meter = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    cloth_code = models.CharField(max_length=20, blank=True, help_text="Smart price-embedded code e.g. K7200")
    bin_location = models.CharField(max_length=80, blank=True, help_text="Shelf / rack in warehouse")
    received_date = models.DateField(default=timezone.now)
    notes = models.TextField(blank=True)
    active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "Raw cloth batches"

    def save(self, *args, **kwargs):
        if not self.batch_number:
            self.batch_number = _serial("RCB", RawClothBatch)
        if self.available_meters is None:
            self.available_meters = self.total_meters
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.batch_number} — {self.cloth_category} {self.cloth_color}"


class ReadymadeStock(models.Model):
    """Readymade garments received from a supplier, stored before tagging."""
    po_item = models.ForeignKey(PurchaseOrderItem, null=True, blank=True, on_delete=models.SET_NULL, related_name="readymade_stocks")
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="readymade_stocks")
    item_type = models.ForeignKey(ItemType, on_delete=models.PROTECT, related_name="readymade_stocks")
    cloth_category = models.ForeignKey(ClothCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name="readymade_stocks")
    cloth_color = models.ForeignKey(ClothColor, null=True, blank=True, on_delete=models.SET_NULL, related_name="readymade_stocks")
    age_group = models.CharField(max_length=10, choices=AgeGroup.choices, blank=True)
    size = models.CharField(max_length=30, blank=True)
    warehouse = models.ForeignKey(WarehouseLocation, on_delete=models.PROTECT, related_name="readymade_stocks")
    quantity_received = models.PositiveIntegerField()
    quantity_available = models.PositiveIntegerField()
    cost_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    received_date = models.DateField(default=timezone.now)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.item_type} — {self.cloth_color} {self.size} ({self.quantity_available} pcs)"


# ─── production pipeline ──────────────────────────────────────────────────────

class CuttingAssignment(models.Model):
    """Meters of raw cloth assigned to a cutting master to cut into garment pieces."""
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"
        PARTIAL = "PARTIAL", "Partially Done"

    assignment_number = models.CharField(max_length=40, unique=True, editable=False)
    raw_cloth_batch = models.ForeignKey(RawClothBatch, on_delete=models.PROTECT, related_name="cutting_assignments")
    cutting_master = models.ForeignKey(EmployeeProfile, on_delete=models.PROTECT, related_name="cutting_assignments", limit_choices_to={"role": EmployeeProfile.Role.CUTTING_MASTER})
    item_type = models.ForeignKey(ItemType, on_delete=models.PROTECT, related_name="cutting_assignments")
    meters_assigned = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    target_pieces = models.PositiveIntegerField()
    age_group = models.CharField(max_length=10, choices=AgeGroup.choices, blank=True)
    size = models.CharField(max_length=30, blank=True, help_text="Garment size being cut e.g. S / M / L / XL / Free Size")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    assigned_date = models.DateField(default=timezone.now)
    due_date = models.DateField(null=True, blank=True)

    # Filled on completion
    pieces_completed = models.PositiveIntegerField(default=0)
    cloth_used = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    cloth_wasted = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    completed_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="cutting_assignments_created")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.assignment_number:
            self.assignment_number = _serial("CA", CuttingAssignment)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.assignment_number} — {self.item_type}"


class StitchingJob(models.Model):
    """Cut pieces assigned to a tailor to stitch into finished garments."""
    class Status(models.TextChoices):
        RECEIVED = "RECEIVED", "Received"
        PROCESSING = "PROCESSING", "Processing / Stitching"
        QC_CHECK = "QC_CHECK", "Quality Check"
        READY = "READY", "Ready"
        REJECTED = "REJECTED", "Rejected / Rework"
        MOVED = "MOVED", "Moved to Finished Goods"

    job_number = models.CharField(max_length=40, unique=True, editable=False)
    cutting_assignment = models.ForeignKey(CuttingAssignment, on_delete=models.PROTECT, related_name="stitching_jobs")
    tailor = models.ForeignKey(EmployeeProfile, on_delete=models.PROTECT, related_name="stitching_jobs", limit_choices_to={"role": EmployeeProfile.Role.TAILOR})
    pieces_assigned = models.PositiveIntegerField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RECEIVED)
    assigned_date = models.DateField(default=timezone.now)
    due_date = models.DateField(null=True, blank=True)

    # Filled on completion
    pieces_completed = models.PositiveIntegerField(default=0)
    pieces_rejected = models.PositiveIntegerField(default=0)
    completed_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="stitching_jobs_created")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.job_number:
            self.job_number = _serial("SJ", StitchingJob)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.job_number} — {self.cutting_assignment.item_type}"


# ─── finished goods & tagging ─────────────────────────────────────────────────

# Codes a person can read off a tag: I and O are absent so they cannot be misread
# as 1 and 0, and the set is the same one the purchase-bill cloth codes use.
# How many random digits sit either side of the price. Kept in settings so a
# shop can widen them if it ever runs out of room at one price point.
BARCODE_PAD_MAX = 6
BARCODE_PREFIX_DEFAULT = 2
BARCODE_SUFFIX_DEFAULT = 1
# The buried figure is the cost times this. Staff divide to get back to the
# floor; a customer reading the tag sees a number that is not a price they
# recognise. Configurable because the multiplier is the whole secret — a shop
# that thinks its staff have shared it needs to change it, not file a bug.
BARCODE_MULTIPLIER_DEFAULT = Decimal("2.1")


def _price_code(price, prefix_digits=BARCODE_PREFIX_DEFAULT,
                suffix_digits=BARCODE_SUFFIX_DEFAULT,
                multiplier=BARCODE_MULTIPLIER_DEFAULT):
    """
    Random digits, the disguised price, then more random digits — e.g. 45 1050 7.

    Digits only: a numeric code scans on the cheapest hardware, and letters gave
    the shop floor nothing a number does not. The random ends keep the figure from
    reading as a price and keep two products at the same cost apart.
    """
    def digits(n):
        return "".join(str(_secrets.randbelow(10)) for _ in range(n))
    return f"{digits(prefix_digits)}{encoded_price(price, multiplier)}{digits(suffix_digits)}"


def encoded_price(price, multiplier=BARCODE_MULTIPLIER_DEFAULT):
    """The figure that actually appears inside a barcode."""
    return int(round(Decimal(str(price or 0)) * Decimal(str(multiplier))))


class FinishedProduct(models.Model):
    """A tagged, ready-to-sell garment — either stitched in-house or imported."""
    class Source(models.TextChoices):
        IN_HOUSE = "IN_HOUSE", "In-house (Stitched)"
        IMPORTED = "IMPORTED", "Imported (Readymade)"

    sku = models.CharField(max_length=60, unique=True, editable=False)
    item_type = models.ForeignKey(ItemType, on_delete=models.PROTECT, related_name="finished_products")
    cloth_category = models.ForeignKey(ClothCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name="finished_products")
    cloth_color = models.ForeignKey(ClothColor, null=True, blank=True, on_delete=models.SET_NULL, related_name="finished_products")
    age_group = models.CharField(max_length=10, choices=AgeGroup.choices, blank=True)
    size = models.CharField(max_length=30, blank=True)
    source = models.CharField(max_length=20, choices=Source.choices)

    stitching_job = models.ForeignKey(StitchingJob, null=True, blank=True, on_delete=models.SET_NULL, related_name="finished_products")
    readymade_stock = models.ForeignKey(ReadymadeStock, null=True, blank=True, on_delete=models.SET_NULL, related_name="finished_products")

    quantity = models.PositiveIntegerField(default=0)
    warehouse = models.ForeignKey(WarehouseLocation, on_delete=models.PROTECT, related_name="finished_products")
    cost_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    sale_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))

    barcode = models.CharField(max_length=60, unique=True, editable=False)
    barcode_svg = models.TextField(blank=True)
    # Codes this product used to carry. The code has the price inside it, so
    # repricing has to mint a new one — but tags are already sewn onto garments
    # on the rack, and those have to keep scanning. Comma separated.
    previous_barcodes = models.TextField(blank=True, editable=False)
    tags_printed = models.BooleanField(default=False)
    active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.sku:
            self.sku = _serial("FP", FinishedProduct)
        if not self.barcode:
            self.barcode = self.mint_barcode()
        super().save(*args, **kwargs)

    def barcode_price(self):
        """
        The figure buried in this product's code.

        Defaults to cost: the sale price is printed on the tag in words and
        rupees, so hiding it in the number as well tells nobody anything, while
        the cost is the figure staff want and the customer must not have.
        """
        return self.cost_price if barcode_price_source() == "COST" else self.sale_price

    def mint_barcode(self):
        """A fresh numeric code carrying this product's disguised price."""
        prefix, suffix, multiplier = barcode_rules()
        for _ in range(40):
            code = _price_code(self.barcode_price(), prefix, suffix, multiplier)
            if not FinishedProduct.objects.filter(barcode=code).exclude(pk=self.pk).exists():
                return code
        raise ValueError("Could not mint a unique barcode after 40 attempts.")

    def past_codes(self):
        return [c for c in (self.previous_barcodes or "").split(",") if c]

    @property
    def profit_margin(self):
        if self.cost_price and self.sale_price:
            return self.sale_price - self.cost_price
        return Decimal("0.00")

    def __str__(self):
        return f"{self.sku} — {self.item_type}"


class FinishedProductOption(models.Model):
    """
    One dimension of a finished product — "Size: 40", "Sleeve: Full".

    Stored as rows rather than columns so a garment can be described by whatever
    dimensions it actually varies in. The columns FinishedProduct already has
    (size, age_group, cloth_colour) stay, and the well-known dimension names are
    mirrored into them, so tags, filters and every existing query keep working
    while new dimensions cost nothing but a row.
    """
    finished_product = models.ForeignKey(
        FinishedProduct, on_delete=models.CASCADE, related_name="options")
    name = models.CharField(max_length=60)
    value = models.CharField(max_length=120)
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]
        unique_together = [("finished_product", "name")]

    def __str__(self):
        return f"{self.name}: {self.value}"


class ProductSet(models.Model):
    """
    A bundle sold as one unit — typically one piece of each size in a range.

    Stock is held at two levels. A built set holds its pieces: those pieces have
    already left the individual products' counts, so nothing is counted twice.
    Breaking a set open puts them back. Every build and break moves pieces
    between the two levels and never creates or destroys any.
    """
    set_number = models.CharField(max_length=30, unique=True, editable=False)
    name = models.CharField(max_length=150, help_text="e.g. Sherwani set 34-46")
    item_type = models.ForeignKey(ItemType, on_delete=models.PROTECT, related_name="product_sets")
    warehouse = models.ForeignKey(WarehouseLocation, on_delete=models.PROTECT, related_name="product_sets")

    quantity = models.PositiveIntegerField(default=0, help_text="Complete sets in stock")
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    sale_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    barcode = models.CharField(max_length=60, unique=True, editable=False)
    barcode_svg = models.TextField(blank=True)
    previous_barcodes = models.TextField(blank=True, editable=False)
    tags_printed = models.BooleanField(default=False)

    active = models.BooleanField(default=True, db_index=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.set_number:
            self.set_number = _serial("SET", ProductSet)
        if not self.barcode:
            self.barcode = self.mint_barcode()
        super().save(*args, **kwargs)

    def mint_barcode(self):
        """Same disguised-price shape as a single garment, so one scanner reads both."""
        prefix, suffix, multiplier = barcode_rules()
        price = self.cost_price if barcode_price_source() == "COST" else self.sale_price
        for _ in range(40):
            code = _price_code(price, prefix, suffix, multiplier)
            if not ProductSet.objects.filter(barcode=code).exclude(pk=self.pk).exists() \
               and not FinishedProduct.objects.filter(barcode=code).exists():
                return code
        raise ValueError("Could not mint a unique barcode after 40 attempts.")

    def past_codes(self):
        return [c for c in (self.previous_barcodes or "").split(",") if c]

    def __str__(self):
        return f"{self.set_number} — {self.name}"


class ProductSetItem(models.Model):
    """One line of a set: which product, and how many of it each set holds."""
    product_set = models.ForeignKey(ProductSet, on_delete=models.CASCADE, related_name="items")
    finished_product = models.ForeignKey(FinishedProduct, on_delete=models.PROTECT, related_name="set_items")
    # Not fixed at one: a run might carry two of a middle size and one of the ends.
    pieces_per_set = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ["sort_order"]
        unique_together = [("product_set", "finished_product")]

    def __str__(self):
        return f"{self.pieces_per_set} x {self.finished_product.sku}"


# ─── sales orders (outbound) ──────────────────────────────────────────────────

class SalesOrder(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        PROCESSING = "PROCESSING", "Processing"
        READY = "READY", "Ready to Dispatch"
        DISPATCHED = "DISPATCHED", "Dispatched"
        DELIVERED = "DELIVERED", "Delivered"
        CANCELLED = "CANCELLED", "Cancelled"

    class PaymentMode(models.TextChoices):
        PAID = "PAID", "Fully Paid"
        CREDIT = "CREDIT", "Credit (Pay Later)"
        PARTIAL = "PARTIAL", "Partial Payment"

    order_number = models.CharField(max_length=30, unique=True, editable=False)
    buyer = models.ForeignKey(Buyer, on_delete=models.PROTECT, related_name="sales_orders")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REQUESTED)
    payment_mode = models.CharField(max_length=20, choices=PaymentMode.choices, default=PaymentMode.PAID)
    order_date = models.DateField(default=timezone.now)
    expected_delivery = models.DateField(null=True, blank=True)
    actual_delivery = models.DateField(null=True, blank=True)
    warehouse = models.ForeignKey(WarehouseLocation, on_delete=models.PROTECT, related_name="sales_orders")
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    discount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    cgst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    sgst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    igst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    amount_due = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True)

    # ─── shipment, recorded when the goods leave the warehouse ───────────────
    # The lorry receipt is the only proof the goods were handed over, and it is
    # what a buyer quotes when a parcel goes missing. Filled at dispatch.
    transporter_name = models.CharField(max_length=120, blank=True)
    lr_number = models.CharField(max_length=60, blank=True, help_text="Lorry receipt / consignment note number")
    vehicle_number = models.CharField(max_length=30, blank=True)
    driver_phone = models.CharField(max_length=20, blank=True)
    dispatch_date = models.DateField(null=True, blank=True)
    freight_charges = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    dispatch_notes = models.TextField(blank=True)
    dispatch_photos = models.TextField(blank=True, help_text="Comma-separated photo paths of the loaded parcel / LR copy")

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="sales_orders")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.order_number:
            self.order_number = _serial("SO", SalesOrder)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.order_number


class SalesOrderItem(models.Model):
    sales_order = models.ForeignKey(SalesOrder, on_delete=models.CASCADE, related_name="items")
    finished_product = models.ForeignKey(FinishedProduct, null=True, blank=True,
                                         on_delete=models.PROTECT, related_name="order_items")
    # A line is one or the other, never both — see the constraint below.
    product_set = models.ForeignKey("ProductSet", null=True, blank=True,
                                    on_delete=models.PROTECT, related_name="order_items")
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=12, decimal_places=2)
    notes = models.CharField(max_length=200, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(quantity__gt=0), name="salesorderitem_quantity_positive"),
            # Exactly one of the two, so a line always has something to sell and
            # stock is only ever taken from one place.
            models.CheckConstraint(
                condition=(Q(finished_product__isnull=False) & Q(product_set__isnull=True))
                          | (Q(finished_product__isnull=True) & Q(product_set__isnull=False)),
                name="salesorderitem_product_or_set",
            ),
        ]

    def save(self, *args, **kwargs):
        self.total_price = self.unit_price * self.quantity
        super().save(*args, **kwargs)


# ─── credit management ────────────────────────────────────────────────────────

class CreditTransaction(models.Model):
    class Status(models.TextChoices):
        OUTSTANDING = "OUTSTANDING", "Outstanding"
        PARTIAL = "PARTIAL", "Partially Paid"
        SETTLED = "SETTLED", "Fully Settled"
        OVERDUE = "OVERDUE", "Overdue"

    sales_order = models.OneToOneField(SalesOrder, on_delete=models.PROTECT, related_name="credit")
    buyer = models.ForeignKey(Buyer, on_delete=models.PROTECT, related_name="credit_transactions")
    total_amount = models.DecimalField(max_digits=14, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    amount_due = models.DecimalField(max_digits=14, decimal_places=2)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OUTSTANDING, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Credit {self.sales_order.order_number} — {self.buyer.name}"


class CreditPayment(models.Model):
    """Individual payment instalment against a credit transaction."""
    class PaymentMethod(models.TextChoices):
        CASH = "CASH", "Cash"
        UPI = "UPI", "UPI"
        NEFT = "NEFT", "NEFT / IMPS"
        CHEQUE = "CHEQUE", "Cheque"
        OTHER = "OTHER", "Other"

    payment_number = models.CharField(max_length=40, unique=True, editable=False, default="")
    credit = models.ForeignKey(CreditTransaction, on_delete=models.PROTECT, related_name="payments")
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    payment_date = models.DateField(default=timezone.now)
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    reference = models.CharField(max_length=100, blank=True, help_text="UTR / cheque number")
    notes = models.CharField(max_length=255, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-payment_date"]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="creditpayment_amount_positive"),
        ]

    def save(self, *args, **kwargs):
        if not self.payment_number:
            self.payment_number = _serial("CP", CreditPayment)
        super().save(*args, **kwargs)


# ─── OTP authentication ───────────────────────────────────────────────────────

# ─── returns ──────────────────────────────────────────────────────────────────

class BuyerReturn(models.Model):
    """A buyer returns finished goods to us — defect, wrong size, etc."""
    class Condition(models.TextChoices):
        RESTOCKABLE = "RESTOCKABLE", "Restockable"
        DAMAGED = "DAMAGED", "Damaged / Defective"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        RECEIVED = "RECEIVED", "Received"
        RESTOCKED = "RESTOCKED", "Restocked"
        DISCARDED = "DISCARDED", "Discarded"

    return_number = models.CharField(max_length=40, unique=True, editable=False)
    sales_order = models.ForeignKey(SalesOrder, null=True, blank=True, on_delete=models.SET_NULL, related_name="buyer_returns")
    buyer = models.ForeignKey(Buyer, on_delete=models.PROTECT, related_name="returns")
    finished_product = models.ForeignKey(FinishedProduct, on_delete=models.PROTECT, related_name="buyer_returns")
    quantity = models.PositiveIntegerField()
    condition = models.CharField(max_length=20, choices=Condition.choices, default=Condition.RESTOCKABLE)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    reason = models.TextField()
    warehouse = models.ForeignKey(WarehouseLocation, on_delete=models.PROTECT, related_name="buyer_returns")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.return_number:
            self.return_number = _serial("BR", BuyerReturn)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.return_number} — {self.buyer.name}"


class SupplierReturn(models.Model):
    """We return raw cloth or readymade goods back to a supplier."""
    class ReturnKind(models.TextChoices):
        RAW_CLOTH = "RAW_CLOTH", "Raw Cloth"
        READYMADE = "READYMADE", "Readymade Items"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        DISPATCHED = "DISPATCHED", "Dispatched"
        CONFIRMED = "CONFIRMED", "Confirmed by Supplier"

    return_number = models.CharField(max_length=40, unique=True, editable=False)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="returns")
    return_kind = models.CharField(max_length=20, choices=ReturnKind.choices)

    # For raw cloth returns
    raw_cloth_batch = models.ForeignKey(RawClothBatch, null=True, blank=True, on_delete=models.SET_NULL, related_name="supplier_returns")
    meters_returned = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # For readymade returns
    readymade_stock = models.ForeignKey(ReadymadeStock, null=True, blank=True, on_delete=models.SET_NULL, related_name="supplier_returns")
    quantity_returned = models.PositiveIntegerField(null=True, blank=True)

    reason = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    warehouse = models.ForeignKey(WarehouseLocation, on_delete=models.PROTECT, related_name="supplier_returns")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="supplier_returns_created")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.return_number:
            self.return_number = _serial("SR", SupplierReturn)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.return_number} — {self.supplier.name}"


# ─── expenses ─────────────────────────────────────────────────────────────────

class Expense(models.Model):
    class Category(models.TextChoices):
        UTILITIES    = "UTILITIES",    "Utilities (Electricity / Water)"
        RENT         = "RENT",         "Rent"
        MAINTENANCE  = "MAINTENANCE",  "Machine / Equipment Maintenance"
        TRANSPORT    = "TRANSPORT",    "Transport / Delivery"
        PACKAGING    = "PACKAGING",    "Packaging Material"
        LABOR        = "LABOR",        "Contract Labour"
        OTHER        = "OTHER",        "Other"

    class PaymentMethod(models.TextChoices):
        CASH   = "CASH",   "Cash"
        UPI    = "UPI",    "UPI"
        NEFT   = "NEFT",   "NEFT / IMPS"
        CHEQUE = "CHEQUE", "Cheque"
        OTHER  = "OTHER",  "Other"

    expense_number  = models.CharField(max_length=40, unique=True, editable=False)
    category        = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    amount          = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    expense_date    = models.DateField()
    description     = models.TextField()
    reference       = models.CharField(max_length=100, blank=True, help_text="Bill no / voucher / receipt ref")
    payment_method  = models.CharField(max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    proof_image     = models.TextField(blank=True, help_text="Base64-encoded proof / receipt photo")
    warehouse       = models.ForeignKey(WarehouseLocation, on_delete=models.PROTECT, related_name="expenses")
    created_by      = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="expenses_created")
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-expense_date", "-created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="expense_amount_positive"),
        ]

    def save(self, *args, **kwargs):
        if not self.expense_number:
            self.expense_number = _serial("EXP", Expense)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.expense_number} — {self.get_category_display()} ₹{self.amount}"


class RecurringSettlement(models.Model):
    """
    A payment that comes round every month — a salary, a rent, a subscription.

    Kept separate from Expense because an expense is money already gone. This is
    the standing instruction that says one will be due, and the Settlement rows
    it generates stay pending until someone confirms the money actually moved.
    """
    class Kind(models.TextChoices):
        SALARY      = "SALARY",      "Salary"
        RENT        = "RENT",        "Rent"
        UTILITIES   = "UTILITIES",   "Utilities"
        MAINTENANCE = "MAINTENANCE", "Maintenance"
        OTHER       = "OTHER",       "Other"

    # Which expense category the confirmed payment is booked under.
    EXPENSE_CATEGORY = {
        "SALARY": "LABOR", "RENT": "RENT", "UTILITIES": "UTILITIES",
        "MAINTENANCE": "MAINTENANCE", "OTHER": "OTHER",
    }

    name = models.CharField(max_length=150, help_text="Who or what is paid — 'Ravi (tailor)', 'Godown rent'")
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.OTHER)
    amount = models.DecimalField(max_digits=12, decimal_places=2,
                                 validators=[MinValueValidator(Decimal("0.01"))])
    employee = models.ForeignKey(EmployeeProfile, null=True, blank=True,
                                 on_delete=models.SET_NULL, related_name="settlements")
    warehouse = models.ForeignKey(WarehouseLocation, on_delete=models.PROTECT,
                                  related_name="recurring_settlements")
    day_of_month = models.PositiveSmallIntegerField(
        default=1, help_text="Day the payment is due. Clamped to the last day in short months.")
    active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["kind", "name"]

    def __str__(self):
        return f"{self.name} — {self.get_kind_display()} ₹{self.amount}/month"


class Settlement(models.Model):
    """One month's instance of a recurring payment, pending until confirmed."""
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PAID    = "PAID",    "Paid"
        SKIPPED = "SKIPPED", "Skipped"

    settlement_number = models.CharField(max_length=40, unique=True, editable=False)
    recurring = models.ForeignKey(RecurringSettlement, null=True, blank=True,
                                  on_delete=models.SET_NULL, related_name="settlements")
    # Name, kind and amount are copied rather than read through the template:
    # raising someone's salary must not silently restate what was paid last month.
    name = models.CharField(max_length=150)
    kind = models.CharField(max_length=20, choices=RecurringSettlement.Kind.choices,
                            default=RecurringSettlement.Kind.OTHER)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    period = models.DateField(help_text="First day of the month this belongs to")
    due_date = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    paid_on = models.DateField(null=True, blank=True)
    payment_method = models.CharField(max_length=20, choices=Expense.PaymentMethod.choices,
                                      default=Expense.PaymentMethod.CASH)
    reference = models.CharField(max_length=100, blank=True)
    # Set only once the money has moved, so the books and this list cannot disagree.
    expense = models.OneToOneField(Expense, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="settlement")
    warehouse = models.ForeignKey(WarehouseLocation, on_delete=models.PROTECT,
                                  related_name="settlements")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period", "kind", "name"]
        # One row per template per month, so generating twice is harmless.
        constraints = [
            models.UniqueConstraint(fields=["recurring", "period"],
                                    name="one_settlement_per_template_per_month"),
        ]

    def save(self, *args, **kwargs):
        if not self.settlement_number:
            self.settlement_number = _serial("STL", Settlement)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.settlement_number} — {self.name} ({self.period:%b %Y})"


# ─── supplier payment tracking ────────────────────────────────────────────────

class SupplierPayment(models.Model):
    """Payment instalment recorded against a PurchaseBill (supplier payment tracking)."""
    class PaymentMode(models.TextChoices):
        CASH = "CASH", "Cash"
        BANK_TRANSFER = "BANK_TRANSFER", "Bank Transfer / NEFT"
        UPI = "UPI", "UPI"
        CHEQUE = "CHEQUE", "Cheque"

    payment_number = models.CharField(max_length=40, unique=True, editable=False)
    bill = models.ForeignKey(PurchaseBill, on_delete=models.CASCADE, related_name="supplier_payments")
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    payment_date = models.DateField(default=timezone.now)
    payment_mode = models.CharField(max_length=20, choices=PaymentMode.choices, default=PaymentMode.CASH)
    reference = models.CharField(max_length=100, blank=True, help_text="UTR / cheque number / transaction ID")
    notes = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="supplier_payments")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-payment_date", "-created_at"]

    def save(self, *args, **kwargs):
        if not self.payment_number:
            self.payment_number = _serial("PAY", SupplierPayment)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.payment_number} — ₹{self.amount} for {self.bill.bill_number}"


# ─── stock adjustments ────────────────────────────────────────────────────────

class StockAdjustment(models.Model):
    """Manual stock correction — damage, loss, QC rejection, or found items."""
    class ItemKind(models.TextChoices):
        RAW_CLOTH = "RAW_CLOTH", "Raw Cloth (meters)"
        FINISHED_PRODUCT = "FINISHED_PRODUCT", "Finished Product (pieces)"

    class AdjustmentType(models.TextChoices):
        DAMAGE = "DAMAGE", "Damage / Write-off"
        LOSS = "LOSS", "Loss / Theft"
        QC_REJECT = "QC_REJECT", "QC Rejection"
        CORRECTION = "CORRECTION", "Stock Correction"
        FOUND = "FOUND", "Found / Surplus"

    adjustment_number = models.CharField(max_length=40, unique=True, editable=False)
    item_kind = models.CharField(max_length=20, choices=ItemKind.choices)
    raw_cloth_batch = models.ForeignKey(
        RawClothBatch, null=True, blank=True, on_delete=models.PROTECT, related_name="stock_adjustments"
    )
    finished_product = models.ForeignKey(
        FinishedProduct, null=True, blank=True, on_delete=models.PROTECT, related_name="stock_adjustments"
    )
    # Positive = add stock; Negative = reduce stock
    quantity_change = models.DecimalField(
        max_digits=10, decimal_places=2,
        help_text="Positive to add stock, negative to remove (e.g. -5.5 meters or -3 pieces)"
    )
    adjustment_type = models.CharField(max_length=20, choices=AdjustmentType.choices, default=AdjustmentType.DAMAGE)
    reason = models.TextField()
    warehouse = models.ForeignKey(WarehouseLocation, on_delete=models.PROTECT, related_name="stock_adjustments")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="stock_adjustments")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.adjustment_number:
            self.adjustment_number = _serial("ADJ", StockAdjustment)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.adjustment_number} — {self.get_adjustment_type_display()} ({self.quantity_change:+})"


class FCMToken(models.Model):
    """Firebase Cloud Messaging registration token for browser push notifications."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="fcm_tokens", null=True, blank=True,
    )
    token = models.CharField(max_length=512, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "warehouse_fcm_tokens"

    def __str__(self):
        return f"FCM token for {self.user_id}"


class OTPCode(models.Model):
    class Purpose(models.TextChoices):
        LOGIN = "LOGIN", "Login"
        RESET_PASSWORD = "RESET_PASSWORD", "Reset Password"

    class Channel(models.TextChoices):
        EMAIL = "EMAIL", "Email"
        SMS = "SMS", "SMS"
        WHATSAPP = "WHATSAPP", "WhatsApp"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="otp_codes")
    code = models.CharField(max_length=128)
    purpose = models.CharField(max_length=20, choices=Purpose.choices, db_index=True)
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.EMAIL)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False, db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def is_valid(self):
        return not self.used and timezone.now() < self.expires_at and self.attempts < 5

    def __str__(self):
        return f"OTP {self.purpose} for {self.user.username}"


# ─── notifications ────────────────────────────────────────────────────────────

class Notification(models.Model):
    class Level(models.TextChoices):
        INFO = "INFO", "Information"
        WARNING = "WARNING", "Warning"
        CRITICAL = "CRITICAL", "Critical"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="notifications", on_delete=models.CASCADE
    )
    title = models.CharField(max_length=180)
    message = models.TextField()
    level = models.CharField(max_length=20, choices=Level.choices, default=Level.INFO)
    link = models.CharField(max_length=200, blank=True, help_text="Frontend tab/anchor to navigate on click")
    read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


# ─── audit log ────────────────────────────────────────────────────────────────

class AuditLog(models.Model):
    entity_type = models.CharField(max_length=64)
    entity_id = models.CharField(max_length=64)
    action = models.CharField(max_length=64)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    actor_name = models.CharField(max_length=150)
    detail = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "warehouse_audit_logs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} on {self.entity_type}#{self.entity_id} by {self.actor_name}"


# ─── reorder points ───────────────────────────────────────────────────────────

class Quotation(models.Model):
    class Status(models.TextChoices):
        DRAFT    = "DRAFT",    "Draft"
        SENT     = "SENT",     "Sent to Buyer"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        EXPIRED  = "EXPIRED",  "Expired"

    quotation_number = models.CharField(max_length=30, unique=True, editable=False)
    buyer = models.ForeignKey(Buyer, on_delete=models.PROTECT, related_name="quotations")
    warehouse = models.ForeignKey(WarehouseLocation, on_delete=models.PROTECT, related_name="quotations")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    validity_date = models.DateField(null=True, blank=True)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    discount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="quotations_created")
    converted_to = models.OneToOneField(SalesOrder, null=True, blank=True, on_delete=models.SET_NULL, related_name="from_quotation")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.quotation_number:
            self.quotation_number = _serial("QT", Quotation)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.quotation_number


class QuotationItem(models.Model):
    quotation = models.ForeignKey(Quotation, on_delete=models.CASCADE, related_name="items")
    finished_product = models.ForeignKey(FinishedProduct, on_delete=models.PROTECT, related_name="quotation_items")
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=12, decimal_places=2)

    def save(self, *args, **kwargs):
        self.total_price = self.unit_price * self.quantity
        super().save(*args, **kwargs)


class ReorderPoint(models.Model):
    """Per-item/category stock threshold — triggers alert when current stock falls below."""
    class ItemKind(models.TextChoices):
        RAW_CLOTH = "RAW_CLOTH", "Raw Cloth"
        FINISHED = "FINISHED", "Finished Product"

    item_kind = models.CharField(max_length=20, choices=ItemKind.choices)
    # Raw cloth fields
    cloth_category = models.ForeignKey(ClothCategory, null=True, blank=True, on_delete=models.CASCADE, related_name="reorder_points")
    cloth_color = models.ForeignKey(ClothColor, null=True, blank=True, on_delete=models.SET_NULL, related_name="reorder_points")
    threshold_meters = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # Finished product fields
    item_type = models.ForeignKey(ItemType, null=True, blank=True, on_delete=models.CASCADE, related_name="reorder_points")
    size = models.CharField(max_length=30, blank=True)
    threshold_pieces = models.PositiveIntegerField(null=True, blank=True)

    warehouse = models.ForeignKey(WarehouseLocation, on_delete=models.CASCADE, related_name="reorder_points")
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["item_kind", "warehouse__name"]

    def __str__(self):
        if self.item_kind == "RAW_CLOTH":
            return f"Reorder: {self.cloth_category} @ {self.warehouse.name} < {self.threshold_meters}m"
        return f"Reorder: {self.item_type} {self.size} @ {self.warehouse.name} < {self.threshold_pieces}pcs"


# ─── inter-warehouse stock transfers ──────────────────────────────────────────

class StockTransfer(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending Dispatch"
        IN_TRANSIT = "IN_TRANSIT", "In Transit"
        RECEIVED = "RECEIVED", "Received"
        CANCELLED = "CANCELLED", "Cancelled"

    class TransferKind(models.TextChoices):
        RAW_CLOTH = "RAW_CLOTH", "Raw Cloth"
        FINISHED = "FINISHED", "Finished Products"

    transfer_number = models.CharField(max_length=30, unique=True, editable=False)
    from_warehouse = models.ForeignKey(WarehouseLocation, on_delete=models.PROTECT, related_name="transfers_out")
    to_warehouse = models.ForeignKey(WarehouseLocation, on_delete=models.PROTECT, related_name="transfers_in")
    transfer_kind = models.CharField(max_length=20, choices=TransferKind.choices)
    # Raw cloth transfer
    raw_cloth_batch = models.ForeignKey(RawClothBatch, null=True, blank=True, on_delete=models.SET_NULL, related_name="transfers")
    meters_to_transfer = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # Finished product transfer
    finished_product = models.ForeignKey(FinishedProduct, null=True, blank=True, on_delete=models.SET_NULL, related_name="transfers")
    quantity_to_transfer = models.PositiveIntegerField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="stock_transfers_created")
    dispatched_at = models.DateTimeField(null=True, blank=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="stock_transfers_received")
    received_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.transfer_number:
            self.transfer_number = _serial("TR", StockTransfer)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.transfer_number


# ─── parcel inspection ────────────────────────────────────────────────────────

class ParcelInspection(models.Model):
    """Formal inspection record when a PO parcel is opened at the warehouse."""
    class Condition(models.TextChoices):
        GOOD = "GOOD", "Good Condition"
        PARTIAL_DAMAGE = "PARTIAL_DAMAGE", "Partial Damage"
        DAMAGED = "DAMAGED", "Damaged"

    purchase_order = models.OneToOneField(PurchaseOrder, on_delete=models.CASCADE, related_name="parcel_inspection")
    inspected_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="parcel_inspections")
    inspection_date = models.DateField()
    parcel_condition = models.CharField(max_length=20, choices=Condition.choices, default=Condition.GOOD)
    quantity_check_passed = models.BooleanField(default=True)
    discrepancy_notes = models.TextField(blank=True)
    photos = models.TextField(blank=True, help_text="Comma-separated base64 photo strings")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Inspection {self.purchase_order.po_number} — {self.get_parcel_condition_display()}"


# ─── system settings ──────────────────────────────────────────────────────────

class SystemSettings(models.Model):
    app_name = models.CharField(max_length=60, default="GarmentFlow")
    app_subtitle = models.CharField(max_length=80, default="Garment ERP")
    logo_url = models.TextField(blank=True)
    primary_color = models.CharField(max_length=7, default="#1a1a2e")
    accent_color = models.CharField(max_length=7, default="#c9963c")
    default_dark_mode = models.BooleanField(default=False)
    company_name = models.CharField(max_length=100, default="My Garment Business")
    company_state = models.CharField(max_length=50, blank=True, default="Tamil Nadu", help_text="State for CGST/SGST vs IGST determination")
    currency_symbol = models.CharField(max_length=5, default="₹")
    tax_percent = models.DecimalField(max_digits=5, decimal_places=2, default=18)
    smtp_host = models.CharField(max_length=200, blank=True)
    smtp_port = models.PositiveSmallIntegerField(default=587)
    smtp_user = models.CharField(max_length=200, blank=True)
    smtp_password = models.CharField(max_length=200, blank=True)
    smtp_use_tls = models.BooleanField(default=True)
    smtp_from_email = models.EmailField(blank=True)
    email_enabled = models.BooleanField(default=False)
    twilio_account_sid = models.CharField(max_length=200, blank=True)
    twilio_auth_token = models.CharField(max_length=200, blank=True)
    twilio_from_number = models.CharField(max_length=20, blank=True)
    sms_enabled = models.BooleanField(default=False)
    # WhatsApp (Meta Graph API)
    wa_token = models.CharField(max_length=512, blank=True, help_text="Meta WhatsApp Business access token")
    wa_phone_number_id = models.CharField(max_length=64, blank=True, help_text="Meta WhatsApp Phone Number ID")
    wa_enabled = models.BooleanField(default=False)
    # Firebase Cloud Messaging
    firebase_service_account_json = models.TextField(blank=True, help_text="Full Firebase service account JSON string")
    fcm_enabled = models.BooleanField(default=False)
    otp_expiry_minutes = models.PositiveSmallIntegerField(default=10)
    allow_otp_login = models.BooleanField(default=True)
    # Print / document layout
    print_company_address = models.TextField(blank=True, help_text="Address shown on printed documents")
    print_bank_details = models.TextField(blank=True, help_text="Bank account details printed at bottom of invoices/quotations")
    print_terms = models.TextField(blank=True, default="All disputes subject to local jurisdiction.", help_text="Terms & conditions printed on documents")
    print_signature_label = models.CharField(max_length=80, blank=True, default="Authorised Signatory", help_text="Label under signature line")
    print_show_logo = models.BooleanField(default=True, help_text="Show company logo on printed documents")
    # GST / ITC
    gst_on_purchases = models.BooleanField(default=False, help_text="Apply GST on purchase bills (Input Tax Credit)")
    gstin = models.CharField(max_length=15, blank=True, help_text="Company GSTIN — printed on purchase bills")
    # Product tag layout
    tag_brand_name = models.CharField(max_length=80, blank=True, help_text="Brand name on tags (defaults to company name)")
    tag_tagline = models.CharField(max_length=120, blank=True, help_text="Tagline under brand name on tags")
    tag_show_barcode = models.BooleanField(default=True, help_text="Show barcode on printed tags")
    tag_show_sku = models.BooleanField(default=True, help_text="Show SKU code on printed tags")
    tag_show_color = models.BooleanField(default=True, help_text="Show cloth color on printed tags")
    tag_show_age_group = models.BooleanField(default=True, help_text="Show age group on printed tags")
    tag_footer_text = models.CharField(max_length=120, blank=True, help_text="Footer text on tags (e.g. '100% Cotton · Made in India')")
    tag_printer_width = models.CharField(max_length=5, default="58mm", help_text="Thermal paper width: 58mm or 80mm")
    tag_show_price = models.BooleanField(default=True, help_text="Show sale price on printed tags")
    tag_show_size = models.BooleanField(default=True, help_text="Show size on printed tags")
    tag_brand_font_size = models.IntegerField(default=14, help_text="Brand name font size on tag (pt)")
    tag_logo_size = models.IntegerField(default=30, help_text="Logo height on tag (px)")
    tag_logo_data = models.TextField(blank=True, help_text="Base64 logo for tags (b&w, small)")
    tag_component_order = models.JSONField(default=list, blank=True, help_text="Ordered list of tag component keys")
    tag_height_mm = models.IntegerField(default=65, help_text="Tag print area height in mm (white section only)")
    tag_width_mm = models.IntegerField(default=54, help_text="Tag print area width in mm (white section only)")
    # Tag layout — tuned from Settings so the print can be matched to the
    # physical card without a redeploy. Padding defaults clear the holographic
    # foil strip down the left of the Sri Wedding card.
    tag_align = models.CharField(max_length=6, default="left", help_text="Tag text alignment: left, center or right")
    tag_pad_top = models.FloatField(default=3.0, help_text="Tag top padding (mm)")
    tag_pad_right = models.FloatField(default=1.5, help_text="Tag right padding (mm)")
    tag_pad_bottom = models.FloatField(default=3.0, help_text="Tag bottom padding (mm)")
    tag_pad_left = models.FloatField(default=13.0, help_text="Tag left padding (mm) — clears the foil strip")
    tag_gap_mm = models.FloatField(default=1.2, help_text="Vertical gap between tag rows (mm)")
    tag_vertical_align = models.CharField(max_length=8, default="center", help_text="Vertical placement: top, center or bottom")
    tag_barcode_height_mm = models.FloatField(default=18.0, help_text="Barcode height on tag (mm)")
    tag_barcode_text_font_size = models.FloatField(default=8.5, help_text="Barcode number font size (pt)")
    tag_name_font_size = models.FloatField(default=12.0, help_text="Item name font size (pt)")
    tag_desc_font_size = models.FloatField(default=8.0, help_text="Colour / size font size (pt)")
    tag_price_font_size = models.FloatField(default=12.0, help_text="MRP font size (pt)")
    tag_sku_font_size = models.FloatField(default=6.5, help_text="SKU font size (pt)")
    barcode_prefix_digits = models.PositiveSmallIntegerField(
        default=BARCODE_PREFIX_DEFAULT,
        help_text="Random digits before the price in a product barcode (0-6)")
    barcode_suffix_digits = models.PositiveSmallIntegerField(
        default=BARCODE_SUFFIX_DEFAULT,
        help_text="Random digits after the price in a product barcode (0-6)")
    barcode_price_multiplier = models.DecimalField(
        max_digits=6, decimal_places=3, default=BARCODE_MULTIPLIER_DEFAULT,
        help_text="Cost is multiplied by this before going into the barcode, so "
                  "the figure does not read as a price. Divide by it to get the cost back.")
    barcode_price_source = models.CharField(
        max_length=10, default="COST",
        choices=[("COST", "Cost price"), ("SALE", "Sale price")],
        help_text="Which price is buried in a product barcode. Cost keeps a "
                  "figure the customer cannot read off the tag; the sale price "
                  "is already printed on it.")
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="settings_updates"
    )

    class Meta:
        verbose_name = "System settings"
        verbose_name_plural = "System settings"

    @classmethod
    def load(cls):
        from django.core.cache import cache
        obj = cache.get("system_settings")
        if obj is None:
            obj, _ = cls.objects.get_or_create(pk=1)
            cache.set("system_settings", obj, 300)
        return obj

    def save(self, *args, **kwargs):
        from django.core.cache import cache
        super().save(*args, **kwargs)
        cache.delete("system_settings")

    def __str__(self):
        return f"System settings — {self.app_name}"


def barcode_rules():
    """
    Random digit counts either side, and the multiplier that disguises the price.

    Falls back to defaults if settings cannot be read — minting a barcode must
    never be the thing that fails, and a default-shaped code is still a valid,
    unique code.
    """
    fallback = (BARCODE_PREFIX_DEFAULT, BARCODE_SUFFIX_DEFAULT, BARCODE_MULTIPLIER_DEFAULT)
    try:
        s = SystemSettings.load()
        prefix = min(max(int(s.barcode_prefix_digits), 0), BARCODE_PAD_MAX)
        suffix = min(max(int(s.barcode_suffix_digits), 0), BARCODE_PAD_MAX)
        multiplier = Decimal(str(s.barcode_price_multiplier or BARCODE_MULTIPLIER_DEFAULT))
    except Exception:
        return fallback
    # No random digits at all would give every product at one cost the same code.
    if prefix + suffix == 0:
        prefix, suffix = BARCODE_PREFIX_DEFAULT, BARCODE_SUFFIX_DEFAULT
    if multiplier <= 0:
        multiplier = BARCODE_MULTIPLIER_DEFAULT
    return prefix, suffix, multiplier


def barcode_price_source():
    """COST or SALE — which price goes inside a product barcode."""
    try:
        value = (SystemSettings.load().barcode_price_source or "COST").upper()
    except Exception:
        return "COST"
    return value if value in ("COST", "SALE") else "COST"
