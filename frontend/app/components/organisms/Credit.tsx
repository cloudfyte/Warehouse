"use client";
import { useState } from "react";
import type { CreditTransaction } from "@/app/types";
import { CREDIT_STATUS_LABELS, STATUS_BADGE_COLORS } from "@/app/lib/constants";
import { formatMoney, formatDateShort } from "@/app/lib/formatters";
import Modal from "@/app/components/atoms/Modal";
import { downloadCsv } from "@/app/lib/csv";

interface Props {
  credits: CreditTransaction[]; isAdmin: boolean; isSuperAdmin: boolean; isManager: boolean
  onMutate: (q: string, v: Record<string, unknown>) => Promise<void>
}

const I: React.CSSProperties = {
  padding: "10px 13px", borderRadius: 9, border: "1px solid var(--line)",
  background: "var(--input-bg)", color: "var(--ink)", fontSize: 14, width: "100%", outline: "none",
};
const LBL: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 5,
  fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, textTransform: "uppercase",
};

function Badge({ s }: { s: string }) {
  const color = STATUS_BADGE_COLORS[s] || "#888";
  return (
    <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: color + "22", color, border: `1px solid ${color}33` }}>
      {CREDIT_STATUS_LABELS[s] || s}
    </span>
  );
}

export default function Credit({ credits, isAdmin, isSuperAdmin, isManager, onMutate }: Props) {
  const [detail, setDetail] = useState<CreditTransaction | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "CASH", reference: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const canEdit = isSuperAdmin || isAdmin || isManager;
  const q = search.toLowerCase();
  const filtered = credits.filter(c => {
    if (q && !c.buyer.name.toLowerCase().includes(q) && !c.salesOrder.orderNumber.toLowerCase().includes(q)) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    const d = c.createdAt?.slice(0, 10) || "";
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });
  const totalOutstanding = credits.filter(c => c.status !== "SETTLED").reduce((s, c) => s + c.amountDue, 0);

  async function recordPayment() {
    if (!detail) return;
    setLoading(true); setError("");
    try {
      await onMutate(
        `mutation P($id:ID!,$amount:Float!,$method:String,$ref:String,$notes:String){recordCreditPayment(creditId:$id,amount:$amount,paymentMethod:$method,reference:$ref,notes:$notes){credit{id status amountPaid amountDue}}}`,
        { id: detail.id, amount: parseFloat(payForm.amount), method: payForm.method, ref: payForm.reference || undefined, notes: payForm.notes || undefined }
      );
      setDetail(null);
      setPayForm({ amount: "", method: "CASH", reference: "", notes: "" });
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Credit Tracking</h2>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>{credits.length} credit transactions</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {totalOutstanding > 0 && (
            <div style={{ background: "#b95c5618", border: "1px solid #b95c5633", color: "#8d3e39", padding: "8px 16px", borderRadius: 9, fontWeight: 700, fontSize: 14 }}>
              ₹ {formatMoney(totalOutstanding)} outstanding
            </div>
          )}
          <button onClick={() => downloadCsv(`credit_${new Date().toISOString().slice(0,10)}.csv`, filtered.map(c => ({
            "Order #": c.salesOrder.orderNumber, "Buyer": c.buyer.name,
            "Total (₹)": c.totalAmount, "Paid (₹)": c.amountPaid, "Due (₹)": c.amountDue,
            "Due Date": c.dueDate || "", "Status": CREDIT_STATUS_LABELS[c.status] || c.status,
            "Created": c.createdAt?.slice(0, 10) || "",
          })))}
            style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            ⬇ Export CSV
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <input placeholder="Search buyer or order number…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...I, flex: 1, minWidth: 200, width: "auto" }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...I, width: "auto", minWidth: 180 }}>
          <option value="">All statuses</option>
          {Object.entries(CREDIT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date"
          style={{ ...I, width: "auto" }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date"
          style={{ ...I, width: "auto" }} />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); }}
            style={{ padding: "10px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--muted)", fontSize: 13, cursor: "pointer" }}>
            Clear
          </button>
        )}
      </div>

      {detail && (
        <Modal
          title={detail.buyer.name}
          subtitle={`Order: ${detail.salesOrder.orderNumber}`}
          onClose={() => { setDetail(null); setError(""); }}
          width={500}
        >
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Total", value: formatMoney(detail.totalAmount), color: "var(--ink)" },
              { label: "Paid", value: formatMoney(detail.amountPaid), color: "#347050" },
              { label: "Due", value: formatMoney(detail.amountDue), color: "#b95c56" },
            ].map(item => (
              <div key={item.label} style={{ background: "var(--canvas)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--line)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: item.color }}>₹{item.value}</div>
              </div>
            ))}
          </div>

          {/* Payment history */}
          {detail.payments.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Payment History</div>
              <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
                {detail.payments.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", borderBottom: i < detail.payments.length - 1 ? "1px solid var(--panel-border)" : "none" }}>
                    <div>
                      <div style={{ fontSize: 13 }}>{formatDateShort(p.paymentDate)} · <span style={{ fontWeight: 600 }}>{p.paymentMethod}</span></div>
                      {p.reference && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Ref: {p.reference}</div>}
                    </div>
                    <div style={{ fontWeight: 800, color: "#347050", fontSize: 14 }}>+₹{formatMoney(p.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ background: "#fff0ef", border: "1px solid #f1cbc8", color: "#8d3e39", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}

          {canEdit && detail.status !== "SETTLED" && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Record Payment</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={LBL}>Amount (₹) *
                    <input type="number" step="0.01" value={payForm.amount} placeholder="0.00"
                      onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} style={I} />
                  </label>
                  <label style={LBL}>Payment Method
                    <select value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))} style={I}>
                      {["CASH", "UPI", "NEFT", "CHEQUE", "OTHER"].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                </div>
                <label style={LBL}>Reference (UTR / Cheque No.)
                  <input value={payForm.reference} onChange={e => setPayForm(p => ({ ...p, reference: e.target.value }))} style={I} placeholder="Optional" />
                </label>
                <button onClick={recordPayment} disabled={loading || !payForm.amount}
                  style={{ padding: "12px", borderRadius: 9, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                  {loading ? "Recording…" : "Record Payment"}
                </button>
              </div>
            </>
          )}
          {detail.status === "SETTLED" && (
            <div style={{ textAlign: "center", padding: "12px 0", color: "#347050", fontWeight: 700, fontSize: 14 }}>
              ✓ Fully Settled
            </div>
          )}
        </Modal>
      )}

      <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--line)", overflowX: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--th-bg)", textAlign: "left" }}>
              {["Buyer", "Order", "Total", "Paid", "Due", "Due Date", "Status", ""].map(h => (
                <th key={h} style={{ padding: "11px 16px", fontWeight: 700, fontSize: 10, color: "var(--muted)", letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "1px solid var(--line)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} style={{ borderBottom: "1px solid var(--panel-border)" }}>
                <td style={{ padding: "13px 16px", fontWeight: 700, fontSize: 13 }}>{c.buyer.name}</td>
                <td style={{ padding: "13px 16px", fontSize: 13, color: "var(--muted)" }}>{c.salesOrder.orderNumber}</td>
                <td style={{ padding: "13px 16px", fontSize: 13 }}>₹{formatMoney(c.totalAmount)}</td>
                <td style={{ padding: "13px 16px", fontSize: 13, color: "#347050", fontWeight: 600 }}>₹{formatMoney(c.amountPaid)}</td>
                <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 800, color: c.amountDue > 0 ? "#b95c56" : "var(--muted)" }}>₹{formatMoney(c.amountDue)}</td>
                <td style={{ padding: "13px 16px", fontSize: 12, color: "var(--muted)" }}>{c.dueDate ? formatDateShort(c.dueDate) : "—"}</td>
                <td style={{ padding: "13px 16px" }}><Badge s={c.status} /></td>
                <td style={{ padding: "13px 16px" }}>
                  <button onClick={() => { setDetail(c); setError(""); setPayForm({ amount: "", method: "CASH", reference: "", notes: "" }); }}
                    style={{ padding: "5px 14px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                    {canEdit && c.status !== "SETTLED" ? "Pay" : "View"}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} style={{ padding: "56px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No credit transactions</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
