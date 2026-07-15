import type { Tab } from "@/app/types";

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Administrator",
  ADMIN: "Administrator",
  MANAGER: "Manager",
  STORE_KEEPER: "Store Keeper",
  CUTTING_MASTER: "Cutting Master",
  TAILOR: "Tailor / Maker",
  AUDITOR: "Auditor",
};

export const PO_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft", PLACED: "Placed", DISPATCHED: "Dispatched",
  RECEIVED: "Received", VERIFIED: "Verified", CANCELLED: "Cancelled",
};

export const SO_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Requested", PROCESSING: "Processing", READY: "Ready",
  DISPATCHED: "Dispatched", DELIVERED: "Delivered", CANCELLED: "Cancelled",
};

export const CUTTING_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending", IN_PROGRESS: "In Progress",
  COMPLETED: "Completed", PARTIAL: "Partially Done",
};

export const STITCHING_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Received", PROCESSING: "Processing", QC_CHECK: "QC Check",
  READY: "Ready", REJECTED: "Rejected / Rework",
};

export const CREDIT_STATUS_LABELS: Record<string, string> = {
  OUTSTANDING: "Outstanding", PARTIAL: "Partially Paid",
  SETTLED: "Settled", OVERDUE: "Overdue",
};

export const SUPPLY_TYPE_LABELS: Record<string, string> = {
  RAW_CLOTH: "Raw Cloth", READYMADE: "Readymade", BOTH: "Both",
};

export const BUYER_TYPE_LABELS: Record<string, string> = {
  WHOLESALE: "Wholesale", RETAIL: "Retail", EXPORT: "Export",
};

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  PAID: "Fully Paid", CREDIT: "Credit", PARTIAL: "Partial",
};

export const TAB_TITLES: Record<Tab, string> = {
  dashboard: "Dashboard",
  analytics: "Analytics",
  suppliers: "Suppliers",
  buyers: "Buyers",
  purchase_orders: "Purchase Orders",
  purchase_bills: "Purchase Bills",
  raw_cloth: "Raw Cloth",
  readymade_stock: "Readymade Stock",
  cutting: "Cutting",
  stitching: "Stitching",
  finished_products: "Finished Goods",
  sales_orders: "Sales Orders",
  credit: "Credit",
  returns: "Returns",
  expenses: "Expenses",
  employees: "Employees",
  warehouses: "Warehouses",
  notifications: "Notifications",
  audit_log: "Audit Log",
  settings: "Settings",
  profile: "My Profile",
};

export const STATUS_BADGE_COLORS: Record<string, string> = {
  DRAFT: "#555", PLACED: "#2196f3", DISPATCHED: "#ff9800",
  RECEIVED: "#4caf50", VERIFIED: "#1b5e20", CANCELLED: "#f44336",
  REQUESTED: "#9c27b0", PROCESSING: "#ff9800", READY: "#03a9f4",
  DELIVERED: "#4caf50", PENDING: "#ff9800", IN_PROGRESS: "#2196f3",
  COMPLETED: "#4caf50", PARTIAL: "#ff9800", SETTLED: "#4caf50",
  OUTSTANDING: "#f44336", OVERDUE: "#b71c1c", QC_CHECK: "#9c27b0",
  REJECTED: "#f44336", RESTOCKED: "#4caf50", DISCARDED: "#f44336",
  CONFIRMED: "#4caf50",
};
