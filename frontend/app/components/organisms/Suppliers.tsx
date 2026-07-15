"use client";
import { useState } from "react";
import type { Supplier } from "@/app/types";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!checked)} style={{ width: 30, height: 17, borderRadius: 9, flexShrink: 0,
      background: checked ? "var(--primary)" : "#bbb", position: "relative", cursor: "pointer", transition: "background 0.18s" }}>
      <div style={{ position: "absolute", top: 2.5, left: checked ? 15 : 2.5, width: 12, height: 12,
        borderRadius: "50%", background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 3px #0004" }} />
    </div>
  );
}
import { SUPPLY_TYPE_LABELS } from "@/app/lib/constants";
import { friendlyError } from "@/app/lib/errors";
import StateCity from "@/app/components/atoms/StateCity";
import Modal from "@/app/components/atoms/Modal";

interface Props { suppliers: Supplier[]; isSuperAdmin: boolean; isAdmin: boolean; isManager?: boolean; onMutate: (q: string, v: Record<string, unknown>) => Promise<void> }

const empty = (): Partial<Supplier> => ({ name: "", contactPerson: "", email: "", phone: "", whatsapp: "", address: "", city: "", state: "", gstin: "", supplyType: "RAW_CLOTH", creditDays: 0, notes: "" });

const SUPPLY_COLORS: Record<string, string> = { RAW_CLOTH: "#2563eb", READYMADE: "#7c3aed", BOTH: "#059669" };

const I: React.CSSProperties = {
  padding: "10px 13px", borderRadius: 9, border: "1px solid var(--line)",
  background: "var(--input-bg)", color: "var(--ink)", fontSize: 14, width: "100%", outline: "none",
};
const BTN_PRI: React.CSSProperties = {
  flex: 1, padding: "11px 0", borderRadius: 9, border: "none",
  background: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14,
};
const BTN_SEC: React.CSSProperties = {
  flex: 1, padding: "11px 0", borderRadius: 9, border: "1px solid var(--line)",
  background: "transparent", color: "var(--ink)", cursor: "pointer", fontSize: 14,
};
const LBL: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 5,
  fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, textTransform: "uppercase",
};

function Badge({ label, color }: { label: string; color: string }) {
  return <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: color + "18", color, border: `1px solid ${color}33` }}>{label}</span>;
}

