"""
Garment ERP — core domain models.
Covers: cloth master data, supplier/buyer registry, purchase & sales orders,
raw cloth batches, cutting assignments, stitching jobs, finished products,
barcode tags, credit transactions, OTP auth, notifications, and system settings.
"""
import random
import string
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


# ─── helpers ──────────────────────────────────────────────────────────────────

def _serial(prefix: str, model) -> str:
    """Generate next sequential number like PO-202406-0042."""
    stamp = timezone.now().strftime("%Y%m")
    last = (
        model.objects.filter(**{f"{model._meta.pk.name}__isnull": False})
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
    role = models.CharField(max_length=50, choices=Role.choices, default=Role.STORE_KEEPER)
    phone = models.CharField(max_length=20, blank=True)
    locations = models.ManyToManyField(WarehouseLocation, related_name="employees", blank=True)
    active = models.BooleanField(default=True)
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
    size = models.CharField(max_length=30, blank=True)
    ordered_quantity = models.PositiveIntegerField(default=0)
    received_quantity = models.PositiveIntegerField(default=0)

    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    notes = models.CharField(max_length=255, blank=True)

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
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    payment_status = models.CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)
    notes = models.TextField(blank=True)
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
    size = models.CharField(max_length=30, blank=True)
    quantity = models.PositiveIntegerField(default=0)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

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
    active = models.BooleanField(default=True)
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
    cloth_color = models.ForeignKey(ClothColor, null=True, blank=True, on_delete=models.SET_NULL, related_name="readymade_stocks")
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

class FinishedProduct(models.Model):
    """A tagged, ready-to-sell garment — either stitched in-house or imported."""
    class Source(models.TextChoices):
        IN_HOUSE = "IN_HOUSE", "In-house (Stitched)"
        IMPORTED = "IMPORTED", "Imported (Readymade)"

    sku = models.CharField(max_length=60, unique=True, editable=False)
    item_type = models.ForeignKey(ItemType, on_delete=models.PROTECT, related_name="finished_products")
    cloth_category = models.ForeignKey(ClothCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name="finished_products")
    cloth_color = models.ForeignKey(ClothColor, null=True, blank=True, on_delete=models.SET_NULL, related_name="finished_products")
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
    tags_printed = models.BooleanField(default=False)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.sku:
            self.sku = _serial("FP", FinishedProduct)
        if not self.barcode:
            self.barcode = f"GRM{timezone.now().strftime('%y%m%d')}" + "".join(random.choices(string.digits, k=6))
        super().save(*args, **kwargs)

    @property
    def profit_margin(self):
        if self.cost_price and self.sale_price:
            return self.sale_price - self.cost_price
        return Decimal("0.00")

    def __str__(self):
        return f"{self.sku} — {self.item_type}"


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
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    amount_due = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True)
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
    finished_product = models.ForeignKey(FinishedProduct, on_delete=models.PROTECT, related_name="order_items")
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=12, decimal_places=2)
    notes = models.CharField(max_length=200, blank=True)

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
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OUTSTANDING)
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
    code = models.CharField(max_length=6)
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.EMAIL)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)
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
    read = models.BooleanField(default=False)
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


# ─── system settings ──────────────────────────────────────────────────────────

class SystemSettings(models.Model):
    app_name = models.CharField(max_length=60, default="GarmentFlow")
    app_subtitle = models.CharField(max_length=80, default="Garment ERP")
    logo_url = models.TextField(blank=True)
    primary_color = models.CharField(max_length=7, default="#1a1a2e")
    accent_color = models.CharField(max_length=7, default="#c9963c")
    default_dark_mode = models.BooleanField(default=False)
    company_name = models.CharField(max_length=100, default="My Garment Business")
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
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="settings_updates"
    )

    class Meta:
        verbose_name = "System settings"
        verbose_name_plural = "System settings"

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return f"System settings — {self.app_name}"
