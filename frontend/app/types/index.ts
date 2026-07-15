// ─── master data ─────────────────────────────────────────────────────────────

export interface ClothCategory { id: string; name: string; description: string; active: boolean }
export interface ClothColor { id: string; name: string; hexCode: string; active: boolean }
export interface ItemType { id: string; name: string; category: string; clothLengthPerPiece: number; active: boolean }
export interface WarehouseLocation { id: string; name: string; code: string; locationType: string; city: string; state: string; address: string; phone: string; active: boolean }

// ─── people ───────────────────────────────────────────────────────────────────

export interface Employee {
  id: string; username: string; email: string; role: string; phone: string; active: boolean
  locations: WarehouseLocation[]; createdAt: string
}

// ─── suppliers & buyers ───────────────────────────────────────────────────────

export interface Supplier {
  id: string; name: string; contactPerson: string; email: string; phone: string
  whatsapp: string; address: string; city: string; state: string; gstin: string
  supplyType: string; creditDays: number; notes: string; active: boolean
}

export interface Buyer {
  id: string; name: string; contactPerson: string; email: string; phone: string
  whatsapp: string; address: string; city: string; state: string; gstin: string
  buyerType: string; creditLimit: number; notes: string; active: boolean
}

// ─── purchase orders ─────────────────────────────────────────────────────────

export interface POItem {
  id: string; itemKind: string; clothCategory?: ClothCategory; clothColor?: ClothColor
  orderedMeters?: number; receivedMeters?: number; itemType?: ItemType
  itemName?: string; size?: string; orderedQuantity?: number; receivedQuantity?: number
  unitPrice: number; totalPrice: number; notes: string
}

export interface PurchaseOrder {
  id: string; poNumber: string; supplier: Supplier; orderType: string; status: string
  orderDate: string; expectedDelivery?: string; actualDelivery?: string
  warehouse: WarehouseLocation; totalAmount: number; notes: string
  items: POItem[]; createdAt: string
}

// ─── inventory ────────────────────────────────────────────────────────────────

export interface RawClothBatch {
  id: string; batchNumber: string; supplier: Supplier; clothCategory: ClothCategory
  clothColor: ClothColor; warehouse: WarehouseLocation; totalMeters: number
  availableMeters: number; costPerMeter: number; binLocation: string; receivedDate: string
}

export interface ReadymadeStock {
  id: string; itemType: ItemType; clothColor?: ClothColor; size: string
  warehouse: WarehouseLocation; quantityReceived: number; quantityAvailable: number
  costPrice: number; receivedDate: string; supplier: Supplier
}

// ─── production ───────────────────────────────────────────────────────────────

export interface CuttingAssignment {
  id: string; assignmentNumber: string; rawClothBatch: RawClothBatch
  cuttingMaster: Employee; itemType: ItemType; metersAssigned: number
  targetPieces: number; status: string; assignedDate: string; dueDate?: string
  piecesCompleted: number; clothUsed: number; clothWasted: number; completedDate?: string; notes: string
}

export interface StitchingJob {
  id: string; jobNumber: string; cuttingAssignment: CuttingAssignment
  tailor: Employee; piecesAssigned: number; status: string
  assignedDate: string; dueDate?: string; piecesCompleted: number
  piecesRejected: number; completedDate?: string; notes: string
}

// ─── finished products ────────────────────────────────────────────────────────

export interface FinishedProduct {
  id: string; sku: string; itemType: ItemType; clothCategory?: ClothCategory
  clothColor?: ClothColor; size: string; source: string; quantity: number
  warehouse: WarehouseLocation; costPrice: number; salePrice: number
  profitMargin: number; barcode: string; barcodeSvg: string; tagsPrinted: boolean; createdAt: string
}

// ─── sales orders ─────────────────────────────────────────────────────────────

export interface SOItem {
  id: string; finishedProduct: FinishedProduct; quantity: number; unitPrice: number; totalPrice: number
}

export interface SalesOrder {
  id: string; orderNumber: string; buyer: Buyer; status: string; paymentMode: string
  orderDate: string; expectedDelivery?: string; actualDelivery?: string
  warehouse: WarehouseLocation; subtotal: number; discount: number; totalAmount: number
  amountPaid: number; amountDue: number; notes: string; items: SOItem[]; createdAt: string
}

// ─── credit ───────────────────────────────────────────────────────────────────

export interface CreditPayment {
  id: string; amount: number; paymentDate: string; paymentMethod: string; reference: string; notes: string
}

export interface CreditTransaction {
  id: string; salesOrder: SalesOrder; buyer: Buyer; totalAmount: number
  amountPaid: number; amountDue: number; dueDate?: string; status: string
  payments: CreditPayment[]; createdAt: string
}

// ─── returns ─────────────────────────────────────────────────────────────────

export interface BuyerReturn {
  id: string; returnNumber: string; buyer: Buyer; finishedProduct: FinishedProduct
  quantity: number; condition: string; status: string; reason: string
  warehouse: WarehouseLocation; createdAt: string
}

export interface SupplierReturn {
  id: string; returnNumber: string; supplier: Supplier; returnKind: string
  rawClothBatch?: RawClothBatch; metersReturned?: number
  readymadeStock?: ReadymadeStock; quantityReturned?: number
  reason: string; status: string; warehouse: WarehouseLocation; createdAt: string
}

// ─── notifications ────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string; title: string; message: string; level: string; read: boolean; link: string; createdAt: string
}
export type Notification = NotificationItem

// ─── audit log ────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string; entityType: string; entityId: string; action: string
  actorName: string; detail: Record<string, unknown>; createdAt: string
}

// ─── dashboard ────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalRawMeters: number; totalFinishedPieces: number; readymadePieces: number
  inhousePieces: number; activePurchaseOrders: number; activeSalesOrders: number
  cuttingInProgress: number; stitchingInProgress: number; creditOutstanding: number
  revenueThisMonth: number; revenueThisYear: number; totalSuppliers: number; totalBuyers: number
}

// ─── app shell ────────────────────────────────────────────────────────────────

export interface AppSettings {
  appName: string; appSubtitle: string; logoUrl: string
  primaryColor: string; accentColor: string; defaultDarkMode: boolean
}

export interface SystemSettings extends AppSettings {
  smtpHost: string; smtpPort: number; smtpUser: string; smtpPassword: string
  smtpFromEmail: string; emailEnabled: boolean
  twilioSid: string; twilioToken: string; twilioFrom: string; smsEnabled: boolean
  waToken: string; waPhoneNumberId: string; waEnabled: boolean
  firebaseServiceAccountJson: string; fcmEnabled: boolean
  otpExpiryMinutes: number; allowOtpLogin: boolean
  companyName: string; currencySymbol: string; taxPercent: number
}

export type Tab =
  | "dashboard" | "analytics" | "suppliers" | "buyers"
  | "purchase_orders" | "purchase_bills" | "raw_cloth" | "readymade_stock"
  | "cutting" | "stitching" | "finished_products"
  | "sales_orders" | "credit" | "returns"
  | "employees" | "warehouses" | "notifications" | "audit_log" | "settings" | "profile"

export interface Modal {
  type: string
  data?: Record<string, unknown>
}

export interface ConfirmState {
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
}
