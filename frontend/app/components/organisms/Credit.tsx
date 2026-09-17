"use client";
import { useState, useEffect } from "react";
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
import TotalsBar from "@/app/components/molecules/TotalsBar";
import Cell from "@/app/components/molecules/Cell";
import FilterBar from "@/app/components/molecules/FilterBar";
import Pagination from "@/app/components/atoms/Pagination";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import { downloadCsv } from "@/app/lib/csv";

const PER_PAGE = 20;

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

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, statusFilter, dateFrom, dateTo]);

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
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

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
        title="Credit"
        sub="Who owes what, and since when"
        actions={
          <>
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

      <TotalsBar
        narrowed={filtered.length !== credits.length}
        note="Totals are for what you have filtered, not every account."
        totals={[
          { label: "Accounts", value: String(filtered.length) },
          { label: "Billed", value: formatMoney(filtered.reduce((t, c) => t + (c.totalAmount || 0), 0)) },
          { label: "Collected", value: formatMoney(filtered.reduce((t, c) => t + (c.amountPaid || 0), 0)) },
          {
            label: "Outstanding",
            value: formatMoney(filtered.reduce((t, c) => t + (c.amountDue || 0), 0)),
            color: filtered.some(c => (c.amountDue || 0) > 0) ? "#d32f2f" : undefined,
          },
        ]}
      />

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
                      <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--muted)", marginBottom: 2 }}>{p.paymentNumber}</div>
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

      {filtered.length === 0 ? (
        <div style={{ padding: "64px 0", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
          Nobody is on credit right now.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {paged.map(c => {
            const tone = STATUS_BADGE_COLORS[c.status] || "#94a3b8";
            const paidPct = c.totalAmount > 0
              ? Math.max(0, Math.min(100, (c.amountPaid / c.totalAmount) * 100)) : 0;
            const overdue = c.status !== "SETTLED" && c.dueDate
              ? new Date(c.dueDate) < new Date() : false;
            return (
              <div key={c.id} style={{
                display: "grid",
                // ~800px of minimums — fits a 1280 laptop with the sidebar open.
                gridTemplateColumns: "minmax(170px,1.5fr) minmax(110px,0.9fr) minmax(130px,1fr) 190px 84px",
                gap: 16, alignItems: "center",
                border: "1px solid var(--line)", borderLeft: `3px solid ${tone}`,
                borderRadius: 12, padding: "14px 16px", background: "var(--paper)",
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.buyer.name}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
                    against {c.salesOrder.orderNumber}
                  </div>
                </div>

                <Cell label="Due date"
                  value={c.dueDate
                    ? <span style={{ color: overdue ? "#d32f2f" : undefined, fontWeight: overdue ? 700 : undefined }}>
                        {formatDateShort(c.dueDate)}{overdue ? " · late" : ""}
                      </span>
                    : null} />

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Where it stands
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Badge
                      label={CREDIT_STATUS_LABELS[c.status] || c.status}
                      color={STATUS_BADGE_COLORS[c.status] || "#888"}
                      style={{ border: `1px solid ${(STATUS_BADGE_COLORS[c.status] || "#888")}33` }}
                    />
                  </div>
                  {c.payments?.length > 0 && (
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
                      {c.payments.length} payment{c.payments.length === 1 ? "" : "s"} so far
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, justifyContent: "flex-end" }}>
                    <span style={{
                      fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                      letterSpacing: -0.5, lineHeight: 1.1,
                      color: c.amountDue > 0 ? "#b95c56" : "#2e7d32",
                    }}>
                      {formatMoney(c.amountDue)}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>
                      {c.amountDue > 0 ? "still owed" : "clear"}
                    </span>
                  </div>
                  <div style={{ height: 5, borderRadius: 99, background: "var(--line)", marginTop: 7, overflow: "hidden" }}>
                    <div style={{ width: `${paidPct}%`, height: "100%", borderRadius: 99, background: paidPct === 100 ? "#2e7d32" : "var(--primary)" }} />
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 5, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {formatMoney(c.amountPaid)} paid of {formatMoney(c.totalAmount)}
                  </div>
                </div>

                <Button variant="secondary" size="sm"
                  onClick={() => { setDetail(c); setError(""); setPayForm({ amount: "", method: "CASH", reference: "", notes: "" }); }}>
                  {canEdit && c.status !== "SETTLED" ? "Pay" : "View"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
    </div>
  );
}
