"use client";
import { useState } from "react";
import type { CreditTransaction } from "@/app/types";
import { CREDIT_STATUS_LABELS, STATUS_BADGE_COLORS } from "@/app/lib/constants";
import { formatMoney, formatDateShort } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Modal from "@/app/components/atoms/Modal";
import Button from "@/app/components/atoms/Button";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Badge from "@/app/components/atoms/Badge";
import Field from "@/app/components/molecules/Field";
import FormGrid from "@/app/components/molecules/FormGrid";
import PageHeader from "@/app/components/molecules/PageHeader";
import FilterBar from "@/app/components/molecules/FilterBar";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import { downloadCsv } from "@/app/lib/csv";

interface Props {
  credits: CreditTransaction[]; isAdmin: boolean; isSuperAdmin: boolean; isManager: boolean
  onMutate: (q: string, v: Record<string, unknown>) => Promise<void>
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
      showToast("Credit payment recorded.", "success");
    } catch (e: unknown) { setError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Credit Tracking"
        sub={`${credits.length} credit transactions`}
        actions={
          <>
            {totalOutstanding > 0 && (
              <div style={{ background: "#b95c5618", border: "1px solid #b95c5633", color: "#8d3e39", padding: "8px 16px", borderRadius: 9, fontWeight: 700, fontSize: 14 }}>
                ₹ {formatMoney(totalOutstanding)} outstanding
              </div>
            )}
            <Button variant="secondary" onClick={() => downloadCsv(`credit_${new Date().toISOString().slice(0,10)}.csv`, filtered.map(c => ({
              "Order #": c.salesOrder.orderNumber, "Buyer": c.buyer.name,
              "Total (₹)": c.totalAmount, "Paid (₹)": c.amountPaid, "Due (₹)": c.amountDue,
              "Due Date": c.dueDate || "", "Status": CREDIT_STATUS_LABELS[c.status] || c.status,
              "Created": c.createdAt?.slice(0, 10) || "",
            })))}>
              ⬇ Export CSV
            </Button>
          </>
        }
      />

      <FilterBar style={{ gap: 12 }}>
        <Input placeholder="Search buyer or order number…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, width: "auto" }} />
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: "auto", minWidth: 180 }}>
          <option value="">All statuses</option>
          {Object.entries(CREDIT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" style={{ width: "auto" }} />
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" style={{ width: "auto" }} />
        {(dateFrom || dateTo) && (
          <Button variant="secondary" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>Clear</Button>
        )}
      </FilterBar>

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
                <div style={{ fontSize: 16, fontWeight: 800, color: item.color }}>{item.value}</div>
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
                    <div style={{ fontWeight: 800, color: "#347050", fontSize: 14 }}>+{formatMoney(p.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ErrorBanner msg={error} />

          {canEdit && detail.status !== "SETTLED" && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12, marginTop: error ? 16 : 0 }}>Record Payment</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <FormGrid>
                  <Field label="Amount (₹)" required>
                    <Input type="number" step="0.01" value={payForm.amount} placeholder="0.00"
                      onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} />
                  </Field>
                  <Field label="Payment Method">
                    <Select value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}>
                      {["CASH", "UPI", "NEFT", "CHEQUE", "OTHER"].map(m => <option key={m} value={m}>{m}</option>)}
                    </Select>
                  </Field>
                </FormGrid>
                <Field label="Reference (UTR / Cheque No.)">
                  <Input value={payForm.reference} onChange={e => setPayForm(p => ({ ...p, reference: e.target.value }))} placeholder="Optional" />
                </Field>
                <Button variant="primary" onClick={recordPayment} disabled={loading || !(parseFloat(payForm.amount) > 0)} style={{ width: "100%", padding: "12px" }}>
                  {loading ? "Recording…" : "Record Payment"}
                </Button>
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
                <td style={{ padding: "13px 16px", fontSize: 13 }}>{formatMoney(c.totalAmount)}</td>
                <td style={{ padding: "13px 16px", fontSize: 13, color: "#347050", fontWeight: 600 }}>{formatMoney(c.amountPaid)}</td>
                <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 800, color: c.amountDue > 0 ? "#b95c56" : "var(--muted)" }}>{formatMoney(c.amountDue)}</td>
                <td style={{ padding: "13px 16px", fontSize: 12, color: "var(--muted)" }}>{c.dueDate ? formatDateShort(c.dueDate) : "—"}</td>
                <td style={{ padding: "13px 16px" }}>
                  <Badge
                    label={CREDIT_STATUS_LABELS[c.status] || c.status}
                    color={STATUS_BADGE_COLORS[c.status] || "#888"}
                    style={{ border: `1px solid ${(STATUS_BADGE_COLORS[c.status] || "#888")}33` }}
                  />
                </td>
                <td style={{ padding: "13px 16px" }}>
                  <Button variant="secondary" size="sm" onClick={() => { setDetail(c); setError(""); setPayForm({ amount: "", method: "CASH", reference: "", notes: "" }); }}>
                    {canEdit && c.status !== "SETTLED" ? "Pay" : "View"}
                  </Button>
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
