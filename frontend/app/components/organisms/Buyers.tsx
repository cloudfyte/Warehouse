"use client";
import { useState } from "react";
import type { Buyer, SalesOrder, CreditTransaction, BuyerReturn } from "@/app/types";
import { BUYER_TYPE_LABELS } from "@/app/lib/constants";
import { formatMoney } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import StateCity from "@/app/components/atoms/StateCity";
import Modal from "@/app/components/atoms/Modal";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Textarea from "@/app/components/atoms/Textarea";
import Button from "@/app/components/atoms/Button";
import Badge from "@/app/components/atoms/Badge";
import Field from "@/app/components/molecules/Field";
import FormGrid from "@/app/components/molecules/FormGrid";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import PageHeader from "@/app/components/molecules/PageHeader";
import FilterBar from "@/app/components/molecules/FilterBar";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="switch" aria-checked={checked} tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!checked); } }}
      style={{ width: 30, height: 17, borderRadius: 9, flexShrink: 0,
        background: checked ? "var(--primary)" : "#bbb", position: "relative", cursor: "pointer", transition: "background 0.18s" }}>
      <div style={{ position: "absolute", top: 2.5, left: checked ? 15 : 2.5, width: 12, height: 12,
        borderRadius: "50%", background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 3px #0004" }} />
    </div>
  );
}

interface Props {
  buyers: Buyer[]; isAdmin: boolean; isSuperAdmin: boolean; isManager?: boolean
  salesOrders?: SalesOrder[]; creditTransactions?: CreditTransaction[]; buyerReturns?: BuyerReturn[]
  onMutate: (q: string, v: Record<string, unknown>) => Promise<void>
}

const BUYER_COLORS: Record<string, string> = { WHOLESALE: "#7c3aed", RETAIL: "#2563eb", EXPORT: "#059669" };
const ORDER_STATUS_COLORS: Record<string, string> = { PENDING: "#f59e0b", PROCESSING: "#2563eb", COMPLETED: "#16a34a", CANCELLED: "#dc2626", DELIVERED: "#16a34a" };
const CREDIT_STATUS_COLORS: Record<string, string> = { ACTIVE: "#2563eb", OVERDUE: "#dc2626", SETTLED: "#16a34a" };

