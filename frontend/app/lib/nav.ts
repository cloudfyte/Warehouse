import type { Tab } from "@/app/types";
import { TAB_TITLES } from "@/app/lib/constants";

export interface SidebarSection { label: string; tabs: Tab[] }

/**
 * The sidebar, and the only list of it.
 *
 * Roles & Permissions used to keep a second copy of every tab with its own
 * labels and its own grouping, so the two drifted: tabs that no longer existed
 * were still offered there, and new ones could not be granted at all. Both the
 * sidebar and the permission editor read this.
 */
export const SIDEBAR_SECTIONS: SidebarSection[] = [
  { label: "Overview", tabs: ["dashboard", "analytics"] },
  { label: "Purchasing", tabs: ["suppliers", "purchase_orders", "purchase_bills"] },
  { label: "Inventory", tabs: ["raw_cloth", "readymade_stock", "stock_adjustments", "stock_transfers", "reorder_points", "retail_dispatches"] },
  { label: "Production", tabs: ["cutting", "stitching", "jobwork", "karigars", "customer_bills", "finished_products", "product_sets"] },
  { label: "Sales", tabs: ["buyers", "quotations", "sales_orders", "credit", "returns"] },
  { label: "Finance", tabs: ["expenses", "settlements", "reports", "ledger"] },
  { label: "Admin", tabs: ["item_types", "employees", "warehouses", "roles"] },
  { label: "System", tabs: ["notifications", "audit_log", "settings"] },
];

/** Tabs a custom role can be given, in sidebar order. Roles and Settings are
 *  not on it: handing out the keys to the keys is how a lockout happens. */
export const GRANTABLE_TABS: { key: Tab; label: string; group: string }[] =
  SIDEBAR_SECTIONS.flatMap(s =>
    s.tabs
      .filter(t => t !== "roles" && t !== "settings")
      .map(t => ({ key: t, label: TAB_TITLES[t] ?? t, group: s.label })));
