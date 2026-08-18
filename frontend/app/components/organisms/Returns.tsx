"use client";
import type { BuyerReturn, SupplierReturn } from "@/app/types";
import { STATUS_BADGE_COLORS } from "@/app/lib/constants";
import { formatDateShort } from "@/app/lib/formatters";

interface Props { buyerReturns: BuyerReturn[]; supplierReturns: SupplierReturn[] }

function Badge({ s }: { s: string }) {
  return <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, background: (STATUS_BADGE_COLORS[s] || "#888") + "22", color: STATUS_BADGE_COLORS[s] || "#888" }}>{s}</span>;
}

function EmptyTable({ colSpan, icon, title, hint }: { colSpan: number; icon: string; title: string; hint: string }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div style={{ padding: "56px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.35 }}>{icon}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{hint}</div>
        </div>
      </td>
    </tr>
  );
}

export default function Returns({ buyerReturns, supplierReturns }: Props) {
  const total = buyerReturns.length + supplierReturns.length;
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Returns</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
            {total === 0 ? "No returns recorded" : `${total} return${total === 1 ? "" : "s"} total`}
            {" · "}Returns are logged from Sales Orders and Purchase Orders
          </p>
        </div>
      </div>

      {/* Customer Returns */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Customer Returns</span>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Buyers → Us</span>
          {buyerReturns.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "var(--primary)22", color: "var(--primary)" }}>{buyerReturns.length}</span>
          )}
        </div>
        <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--border)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
                {["Return #", "Buyer", "Item", "Qty", "Condition", "Reason", "Date", "Status"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", fontWeight: 600, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buyerReturns.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600, fontSize: 13, color: "var(--primary)" }}>{r.returnNumber}</td>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>{r.buyer.name}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13 }}>{r.finishedProduct?.itemType?.name ?? "—"} <span style={{ color: "var(--muted)" }}>({r.finishedProduct?.sku ?? "—"})</span></td>
                  <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600 }}>{r.quantity}</td>
                  <td style={{ padding: "12px 14px" }}><Badge s={r.condition} /></td>
                  <td style={{ padding: "12px 14px", fontSize: 13, maxWidth: 200, color: "var(--muted)" }}>{r.reason}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatDateShort(r.createdAt)}</td>
                  <td style={{ padding: "12px 14px" }}><Badge s={r.status} /></td>
                </tr>
              ))}
              {buyerReturns.length === 0 && (
                <EmptyTable colSpan={8} icon="↩️" title="No customer returns" hint="Returns from buyers appear here after being logged in a Sales Order" />
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Supplier Returns */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Supplier Returns</span>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Us → Suppliers</span>
          {supplierReturns.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "var(--primary)22", color: "var(--primary)" }}>{supplierReturns.length}</span>
          )}
        </div>
        <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--border)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
                {["Return #", "Supplier", "Kind", "Details", "Reason", "Date", "Status"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", fontWeight: 600, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {supplierReturns.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600, fontSize: 13, color: "var(--primary)" }}>{r.returnNumber}</td>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>{r.supplier.name}</td>
                  <td style={{ padding: "12px 14px" }}><Badge s={r.returnKind} /></td>
                  <td style={{ padding: "12px 14px", fontSize: 13 }}>
                    {r.returnKind === "RAW_CLOTH" ? `${r.metersReturned}m — ${r.rawClothBatch?.batchNumber ?? "N/A"}` : `${r.quantityReturned} pcs`}
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 13, maxWidth: 200, color: "var(--muted)" }}>{r.reason}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatDateShort(r.createdAt)}</td>
                  <td style={{ padding: "12px 14px" }}><Badge s={r.status} /></td>
                </tr>
              ))}
              {supplierReturns.length === 0 && (
                <EmptyTable colSpan={7} icon="📦" title="No supplier returns" hint="Returns sent back to suppliers appear here after being logged in a Purchase Order" />
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