function MiniCard({ label, value, color = "var(--primary)" }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderLeft: `3px solid ${color}`, borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function BuyerHistory({ buyer, salesOrders, creditTransactions, buyerReturns, onClose }: {
  buyer: Buyer; salesOrders: SalesOrder[]; creditTransactions: CreditTransaction[]
  buyerReturns: BuyerReturn[]; onClose: () => void
}) {
  const orders = salesOrders.filter(o => o.buyer?.id === buyer.id);
  const credits = creditTransactions.filter(c => c.buyer?.id === buyer.id);
  const returns = buyerReturns.filter(r => r.buyer?.id === buyer.id);

  const totalSpent = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const totalPaid = orders.reduce((s, o) => s + (o.amountPaid || 0), 0);
  const outstanding = credits.reduce((s, c) => s + (c.amountDue || 0), 0);

  return (
    <Modal title={buyer.name} subtitle={`${buyer.contactPerson || ""} · ${buyer.phone || ""} · ${BUYER_TYPE_LABELS[buyer.buyerType] || buyer.buyerType}`} onClose={onClose} width={680}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        <MiniCard label="Total Orders" value={`${orders.length}`} />
        <MiniCard label="Total Billed" value={formatMoney(totalSpent)} color="#2563eb" />
        <MiniCard label="Total Collected" value={formatMoney(totalPaid)} color="#16a34a" />
        <MiniCard label="Outstanding" value={formatMoney(outstanding)} color={outstanding > 0 ? "#dc2626" : "#16a34a"} />
      </div>

      {orders.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Sales Orders</div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 9, overflow: "hidden", marginBottom: 18 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--canvas)" }}>
                  {["Order #", "Date", "Status", "Total", "Paid", "Due"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", fontWeight: 700, fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "left", borderBottom: "1px solid var(--line)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "9px 12px", fontWeight: 600, fontFamily: "monospace" }}>{o.orderNumber}</td>
                    <td style={{ padding: "9px 12px", color: "var(--muted)" }}>{o.orderDate?.slice(0, 10)}</td>
                    <td style={{ padding: "9px 12px" }}><Badge label={o.status} color={ORDER_STATUS_COLORS[o.status] || "#666"} /></td>
                    <td style={{ padding: "9px 12px", fontWeight: 600 }}>{formatMoney(o.totalAmount)}</td>
                    <td style={{ padding: "9px 12px", color: "#16a34a", fontWeight: 600 }}>{formatMoney(o.amountPaid)}</td>
                    <td style={{ padding: "9px 12px", color: o.amountDue > 0 ? "#dc2626" : "var(--muted)", fontWeight: o.amountDue > 0 ? 700 : 400 }}>{formatMoney(o.amountDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {credits.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Credit Accounts</div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 9, overflow: "hidden", marginBottom: 18 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--canvas)" }}>
                  {["Order", "Total", "Paid", "Due", "Due Date", "Status"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", fontWeight: 700, fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "left", borderBottom: "1px solid var(--line)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {credits.map(c => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 11 }}>{c.salesOrder?.orderNumber || "—"}</td>
                    <td style={{ padding: "9px 12px", fontWeight: 600 }}>{formatMoney(c.totalAmount)}</td>
                    <td style={{ padding: "9px 12px", color: "#16a34a" }}>{formatMoney(c.amountPaid)}</td>
                    <td style={{ padding: "9px 12px", color: c.amountDue > 0 ? "#dc2626" : "var(--muted)", fontWeight: c.amountDue > 0 ? 700 : 400 }}>{formatMoney(c.amountDue)}</td>
                    <td style={{ padding: "9px 12px", color: "var(--muted)" }}>{c.dueDate?.slice(0, 10) || "—"}</td>
                    <td style={{ padding: "9px 12px" }}><Badge label={c.status} color={CREDIT_STATUS_COLORS[c.status] || "#666"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {returns.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Returns ({returns.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {returns.map(r => (
              <div key={r.id} style={{ background: "var(--canvas)", borderRadius: 8, padding: "9px 13px", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{r.returnNumber}</span>
                  <span style={{ color: "var(--muted)", marginLeft: 10 }}>{r.finishedProduct?.itemType?.name}</span>
                  <span style={{ color: "var(--muted)", marginLeft: 8 }}>× {r.quantity}</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{r.condition}</span>
                  <Badge label={r.status} color={r.status === "APPROVED" ? "#16a34a" : r.status === "REJECTED" ? "#dc2626" : "#f59e0b"} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {orders.length === 0 && credits.length === 0 && returns.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "40px 0" }}>No transactions yet for this buyer.</div>
      )}
    </Modal>
  );
}

export default function Buyers({ buyers, isAdmin, isSuperAdmin, isManager = false, salesOrders = [], creditTransactions = [], buyerReturns = [], onMutate }: Props) {
  const [editing, setEditing] = useState<Partial<Buyer> | null>(null);
  const [historyBuyer, setHistoryBuyer] = useState<Buyer | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [waIsSameAsPhone, setWaIsSameAsPhone] = useState(false);

  const canEdit = isSuperAdmin || isAdmin || isManager;

  function openNew() {
    setIsNew(true); setEditing({ name: "", contactPerson: "", email: "", phone: "", whatsapp: "", address: "", city: "", state: "", gstin: "", buyerType: "WHOLESALE", creditLimit: 0, notes: "" }); setError(""); setWaIsSameAsPhone(false);
  }
  function openEdit(b: Buyer) {
    setIsNew(false); setEditing(b); setError("");
    setWaIsSameAsPhone(!!(b.phone && b.phone === b.whatsapp));
  }
  function handlePhoneChange(v: string) {
    setEditing(p => ({ ...p, phone: v, whatsapp: waIsSameAsPhone ? v : (p?.whatsapp ?? "") }));
  }
  function handleWaToggle(checked: boolean) {
    setWaIsSameAsPhone(checked);
    if (checked) setEditing(p => ({ ...p, whatsapp: p?.phone || "" }));
  }

  const filtered = buyers.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.contactPerson?.toLowerCase().includes(search.toLowerCase())
  );

  async function save() {
    if (!editing) return;
    if (!editing.name?.trim()) { setError("Company / Name is required"); return; }
    setLoading(true); setError("");
    try {
      const m = isNew
        ? `mutation C($name:String!,$cp:String,$email:String,$phone:String,$wa:String,$addr:String,$city:String,$state:String,$gstin:String,$bt:String,$cl:Float,$notes:String){createBuyer(name:$name,contactPerson:$cp,email:$email,phone:$phone,whatsapp:$wa,address:$addr,city:$city,state:$state,gstin:$gstin,buyerType:$bt,creditLimit:$cl,notes:$notes){buyer{id}}}`
        : `mutation U($id:ID!,$name:String,$cp:String,$email:String,$phone:String,$wa:String,$addr:String,$city:String,$state:String,$gstin:String,$bt:String,$cl:Float,$notes:String,$active:Boolean){updateBuyer(id:$id,name:$name,contactPerson:$cp,email:$email,phone:$phone,whatsapp:$wa,address:$addr,city:$city,state:$state,gstin:$gstin,buyerType:$bt,creditLimit:$cl,notes:$notes,active:$active){buyer{id}}}`;
      const cl = editing.creditLimit != null ? Number(editing.creditLimit) : undefined;
      await onMutate(m, { id: editing.id, name: editing.name, cp: editing.contactPerson, email: editing.email, phone: editing.phone, wa: editing.whatsapp, addr: editing.address, city: editing.city, state: editing.state, gstin: editing.gstin, bt: editing.buyerType, cl: Number.isFinite(cl as number) ? cl : undefined, notes: editing.notes, active: editing.active });
      setEditing(null);
      showToast(isNew ? "Buyer created." : "Buyer updated.", "success");
    } catch (e: unknown) { setError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Buyers"
        sub={`${buyers.length} buyers`}
        actions={canEdit && <Button variant="primary" onClick={openNew}>+ Add Buyer</Button>}
      />

      <FilterBar>
        <Input placeholder="Search buyers…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 360 }} />
      </FilterBar>

      {historyBuyer && (
        <BuyerHistory
          buyer={historyBuyer}
          salesOrders={salesOrders}
          creditTransactions={creditTransactions}
          buyerReturns={buyerReturns}
          onClose={() => setHistoryBuyer(null)}
        />
      )}

      {editing && (
        <Modal
          title={isNew ? "Add Buyer" : "Edit Buyer"}
          subtitle={isNew ? "Add a new buyer / customer" : `Editing: ${editing.name}`}
          onClose={() => { setEditing(null); setError(""); }}
          width={560}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="primary" style={{ flex: 1 }} onClick={save} disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => { setEditing(null); setError(""); }}>Cancel</Button>
            </div>
          }
        >
          {error && <div style={{ marginBottom: 16 }}><ErrorBanner msg={error} /></div>}
          <FormGrid>
            <Field label="Company / Name" required>
              <Input value={editing?.name ?? ""} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field label="Contact Person">
              <Input value={editing?.contactPerson ?? ""} onChange={e => setEditing(p => ({ ...p, contactPerson: e.target.value }))} />
            </Field>
            <Field label="Email">
              <Input type="email" value={editing?.email ?? ""} onChange={e => setEditing(p => ({ ...p, email: e.target.value }))} />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={editing?.phone ?? ""} onChange={e => handlePhoneChange(e.target.value)} />
            </Field>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 18 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, textTransform: "uppercase" }}>WhatsApp</span>
                <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none" }}>
                  <Toggle checked={waIsSameAsPhone} onChange={handleWaToggle} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: waIsSameAsPhone ? "#25d366" : "var(--muted)" }}>Same as phone</span>
                </label>
              </div>
              <Input type="tel" value={editing?.whatsapp ?? ""} disabled={waIsSameAsPhone}
                onChange={e => setEditing(p => ({ ...p, whatsapp: e.target.value }))}
                placeholder={waIsSameAsPhone ? editing?.phone ?? "" : "+91 98765 43210"}
                style={{ opacity: waIsSameAsPhone ? 0.6 : 1, cursor: waIsSameAsPhone ? "not-allowed" : "text",
                  borderColor: !waIsSameAsPhone && editing?.whatsapp ? "#25d366" : undefined }} />
            </div>
            <Field label="GSTIN">
              <Input value={editing?.gstin ?? ""} onChange={e => setEditing(p => ({ ...p, gstin: e.target.value }))} />
            </Field>
          </FormGrid>
          <Field label="Address" style={{ marginTop: 14 }}>
            <Textarea value={editing?.address ?? ""} onChange={e => setEditing(p => ({ ...p, address: e.target.value }))}
              style={{ minHeight: 60 }} placeholder="Street / building address" />
          </Field>
          <FormGrid style={{ marginTop: 14 }}>
            <StateCity
              state={editing.state || ""} city={editing.city || ""}
              onStateChange={v => setEditing(p => ({ ...p, state: v }))}
              onCityChange={v => setEditing(p => ({ ...p, city: v }))}
            />
          </FormGrid>
          <FormGrid style={{ marginTop: 14 }}>
            <Field label="Buyer Type">
              <Select value={editing.buyerType ?? "WHOLESALE"} onChange={e => setEditing(p => ({ ...p, buyerType: e.target.value }))}>
                {Object.entries(BUYER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Credit Limit (₹)">
              <Input type="number" value={editing.creditLimit ?? 0} onChange={e => setEditing(p => ({ ...p, creditLimit: +e.target.value }))} />
            </Field>
          </FormGrid>
          <div style={{ position: "relative", marginTop: 14 }}>
            <Field label="Notes">
              <Textarea value={editing.notes ?? ""} onChange={e => setEditing(p => ({ ...p, notes: e.target.value.slice(0, 200) }))}
                style={{ minHeight: 72 }} maxLength={200} placeholder="Internal notes about this buyer" />
            </Field>
            <span style={{ position: "absolute", bottom: 8, right: 10, fontSize: 10, color: (editing.notes?.length ?? 0) > 170 ? "#e07" : "var(--muted)", pointerEvents: "none" }}>{editing.notes?.length ?? 0}/200</span>
          </div>
          {!isNew && (
            <label style={{
              display: "flex", alignItems: "center", gap: 10, marginTop: 16,
              padding: "10px 14px", borderRadius: 9, border: "1px solid var(--line)",
              background: (editing.active ?? true) ? "#f0fdf4" : "#fff8f8",
              cursor: "pointer", userSelect: "none",
            }}>
              <input type="checkbox" checked={editing.active ?? true}
                onChange={e => setEditing(p => ({ ...p, active: e.target.checked }))}
                style={{ accentColor: "var(--primary)", width: 16, height: 16, cursor: "pointer" }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: (editing.active ?? true) ? "#166534" : "#991b1b" }}>
                  {(editing.active ?? true) ? "Active buyer" : "Inactive buyer"}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                  {(editing.active ?? true) ? "Buyer is available for sales orders and credit" : "Buyer will be hidden from selection lists"}
                </div>
              </div>
            </label>
          )}
        </Modal>
      )}

      <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--line)", overflowX: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--th-bg)", textAlign: "left" }}>
              {["Buyer", "Contact", "Phone", "Type", "Credit Limit", ""].map(h => (
                <th key={h} style={{ padding: "11px 16px", fontWeight: 700, fontSize: 10, color: "var(--muted)", letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "1px solid var(--line)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => (
              <tr key={b.id} style={{ borderBottom: "1px solid var(--panel-border)", opacity: b.active ? 1 : 0.5 }}>
                <td style={{ padding: "13px 16px" }}>
                  <button onClick={() => setHistoryBuyer(b)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)", textDecoration: "underline", textDecorationStyle: "dotted" }}>{b.name}</div>
                    {b.city && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{b.city}, {b.state}</div>}
                  </button>
                </td>
                <td style={{ padding: "13px 16px" }}>
                  <div style={{ fontSize: 13 }}>{b.contactPerson}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{b.email}</div>
                </td>
                <td style={{ padding: "13px 16px", fontSize: 13 }}>{b.phone}</td>
                <td style={{ padding: "13px 16px" }}>
                  <Badge label={BUYER_TYPE_LABELS[b.buyerType] || b.buyerType} color={BUYER_COLORS[b.buyerType] || "#666"} />
                </td>
                <td style={{ padding: "13px 16px", fontSize: 14, fontWeight: 600 }}>{formatMoney(b.creditLimit)}</td>
                <td style={{ padding: "13px 16px" }}>
                  {canEdit && <Button variant="secondary" size="sm" onClick={() => openEdit(b)}>Edit</Button>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} style={{ padding: "56px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No buyers found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