export default function Suppliers({ suppliers, isSuperAdmin, isAdmin, onMutate }: Props) {
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [waIsSameAsPhone, setWaIsSameAsPhone] = useState(false);

  const canEdit = isSuperAdmin || isAdmin;
  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.contactPerson?.toLowerCase().includes(search.toLowerCase())
  );

  async function save() {
    if (!editing) return;
    if (!editing.name?.trim()) { setError("Company Name is required"); return; }
    setLoading(true); setError("");
    try {
      const m = isNew
        ? `mutation C($name:String!,$cp:String,$email:String,$phone:String,$wa:String,$addr:String,$city:String,$state:String,$gstin:String,$st:String,$cd:Int,$notes:String){createSupplier(name:$name,contactPerson:$cp,email:$email,phone:$phone,whatsapp:$wa,address:$addr,city:$city,state:$state,gstin:$gstin,supplyType:$st,creditDays:$cd,notes:$notes){supplier{id}}}`
        : `mutation U($id:ID!,$name:String,$cp:String,$email:String,$phone:String,$wa:String,$addr:String,$city:String,$state:String,$gstin:String,$st:String,$cd:Int,$notes:String,$active:Boolean){updateSupplier(id:$id,name:$name,contactPerson:$cp,email:$email,phone:$phone,whatsapp:$wa,address:$addr,city:$city,state:$state,gstin:$gstin,supplyType:$st,creditDays:$cd,notes:$notes,active:$active){supplier{id}}}`;
      const cd = editing.creditDays != null ? parseInt(String(editing.creditDays), 10) : undefined;
      await onMutate(m, { id: editing.id, name: editing.name, cp: editing.contactPerson, email: editing.email, phone: editing.phone, wa: editing.whatsapp, addr: editing.address, city: editing.city, state: editing.state, gstin: editing.gstin, st: editing.supplyType, cd: Number.isFinite(cd as number) ? cd : undefined, notes: editing.notes, active: editing.active });
      setEditing(null);
    } catch (e: unknown) { setError(friendlyError(e)); }
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

  const field = (label: string, f: keyof Supplier, type = "text") => (
    <label style={LBL}>{label}
      <input type={type} value={editing?.[f] as string ?? ""} onChange={e => setEditing(p => ({ ...p, [f]: e.target.value }))} style={I} />
    </label>
  );

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Suppliers</h2>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>{suppliers.length} suppliers</p>
        </div>
        {canEdit && (
          <button onClick={openNew} className="primary-button">+ Add Supplier</button>
        )}
      </div>

      <input placeholder="Search suppliers…" value={search} onChange={e => setSearch(e.target.value)}
        style={{ ...I, maxWidth: 360, marginBottom: 16 }} />

      {editing && (
        <Modal
          title={isNew ? "Add Supplier" : "Edit Supplier"}
          subtitle={isNew ? "Add a new cloth supplier" : `Editing: ${editing.name}`}
          onClose={() => { setEditing(null); setError(""); }}
          width={560}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={save} disabled={loading} style={BTN_PRI}>{loading ? "Saving…" : "Save"}</button>
              <button onClick={() => { setEditing(null); setError(""); }} style={BTN_SEC}>Cancel</button>
            </div>
          }
        >
          {error && <div style={{ background: "#fff0ef", border: "1px solid #f1cbc8", color: "#8d3e39", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {field("Company Name *", "name")}
            {field("Contact Person", "contactPerson")}
            {field("Email", "email", "email")}
            {/* Phone */}
            <label style={LBL}>Phone
              <input type="tel" value={editing.phone ?? ""} onChange={e => handlePhoneChange(e.target.value)} style={I} />
            </label>
            {/* WhatsApp with inline toggle — no extra height added to grid row */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, textTransform: "uppercase" }}>WhatsApp</span>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
                  <Toggle checked={waIsSameAsPhone} onChange={handleWaToggle} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: waIsSameAsPhone ? "var(--primary)" : "var(--muted)", whiteSpace: "nowrap" }}>Same as phone</span>
                </label>
              </div>
              <input type="tel" value={editing.whatsapp ?? ""} disabled={waIsSameAsPhone}
                onChange={e => setEditing(p => ({ ...p, whatsapp: e.target.value }))}
                placeholder={waIsSameAsPhone ? editing.phone ?? "" : ""}
                style={{ ...I, opacity: waIsSameAsPhone ? 0.55 : 1, cursor: waIsSameAsPhone ? "not-allowed" : "text" }} />
            </div>
            {field("GSTIN", "gstin")}
            <StateCity
              state={editing.state || ""} city={editing.city || ""}
              onStateChange={v => setEditing(p => ({ ...p, state: v }))}
              onCityChange={v => setEditing(p => ({ ...p, city: v }))}
            />
          </div>
          <label style={{ ...LBL, marginTop: 14 }}>Address
            <textarea value={editing.address ?? ""} onChange={e => setEditing(p => ({ ...p, address: e.target.value }))}
              style={{ ...I, resize: "vertical", minHeight: 64 }} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
            <label style={LBL}>Supply Type
              <select value={editing.supplyType ?? "RAW_CLOTH"} onChange={e => setEditing(p => ({ ...p, supplyType: e.target.value }))} style={I}>
                {Object.entries(SUPPLY_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label style={LBL}>Credit Days
              <input type="number" value={editing.creditDays ?? 0} onChange={e => setEditing(p => ({ ...p, creditDays: +e.target.value }))} style={I} />
            </label>
          </div>
          <div style={{ position: "relative", marginTop: 14 }}>
            <label style={LBL}>Notes
              <textarea value={editing.notes ?? ""} onChange={e => setEditing(p => ({ ...p, notes: e.target.value.slice(0, 200) }))}
                style={{ ...I, resize: "vertical", minHeight: 72 }} maxLength={200} placeholder="Internal notes about this supplier" />
            </label>
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
                  {(editing.active ?? true) ? "Active supplier" : "Inactive supplier"}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                  {(editing.active ?? true) ? "Supplier is available for purchase orders and bills" : "Supplier will be hidden from selection lists"}
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
              {["Supplier", "Contact", "Phone / WA", "Type", "GSTIN", ""].map(h => (
                <th key={h} style={{ padding: "11px 16px", fontWeight: 700, fontSize: 10, color: "var(--muted)", letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "1px solid var(--line)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} style={{ borderBottom: "1px solid var(--panel-border)", opacity: s.active ? 1 : 0.5 }}>
                <td style={{ padding: "13px 16px" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</div>
                  {s.city && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{s.city}, {s.state}</div>}
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
                  <Badge label={SUPPLY_TYPE_LABELS[s.supplyType] || s.supplyType} color={SUPPLY_COLORS[s.supplyType] || "#666"} />
                </td>
                <td style={{ padding: "13px 16px", fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>{s.gstin || "—"}</td>
                <td style={{ padding: "13px 16px" }}>
                  {canEdit && (
                    <button onClick={() => openEdit(s)}
                      style={{ padding: "5px 14px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Edit</button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} style={{ padding: "56px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No suppliers found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
