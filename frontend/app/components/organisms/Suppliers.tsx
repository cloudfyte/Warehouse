"use client";
import { useState } from "react";
import type { Supplier, PurchaseBill, PurchaseOrder, SupplierReturn } from "@/app/types";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import { formatMoney } from "@/app/lib/formatters";
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
  suppliers: Supplier[]; isSuperAdmin: boolean; isAdmin: boolean; isManager?: boolean
  purchaseBills?: PurchaseBill[]; purchaseOrders?: PurchaseOrder[]; supplierReturns?: SupplierReturn[]
  onMutate: (q: string, v: Record<string, unknown>) => Promise<void>
}

const empty = (): Partial<Supplier> => ({ name: "", contactPerson: "", email: "", phone: "", whatsapp: "", address: "", city: "", state: "", gstin: "", creditDays: 0, notes: "" });

function deriveSupplyBadge(supplierId: string, purchaseOrders: PurchaseOrder[]): { label: string; color: string } | null {
  const orders = purchaseOrders.filter(po => po.supplier?.id === supplierId);
  if (!orders.length) return null;
  const hasRaw = orders.some(po => po.orderType === "RAW_CLOTH" || po.orderType === "MIXED");
  const hasReadymade = orders.some(po => po.orderType === "READYMADE" || po.orderType === "MIXED");
  if (hasRaw && hasReadymade) return { label: "Both", color: "#059669" };
  if (hasRaw) return { label: "Raw Cloth", color: "#2563eb" };
  if (hasReadymade) return { label: "Readymade", color: "#7c3aed" };
  return null;
}

const BILL_STATUS_COLORS: Record<string, string> = { PENDING: "#f59e0b", PARTIAL: "#2563eb", PAID: "#16a34a" };
const PO_STATUS_COLORS: Record<string, string> = { DRAFT: "#94a3b8", CONFIRMED: "#2563eb", RECEIVED: "#16a34a", CANCELLED: "#dc2626", PARTIAL: "#f59e0b" };

function MiniCard({ label, value, color = "var(--primary)" }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderLeft: `3px solid ${color}`, borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function SupplierHistory({ supplier, purchaseBills, purchaseOrders, supplierReturns, onClose }: {
  supplier: Supplier; purchaseBills: PurchaseBill[]; purchaseOrders: PurchaseOrder[]
  supplierReturns: SupplierReturn[]; onClose: () => void
}) {
  const bills = purchaseBills.filter(b => b.supplier?.id === supplier.id);
  const orders = purchaseOrders.filter(o => o.supplier?.id === supplier.id);
  const returns = supplierReturns.filter(r => r.supplier?.id === supplier.id);

  const totalBilled = bills.reduce((s, b) => s + (b.totalAmount || 0), 0);
  const totalPaid = bills.reduce((s, b) => s + (b.amountPaid || 0), 0);
  const totalPending = bills.reduce((s, b) => s + (b.amountPending || 0), 0);

  return (
    <Modal title={supplier.name} subtitle={`${supplier.contactPerson || ""} · ${supplier.phone || ""}`} onClose={onClose} width={680}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        <MiniCard label="Total Bills" value={`${bills.length}`} />
        <MiniCard label="Total Purchased" value={formatMoney(totalBilled)} color="#2563eb" />
        <MiniCard label="Amount Paid" value={formatMoney(totalPaid)} color="#16a34a" />
        <MiniCard label="Pending" value={formatMoney(totalPending)} color={totalPending > 0 ? "#dc2626" : "#16a34a"} />
      </div>

      {bills.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Purchase Bills</div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 9, overflow: "hidden", marginBottom: 18 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--canvas)" }}>
                  {["Bill #", "Date", "Invoice Ref", "Total", "Paid", "Pending", "Status"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", fontWeight: 700, fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "left", borderBottom: "1px solid var(--line)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bills.map(b => (
                  <tr key={b.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "9px 12px", fontWeight: 600, fontFamily: "monospace" }}>{b.billNumber}</td>
                    <td style={{ padding: "9px 12px", color: "var(--muted)" }}>{b.billDate?.slice(0, 10)}</td>
                    <td style={{ padding: "9px 12px", color: "var(--muted)", fontSize: 11 }}>{b.invoiceRef || "—"}</td>
                    <td style={{ padding: "9px 12px", fontWeight: 600 }}>{formatMoney(b.totalAmount)}</td>
                    <td style={{ padding: "9px 12px", color: "#16a34a" }}>{formatMoney(b.amountPaid)}</td>
                    <td style={{ padding: "9px 12px", color: b.amountPending > 0 ? "#dc2626" : "var(--muted)", fontWeight: b.amountPending > 0 ? 700 : 400 }}>{formatMoney(b.amountPending)}</td>
                    <td style={{ padding: "9px 12px" }}><Badge label={b.paymentStatus} color={BILL_STATUS_COLORS[b.paymentStatus] || "#666"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {orders.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Purchase Orders</div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 9, overflow: "hidden", marginBottom: 18 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--canvas)" }}>
                  {["PO #", "Date", "Type", "Total", "Status"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", fontWeight: 700, fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "left", borderBottom: "1px solid var(--line)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "9px 12px", fontWeight: 600, fontFamily: "monospace" }}>{o.poNumber}</td>
                    <td style={{ padding: "9px 12px", color: "var(--muted)" }}>{o.orderDate?.slice(0, 10)}</td>
                    <td style={{ padding: "9px 12px", color: "var(--muted)" }}>{o.orderType}</td>
                    <td style={{ padding: "9px 12px", fontWeight: 600 }}>{formatMoney(o.totalAmount)}</td>
                    <td style={{ padding: "9px 12px" }}><Badge label={o.status} color={PO_STATUS_COLORS[o.status] || "#666"} /></td>
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
                  <span style={{ color: "var(--muted)", marginLeft: 10 }}>{r.returnKind}</span>
                  {r.metersReturned ? <span style={{ color: "var(--muted)", marginLeft: 8 }}>{r.metersReturned}m</span> : null}
                  {r.quantityReturned ? <span style={{ color: "var(--muted)", marginLeft: 8 }}>× {r.quantityReturned}</span> : null}
                </div>
                <Badge label={r.status} color={r.status === "APPROVED" ? "#16a34a" : r.status === "REJECTED" ? "#dc2626" : "#f59e0b"} />
              </div>
            ))}
          </div>
        </>
      )}

      {bills.length === 0 && orders.length === 0 && returns.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "40px 0" }}>No transactions yet for this supplier.</div>
      )}
    </Modal>
  );
}

