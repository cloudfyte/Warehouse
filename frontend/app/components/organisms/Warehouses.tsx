"use client";
import { useState } from "react";
import type { WarehouseLocation } from "@/app/types";
import StateCity from "@/app/components/atoms/StateCity";
import Modal from "@/app/components/atoms/Modal";
import { friendlyError } from "@/app/lib/errors";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Button from "@/app/components/atoms/Button";
import Field from "@/app/components/molecules/Field";
import FormGrid from "@/app/components/molecules/FormGrid";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import PageHeader from "@/app/components/molecules/PageHeader";

interface Props {
  warehouses: WarehouseLocation[]; isSuperAdmin: boolean; isAdmin: boolean
  onMutate: (q: string, v: Record<string, unknown>) => Promise<void>
}

const LOCATION_TYPES = [
  { value: "WAREHOUSE", label: "Warehouse" },
  { value: "STORE", label: "Retail Store" },
  { value: "PRODUCTION", label: "Production Floor" },
];
const TYPE_COLORS: Record<string, string> = { WAREHOUSE: "#1d4ed8", STORE: "#15803d", PRODUCTION: "#c2410c" };

export default function Warehouses({ warehouses, isSuperAdmin, isAdmin, onMutate }: Props) {
  const [editing, setEditing] = useState<Partial<WarehouseLocation> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canEdit = isSuperAdmin || isAdmin;

  async function save() {
    if (!editing) return;
    setLoading(true); setError("");
    try {
      if (isNew) {
        await onMutate(
          `mutation C($name:String!,$code:String!,$type:String!,$addr:String,$city:String,$phone:String){createWarehouseLocation(name:$name,code:$code,locationType:$type,address:$addr,city:$city,phone:$phone){warehouse{id}}}`,
          { name: editing.name, code: editing.code, type: editing.locationType, addr: editing.address, city: editing.city, phone: editing.phone }
        );
      } else {
        await onMutate(
          `mutation U($id:ID!,$name:String,$type:String,$addr:String,$city:String,$phone:String,$active:Boolean){updateWarehouseLocation(id:$id,name:$name,locationType:$type,address:$addr,city:$city,phone:$phone,active:$active){warehouse{id}}}`,
          { id: editing.id, name: editing.name, type: editing.locationType, addr: editing.address, city: editing.city, phone: editing.phone, active: editing.active }
        );
      }
      setEditing(null);
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Warehouse Locations"
        sub={`${warehouses.length} locations`}
        actions={canEdit && (
          <Button variant="primary" onClick={() => { setIsNew(true); setEditing({ name: "", code: "", locationType: "WAREHOUSE", address: "", city: "", phone: "", active: true }); setError(""); }}>
            + Add Location
          </Button>
        )}
      />

      {editing && (
        <Modal
          title={isNew ? "Add Location" : "Edit Location"}
          subtitle={isNew ? "Add a warehouse, store, or production floor" : `Editing: ${editing.name}`}
          onClose={() => { setEditing(null); setError(""); }}
          width={480}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="primary" style={{ flex: 1 }} onClick={save} disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => { setEditing(null); setError(""); }}>Cancel</Button>
            </div>
          }
        >
          {error && <div style={{ marginBottom: 16 }}><ErrorBanner msg={error} /></div>}
          <FormGrid>
            <Field label="Name" required>
              <Input value={editing.name || ""} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} />
            </Field>
            {isNew && (
              <Field label="Code" required>
                <Input value={editing.code || ""} onChange={e => setEditing(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
              </Field>
            )}
            <Field label="Type">
              <Select value={editing.locationType || "WAREHOUSE"} onChange={e => setEditing(p => ({ ...p, locationType: e.target.value }))}>
                {LOCATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Phone">
              <Input type="tel" value={editing.phone || ""} onChange={e => setEditing(p => ({ ...p, phone: e.target.value }))} />
            </Field>
            <StateCity
              state={(editing as WarehouseLocation & { state?: string }).state || ""}
              city={editing.city || ""}
              onStateChange={v => setEditing(p => ({ ...p, state: v }))}
              onCityChange={v => setEditing(p => ({ ...p, city: v }))}
            />
          </FormGrid>
          <Field label="Address" style={{ marginTop: 14 }}>
            <Input value={editing.address || ""} onChange={e => setEditing(p => ({ ...p, address: e.target.value }))} />
          </Field>
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
                  {(editing.active ?? true) ? "Active location" : "Inactive location"}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                  {(editing.active ?? true) ? "Warehouse is available for stock and orders" : "Location will be hidden from selection lists"}
                </div>
              </div>
            </label>
          )}
        </Modal>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {warehouses.map(w => (
          <div key={w.id} style={{
            background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: 20,
            borderTop: `3px solid ${TYPE_COLORS[w.locationType] || "#888"}`,
            opacity: w.active ? 1 : 0.5,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{w.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace", marginTop: 2 }}>{w.code}</div>
              </div>
              <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: (TYPE_COLORS[w.locationType] || "#888") + "18", color: TYPE_COLORS[w.locationType] || "#888", border: `1px solid ${(TYPE_COLORS[w.locationType] || "#888")}33` }}>
                {LOCATION_TYPES.find(t => t.value === w.locationType)?.label || w.locationType}
              </span>
            </div>
            {w.city && <div style={{ fontSize: 13, color: "var(--muted)" }}>{w.city}</div>}
            {w.address && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>{w.address}</div>}
            {w.phone && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{w.phone}</div>}
            {canEdit && (
              <Button variant="secondary" onClick={() => { setIsNew(false); setEditing(w); setError(""); }}
                style={{ marginTop: 14, width: "100%" }}>
                Edit Location
              </Button>
            )}
          </div>
        ))}
        {warehouses.length === 0 && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 60, color: "var(--muted)", fontSize: 13 }}>
            No locations added yet
          </div>
        )}
      </div>
    </div>
  );
}
