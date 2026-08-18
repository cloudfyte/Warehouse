"use client";
import { useState } from "react";
import type { ReorderPoint, WarehouseLocation, ClothCategory, ClothColor, ItemType } from "@/app/types";
import { showToast } from "@/app/lib/toast";

interface Props {
  reorderPoints: ReorderPoint[]
  warehouses: WarehouseLocation[]
  categories: ClothCategory[]
  colors: ClothColor[]
  itemTypes: ItemType[]
  isAdmin: boolean
  isManager: boolean
  gql: (q: string, v?: Record<string, unknown>) => Promise<unknown>
  onRefresh: () => void
}

const KIND_LABEL: Record<string, string> = { RAW_CLOTH: "Raw Cloth", FINISHED: "Finished Product" };

interface Form {
  itemKind: string; warehouseId: string; active: boolean
  clothCategoryId: string; clothColorId: string; thresholdMeters: string
  itemTypeId: string; size: string; thresholdPieces: string
}
const empty = (): Form => ({
  itemKind: "RAW_CLOTH", warehouseId: "", active: true,
  clothCategoryId: "", clothColorId: "", thresholdMeters: "",
  itemTypeId: "", size: "", thresholdPieces: "",
});

export default function ReorderPoints({ reorderPoints, warehouses, categories, colors, itemTypes, isAdmin, isManager, gql, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ReorderPoint | null>(null);
  const [form, setForm] = useState<Form>(empty());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const canEdit = isAdmin || isManager;

  function openCreate() { setForm(empty()); setEditing(null); setErr(""); setShowForm(true); }
  function openEdit(rp: ReorderPoint) {
    setForm({
      itemKind: rp.itemKind, warehouseId: rp.warehouse.id, active: rp.active,
      clothCategoryId: rp.clothCategory?.id || "", clothColorId: rp.clothColor?.id || "",
      thresholdMeters: rp.thresholdMeters != null ? String(rp.thresholdMeters) : "",
      itemTypeId: rp.itemType?.id || "", size: rp.size || "",
      thresholdPieces: rp.thresholdPieces != null ? String(rp.thresholdPieces) : "",
    });
    setEditing(rp); setErr(""); setShowForm(true);
  }

  async function save() {
    if (!form.warehouseId) { setErr("Select a warehouse."); return; }
    setSaving(true); setErr("");
    try {
      if (editing) {
        await gql(`mutation U($id:ID!,$thresholdMeters:Float,$thresholdPieces:Int,$size:String,$active:Boolean){
          updateReorderPoint(id:$id,thresholdMeters:$thresholdMeters,thresholdPieces:$thresholdPieces,size:$size,active:$active){reorderPoint{id}}
        }`, {
          id: editing.id,
          thresholdMeters: form.thresholdMeters ? parseFloat(form.thresholdMeters) : undefined,
          thresholdPieces: form.thresholdPieces ? parseInt(form.thresholdPieces) : undefined,
          size: form.size || undefined,
          active: form.active,
        });
      } else {
        await gql(`mutation C($itemKind:String!,$warehouseId:ID!,$clothCategoryId:ID,$clothColorId:ID,$thresholdMeters:Float,$itemTypeId:ID,$size:String,$thresholdPieces:Int){
          createReorderPoint(itemKind:$itemKind,warehouseId:$warehouseId,clothCategoryId:$clothCategoryId,clothColorId:$clothColorId,thresholdMeters:$thresholdMeters,itemTypeId:$itemTypeId,size:$size,thresholdPieces:$thresholdPieces){reorderPoint{id}}
        }`, {
          itemKind: form.itemKind, warehouseId: form.warehouseId,
          clothCategoryId: form.clothCategoryId || undefined,
          clothColorId: form.clothColorId || undefined,
          thresholdMeters: form.thresholdMeters ? parseFloat(form.thresholdMeters) : undefined,
          itemTypeId: form.itemTypeId || undefined,
          size: form.size || undefined,
          thresholdPieces: form.thresholdPieces ? parseInt(form.thresholdPieces) : undefined,
        });
      }
      setShowForm(false); onRefresh();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm("Delete this reorder threshold?")) return;
    try {
      await gql(`mutation D($id:ID!){deleteReorderPoint(id:$id){ok}}`, { id });
      onRefresh();
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : "Failed", "error"); }
  }

  // Group by warehouse
  const byWarehouse: Record<string, ReorderPoint[]> = {};
  for (const rp of reorderPoints) {
    const key = rp.warehouse.id;
    if (!byWarehouse[key]) byWarehouse[key] = [];
    byWarehouse[key].push(rp);
  }

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)", fontSize: 13, boxSizing: "border-box" };
  const sel: React.CSSProperties = { ...inp, cursor: "pointer" };

  return (
    <div style={{ padding: "0 0 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Reorder Thresholds</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>Stock levels that trigger low-stock alerts</div>
        </div>
        {canEdit && (
          <button onClick={openCreate} style={{ padding: "9px 18px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            + Add Threshold
          </button>
        )}
      </div>

      {reorderPoints.length === 0 ? (
        <div style={{ textAlign: "center", padding: "72px 24px" }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>🔔</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>No reorder thresholds yet</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>Set minimum stock levels to receive automatic low-stock alerts</div>
          {canEdit && (
            <button onClick={openCreate} style={{ padding: "9px 20px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              + Add First Threshold
            </button>
          )}
        </div>
      ) : (
        Object.entries(byWarehouse).map(([, rps]) => (
          <div key={rps[0].warehouse.id} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, padding: "4px 0", borderBottom: "2px solid var(--primary)", display: "inline-block", paddingRight: 20 }}>
              {rps[0].warehouse.name}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
              {rps.map(rp => (
                <div key={rp.id} style={{
                  background: "var(--paper)", border: `1px solid ${rp.active ? "var(--line)" : "#e5e7eb"}`,
                  borderRadius: 10, padding: "14px 16px", opacity: rp.active ? 1 : 0.6,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 100, background: rp.itemKind === "RAW_CLOTH" ? "#dbeafe" : "#d1fae5", color: rp.itemKind === "RAW_CLOTH" ? "#1d4ed8" : "#065f46" }}>
                          {KIND_LABEL[rp.itemKind] || rp.itemKind}
                        </span>
                        {!rp.active && <span style={{ fontSize: 10, color: "var(--muted)", background: "#f3f4f6", padding: "2px 7px", borderRadius: 100 }}>Inactive</span>}
                      </div>
                      {rp.itemKind === "RAW_CLOTH" ? (
                        <div style={{ fontSize: 13 }}>
                          {rp.clothCategory && <div style={{ fontWeight: 600 }}>{rp.clothCategory.name}</div>}
                          {rp.clothColor && <div style={{ color: "var(--muted)", fontSize: 12 }}>{rp.clothColor.name}</div>}
                          {rp.thresholdMeters != null && (
                            <div style={{ marginTop: 6, fontWeight: 700, color: "#f59e0b" }}>Alert below: {rp.thresholdMeters}m</div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13 }}>
                          {rp.itemType && <div style={{ fontWeight: 600 }}>{rp.itemType.name}</div>}
                          {rp.size && <div style={{ color: "var(--muted)", fontSize: 12 }}>Size: {rp.size}</div>}
                          {rp.thresholdPieces != null && (
                            <div style={{ marginTop: 6, fontWeight: 700, color: "#f59e0b" }}>Alert below: {rp.thresholdPieces} pcs</div>
                          )}
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => openEdit(rp)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--line)", background: "transparent", cursor: "pointer", fontSize: 11 }}>Edit</button>
                        <button onClick={() => del(rp.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #fca5a5", background: "transparent", color: "#dc2626", cursor: "pointer", fontSize: 11 }}>Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--paper)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{editing ? "Edit Threshold" : "Add Reorder Threshold"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {err && <div style={{ background: "#fef2f2", color: "#b91c1c", borderRadius: 7, padding: "10px 14px", fontSize: 13 }}>{err}</div>}
              {!editing && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Item Kind</label>
                  <select value={form.itemKind} onChange={e => setForm(f => ({ ...f, itemKind: e.target.value }))} style={sel}>
                    <option value="RAW_CLOTH">Raw Cloth</option>
                    <option value="FINISHED">Finished Product</option>
                  </select>
                </div>
              )}
              {!editing && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Warehouse</label>
                  <select value={form.warehouseId} onChange={e => setForm(f => ({ ...f, warehouseId: e.target.value }))} style={sel}>
                    <option value="">Select warehouse…</option>
                    {warehouses.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              )}
              {form.itemKind === "RAW_CLOTH" ? (
                <>
                  {!editing && (
                    <>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Cloth Category</label>
                        <select value={form.clothCategoryId} onChange={e => setForm(f => ({ ...f, clothCategoryId: e.target.value }))} style={sel}>
                          <option value="">Any / All</option>
                          {categories.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Cloth Color (optional)</label>
                        <select value={form.clothColorId} onChange={e => setForm(f => ({ ...f, clothColorId: e.target.value }))} style={sel}>
                          <option value="">Any / All</option>
                          {colors.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Alert Threshold (meters)</label>
                    <input type="number" min="0" step="0.5" value={form.thresholdMeters} onChange={e => setForm(f => ({ ...f, thresholdMeters: e.target.value }))} style={inp} placeholder="e.g. 100" />
                  </div>
                </>
              ) : (
                <>
                  {!editing && (
                    <>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Item Type</label>
                        <select value={form.itemTypeId} onChange={e => setForm(f => ({ ...f, itemTypeId: e.target.value }))} style={sel}>
                          <option value="">Any / All</option>
                          {itemTypes.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Size (optional)</label>
                        <input value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} style={inp} placeholder="e.g. M, L, XL" />
                      </div>
                    </>
                  )}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Alert Threshold (pieces)</label>
                    <input type="number" min="1" value={form.thresholdPieces} onChange={e => setForm(f => ({ ...f, thresholdPieces: e.target.value }))} style={inp} placeholder="e.g. 50" />
                  </div>
                </>
              )}
              {editing && (
                <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                  Active (sends alerts when below threshold)
                </label>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <button onClick={() => setShowForm(false)} style={{ padding: "9px 20px", border: "1px solid var(--line)", borderRadius: 8, background: "transparent", color: "var(--ink)", cursor: "pointer" }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ padding: "9px 20px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Threshold"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
