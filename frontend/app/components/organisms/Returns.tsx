"use client";
import type { BuyerReturn, SupplierReturn } from "@/app/types";
import { STATUS_BADGE_COLORS } from "@/app/lib/constants";
import { formatDateShort } from "@/app/lib/formatters";

interface Props { buyerReturns: BuyerReturn[]; supplierReturns: SupplierReturn[] }

function Badge({ s }: { s: string }) {
  return <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, background: (STATUS_BADGE_COLORS[s] || "#888") + "22", color: STATUS_BADGE_COLORS[s] || "#888" }}>{s}</span>;
}

export default function Returns({ buyerReturns, supplierReturns }: Props) {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: "0 0 24px" }}>Returns</h2>

      <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13 }}>Customer Returns (Buyers → Us)</div>
      <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--border)", overflowX: "auto", marginBottom: 32 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
              {["Return #", "Buyer", "Item", "Qty", "Condition", "Reason", "Date", "Status"].map(h => (
                <th key={h} style={{ padding: "10px 14px", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buyerReturns.map(r => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "12px 14px", fontWeight: 600, fontSize: 13 }}>{r.returnNumber}</td>
                <td style={{ padding: "12px 14px" }}>{r.buyer.name}</td>
                <td style={{ padding: "12px 14px", fontSize: 13 }}>{r.finishedProduct.itemType.name} <span style={{ color: "var(--muted)" }}>({r.finishedProduct.sku})</span></td>
                <td style={{ padding: "12px 14px", fontSize: 13 }}>{r.quantity}</td>
                <td style={{ padding: "12px 14px" }}><Badge s={r.condition} /></td>
                <td style={{ padding: "12px 14px", fontSize: 13, maxWidth: 200 }}>{r.reason}</td>
                <td style={{ padding: "12px 14px", fontSize: 13 }}>{formatDateShort(r.createdAt)}</td>
                <td style={{ padding: "12px 14px" }}><Badge s={r.status} /></td>
              </tr>
            ))}
            {buyerReturns.length === 0 && <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No buyer returns</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13 }}>Supplier Returns (Us → Suppliers)</div>
      <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--border)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
              {["Return #", "Supplier", "Kind", "Details", "Reason", "Date", "Status"].map(h => (
                <th key={h} style={{ padding: "10px 14px", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {supplierReturns.map(r => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "12px 14px", fontWeight: 600, fontSize: 13 }}>{r.returnNumber}</td>
                <td style={{ padding: "12px 14px" }}>{r.supplier.name}</td>
                <td style={{ padding: "12px 14px" }}><Badge s={r.returnKind} /></td>
                <td style={{ padding: "12px 14px", fontSize: 13 }}>
                  {r.returnKind === "RAW_CLOTH" ? `${r.metersReturned}m — ${r.rawClothBatch?.batchNumber}` : `${r.quantityReturned} pcs`}
                </td>
                <td style={{ padding: "12px 14px", fontSize: 13, maxWidth: 200 }}>{r.reason}</td>
                <td style={{ padding: "12px 14px", fontSize: 13 }}>{formatDateShort(r.createdAt)}</td>
                <td style={{ padding: "12px 14px" }}><Badge s={r.status} /></td>
              </tr>
            ))}
            {supplierReturns.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No supplier returns</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