export default function Suppliers({ suppliers, isSuperAdmin, isAdmin, isManager = false, purchaseBills = [], purchaseOrders = [], supplierReturns = [], onMutate }: Props) {
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const [historySupplier, setHistorySupplier] = useState<Supplier | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [waIsSameAsPhone, setWaIsSameAsPhone] = useState(false);

  const canEdit = isSuperAdmin || isAdmin || isManager;
  const [showArchived, setShowArchived] = useState(false);
  const filtered = suppliers.filter(s =>
    s.active !== showArchived &&
    (s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.contactPerson?.toLowerCase().includes(search.toLowerCase()))
  );

  async function save() {
    if (!editing) return;
    if (!editing.name?.trim()) { setError("Company Name is required"); return; }
    setLoading(true); setError("");
    try {
      const m = isNew
        ? `mutation C($name:String!,$cp:String,$email:String,$phone:String,$wa:String,$addr:String,$city:String,$state:String,$gstin:String,$cd:Int,$notes:String){createSupplier(name:$name,contactPerson:$cp,email:$email,phone:$phone,whatsapp:$wa,address:$addr,city:$city,state:$state,gstin:$gstin,creditDays:$cd,notes:$notes){supplier{id}}}`
        : `mutation U($id:ID!,$name:String,$cp:String,$email:String,$phone:String,$wa:String,$addr:String,$city:String,$state:String,$gstin:String,$cd:Int,$notes:String,$active:Boolean){updateSupplier(id:$id,name:$name,contactPerson:$cp,email:$email,phone:$phone,whatsapp:$wa,address:$addr,city:$city,state:$state,gstin:$gstin,creditDays:$cd,notes:$notes,active:$active){supplier{id}}}`;
      const cd = editing.creditDays != null ? parseInt(String(editing.creditDays), 10) : undefined;
      await onMutate(m, { id: editing.id, name: editing.name, cp: editing.contactPerson, email: editing.email, phone: editing.phone, wa: editing.whatsapp, addr: editing.address, city: editing.city, state: editing.state, gstin: editing.gstin, cd: Number.isFinite(cd as number) ? cd : undefined, notes: editing.notes, active: editing.active });
      setEditing(null);
      showToast(isNew ? "Supplier created." : "Supplier updated.", "success");
    } catch (e: unknown) { setError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  function openNew() {
    setIsNew(true); setEditing(empty()); setError(""); setWaIsSameAsPhone(false);
  }
  function openEdit(s: Supplier) {
    setIsNew(false); setEditing(s); setError("");
    setWaIsSameAsPhone(!!(s.phone && s.phone === s.whatsapp));
  }
  function handlePhoneChange(v: string) {
    setEditing(p => ({ ...p, phone: v, whatsapp: waIsSameAsPhone ? v : (p?.whatsapp ?? "") }));
  }
  function handleWaToggle(checked: boolean) {
    setWaIsSameAsPhone(checked);
    if (checked) setEditing(p => ({ ...p, whatsapp: p?.phone || "" }));
  }

  async function archiveOrRestore(s: Supplier) {
    const next = !s.active;
    try {
      await onMutate(
        `mutation A($id:ID!,$active:Boolean!){updateSupplier(id:$id,active:$active){supplier{id}}}`,
        { id: s.id, active: next }
      );
      showToast(next ? `${s.name} restored.` : `${s.name} archived.`, "success");
    } catch (e: unknown) { showToast(friendlyError(e), "error"); }
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title={showArchived ? "Archived Suppliers" : "Suppliers"}
        sub={showArchived
          ? `${suppliers.filter(s => !s.active).length} archived`
          : `${suppliers.filter(s => s.active).length} active`}
        actions={canEdit && !showArchived && <Button variant="primary" onClick={openNew}>+ Add Supplier</Button>}
      />

      <FilterBar>
        <Input placeholder="Search suppliers…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 360 }} />
        <button
          onClick={() => setShowArchived(v => !v)}
          style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${showArchived ? "#dc2626" : "var(--line)"}`, background: showArchived ? "#fef2f2" : "transparent", color: showArchived ? "#dc2626" : "var(--muted)", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          {showArchived ? "← Active Suppliers" : "View Archived"}
        </button>
      </FilterBar>

      {historySupplier && (
        <SupplierHistory
          supplier={historySupplier}
          purchaseBills={purchaseBills}
          purchaseOrders={purchaseOrders}
          supplierReturns={supplierReturns}
          onClose={() => setHistorySupplier(null)}
        />
      )}

      {editing && (
        <Modal
          title={isNew ? "Add Supplier" : "Edit Supplier"}
          subtitle={isNew ? "Add a new cloth supplier" : `Editing: ${editing.name}`}
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
            <Field label="Company Name" required>
              <Input value={editing?.name ?? ""} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field label="Contact Person">
              <Input value={editing?.contactPerson ?? ""} onChange={e => setEditing(p => ({ ...p, contactPerson: e.target.value }))} />
            </Field>
            <Field label="Email">
              <Input type="email" value={editing?.email ?? ""} onChange={e => setEditing(p => ({ ...p, email: e.target.value }))} />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={editing.phone ?? ""} onChange={e => handlePhoneChange(e.target.value)} />
            </Field>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 18 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, textTransform: "uppercase" }}>WhatsApp</span>
                <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none" }}>
                  <Toggle checked={waIsSameAsPhone} onChange={handleWaToggle} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: waIsSameAsPhone ? "#25d366" : "var(--muted)" }}>Same as phone</span>
                </label>
              </div>
              <Input type="tel" value={editing.whatsapp ?? ""} disabled={waIsSameAsPhone}
                onChange={e => setEditing(p => ({ ...p, whatsapp: e.target.value }))}
                placeholder={waIsSameAsPhone ? editing.phone ?? "" : "+91 98765 43210"}
                style={{ opacity: waIsSameAsPhone ? 0.6 : 1, cursor: waIsSameAsPhone ? "not-allowed" : "text",
                  borderColor: !waIsSameAsPhone && editing.whatsapp ? "#25d366" : undefined }} />
            </div>
            <Field label="GSTIN">
              <Input value={editing?.gstin ?? ""} onChange={e => setEditing(p => ({ ...p, gstin: e.target.value }))} />
            </Field>
            <StateCity
              state={editing.state || ""} city={editing.city || ""}
              onStateChange={v => setEditing(p => ({ ...p, state: v }))}
              onCityChange={v => setEditing(p => ({ ...p, city: v }))}
            />
          </FormGrid>
          <Field label="Address" style={{ marginTop: 14 }}>
            <Textarea value={editing.address ?? ""} onChange={e => setEditing(p => ({ ...p, address: e.target.value }))}
              style={{ minHeight: 64 }} />
          </Field>
          <FormGrid style={{ marginTop: 14 }}>
            <Field label="Credit Days">
              <Input type="number" value={editing.creditDays ?? 0} onChange={e => setEditing(p => ({ ...p, creditDays: +e.target.value }))} />
            </Field>
          </FormGrid>
          <div style={{ position: "relative", marginTop: 14 }}>
            <Field label="Notes">
              <Textarea value={editing.notes ?? ""} onChange={e => setEditing(p => ({ ...p, notes: e.target.value.slice(0, 200) }))}
                style={{ minHeight: 72 }} maxLength={200} placeholder="Internal notes about this supplier" />
            </Field>
            <span style={{ position: "absolute", bottom: 8, right: 10, fontSize: 10, color: (editing.notes?.length ?? 0) > 170 ? "#e07" : "var(--muted)", pointerEvents: "none" }}>{editing.notes?.length ?? 0}/200</span>
          </div>
          {!isNew && !(editing.active ?? true) && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, padding: "10px 14px", borderRadius: 9, border: "1px solid #fca5a5", background: "#fef2f2" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#991b1b" }}>Archived supplier</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>This supplier is archived and hidden from selection lists.</div>
              </div>
            </div>
          )}
        </Modal>
      )}

      <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--line)", overflowX: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--th-bg)", textAlign: "left" }}>
              {["Supplier", "Contact", "Phone / WA", "Type", "GSTIN", ""].map(h => (
                <th key={h} style={{ padding: "11px 16px", fontWeight: 700, fontSize: 10, color: "var(--muted)", letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "1px solid var(--line)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} style={{ borderBottom: "1px solid var(--panel-border)" }}>
                <td style={{ padding: "13px 16px" }}>
                  <button onClick={() => setHistorySupplier(s)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)", textDecoration: "underline", textDecorationStyle: "dotted" }}>{s.name}</div>
                    {s.city && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{s.city}, {s.state}</div>}
                    {!s.active && <div style={{ fontSize: 10, fontWeight: 700, color: "#991b1b", background: "#fef2f2", borderRadius: 4, padding: "1px 5px", display: "inline-block", marginTop: 3 }}>Archived</div>}
                  </button>
                </td>
                <td style={{ padding: "13px 16px" }}>
                  <div style={{ fontSize: 13 }}>{s.contactPerson}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{s.email}</div>
                </td>
                <td style={{ padding: "13px 16px" }}>
                  <div style={{ fontSize: 13 }}>{s.phone}</div>
                  {s.whatsapp && s.whatsapp !== s.phone && (
                    <div style={{ fontSize: 11, color: "#25d366", marginTop: 2 }}>WA: {s.whatsapp}</div>
                  )}
                  {s.whatsapp && s.whatsapp === s.phone && (
                    <div style={{ fontSize: 10, color: "#25d366", marginTop: 2 }}>📱 WA same</div>
                  )}
                </td>
                <td style={{ padding: "13px 16px" }}>
                  {(() => { const b = deriveSupplyBadge(s.id, purchaseOrders); return b ? <Badge label={b.label} color={b.color} /> : <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>; })()}
                </td>
                <td style={{ padding: "13px 16px", fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>{s.gstin || "—"}</td>
                <td style={{ padding: "13px 16px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    {canEdit && s.active && <Button variant="secondary" size="sm" onClick={() => openEdit(s)}>Edit</Button>}
                    {canEdit && s.active && <Button variant="danger" size="sm" onClick={() => archiveOrRestore(s)}>Archive</Button>}
                    {canEdit && !s.active && <Button variant="secondary" size="sm" onClick={() => openEdit(s)}>Edit</Button>}
                    {canEdit && !s.active && <Button variant="primary" size="sm" onClick={() => archiveOrRestore(s)}>Restore</Button>}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} style={{ padding: "56px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>{showArchived ? "No archived suppliers" : "No suppliers found"}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
