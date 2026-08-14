"use client";
import { useState } from "react";
import type { StockTransfer, WarehouseLocation, RawClothBatch, FinishedProduct } from "@/app/types";

const STATUS_COLOR: Record<string, string> = {
  PENDING: "#f59e0b", IN_TRANSIT: "#6366f1", RECEIVED: "#10b981", CANCELLED: "#9ca3af",
};
const STATUS_BG: Record<string, string> = {
  PENDING: "#fef3c7", IN_TRANSIT: "#eef2ff", RECEIVED: "#d1fae5", CANCELLED: "#f3f4f6",
};

interface Props {
  transfers: StockTransfer[]
  warehouses: WarehouseLocation[]
  rawClothBatches: RawClothBatch[]
  finishedProducts: FinishedProduct[]
  gql: (q: string, v?: Record<string, unknown>) => Promise<unknown>
  onRefresh: () => void
}

export default function StockTransfers({ transfers, warehouses, rawClothBatches, finishedProducts, gql, onRefresh }: Props) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    fromWarehouseId: "", toWarehouseId: "", transferKind: "RAW_CLOTH",
    rawClothBatchId: "", metersToTransfer: "", finishedProductId: "", quantityToTransfer: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("ALL");

  const filtered = filter === "ALL" ? transfers : transfers.filter(t => t.status === filter);

  async function handleCreate() {
    if (!form.fromWarehouseId || !form.toWarehouseId) { setErr("Select both warehouses."); return; }
    if (form.fromWarehouseId === form.toWarehouseId) { setErr("Source and destination must be different."); return; }
    setSaving(true); setErr("");
    try {
      const vars: Record<string, unknown> = {
        fromWarehouseId: form.fromWarehouseId, toWarehouseId: form.toWarehouseId,
        transferKind: form.transferKind, notes: form.notes,
      };
      if (form.transferKind === "RAW_CLOTH") {
        if (!form.rawClothBatchId || !form.metersToTransfer) { setErr("Select batch and enter meters."); setSaving(false); return; }
        vars.rawClothBatchId = form.rawClothBatchId;
        vars.metersToTransfer = parseFloat(form.metersToTransfer);
      } else {
        if (!form.finishedProductId || !form.quantityToTransfer) { setErr("Select product and enter quantity."); setSaving(false); return; }
        vars.finishedProductId = form.finishedProductId;
        vars.quantityToTransfer = parseInt(form.quantityToTransfer);
      }
      await gql(`mutation CreateTransfer($fromWarehouseId:ID!,$toWarehouseId:ID!,$transferKind:String!,$rawClothBatchId:ID,$metersToTransfer:Float,$finishedProductId:ID,$quantityToTransfer:Int,$notes:String){
        createStockTransfer(fromWarehouseId:$fromWarehouseId,toWarehouseId:$toWarehouseId,transferKind:$transferKind,rawClothBatchId:$rawClothBatchId,metersToTransfer:$metersToTransfer,finishedProductId:$finishedProductId,quantityToTransfer:$quantityToTransfer,notes:$notes){
          transfer{id}
        }
      }`, vars);
      setCreating(false);
      setForm({ fromWarehouseId: "", toWarehouseId: "", transferKind: "RAW_CLOTH", rawClothBatchId: "", metersToTransfer: "", finishedProductId: "", quantityToTransfer: "", notes: "" });
      onRefresh();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function action(mutation: string, id: string) {
    try {
      await gql(`mutation A($id:ID!){ ${mutation}(id:$id){ transfer{id status} } }`, { id });
      onRefresh();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed"); }
  }

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)", fontSize: 13 };
  const sel: React.CSSProperties = { ...inp, cursor: "pointer" };

  return (
    <div style={{ padding: "0 0 40px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Stock Transfers</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>Move cloth or finished products between warehouse locations</div>
        </div>
        <button onClick={() => setCreating(true)} style={{ padding: "9px 18px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          + New Transfer
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {["ALL", "PENDING", "IN_TRANSIT", "RECEIVED", "CANCELLED"].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${filter === s ? "var(--accent)" : "var(--line)"}`,
            background: filter === s ? "var(--accent)" : "var(--paper)",
            color: filter === s ? "#fff" : "var(--muted)",
          }}>
            {s.replace("_", " ")} {s !== "ALL" ? `(${transfers.filter(t => t.status === s).length})` : `(${transfers.length})`}
          </button>
        ))}
      </div>

      {/* Transfer list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: "var(--muted)", fontSize: 14 }}>No transfers found</div>
        ) : filtered.map(t => (
          <div key={t.id} style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{t.transferNumber}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 100, background: STATUS_BG[t.status] ?? "#f3f4f6", color: STATUS_COLOR[t.status] ?? "#6b7280" }}>
                    {t.status.replace("_", " ")}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--muted)", background: "var(--canvas)", padding: "2px 8px", borderRadius: 100 }}>{t.transferKind.replace("_", " ")}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>{t.fromWarehouse.name}</span>
                  <span style={{ margin: "0 8px" }}>→</span>
                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>{t.toWarehouse.name}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {t.rawClothBatch && <span>{t.rawClothBatch.clothCategory.name} · {t.rawClothBatch.clothColor.name} · <strong>{t.metersToTransfer}m</strong></span>}
                  {t.finishedProduct && <span>{t.finishedProduct.itemType.name} ({t.finishedProduct.sku}) · <strong>{t.quantityToTransfer} pcs</strong></span>}
                </div>
                {t.notes && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, fontStyle: "italic" }}>{t.notes}</div>}
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                  {t.createdBy?.username && <span>Created by {t.createdBy.username}</span>}
                  {t.receivedBy?.username && <span> · Received by {t.receivedBy.username}</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {t.status === "PENDING" && (
                  <>
                    <button onClick={() => action("dispatchStockTransfer", t.id)} style={{ padding: "7px 14px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Dispatch</button>
                    <button onClick={() => action("cancelStockTransfer", t.id)} style={{ padding: "7px 14px", background: "transparent", color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 7, fontSize: 12, cursor: "pointer" }}>Cancel</button>
                  </>
                )}
                {t.status === "IN_TRANSIT" && (
                  <button onClick={() => action("receiveStockTransfer", t.id)} style={{ padding: "7px 14px", background: "#10b981", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Mark Received</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create modal */}
      {creating && (
        <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--paper)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>New Stock Transfer</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {err && <div style={{ background: "#fef2f2", color: "#b91c1c", borderRadius: 7, padding: "10px 14px", fontSize: 13 }}>{err}</div>}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Transfer Kind</label>
                <select value={form.transferKind} onChange={e => setForm(f => ({ ...f, transferKind: e.target.value, rawClothBatchId: "", finishedProductId: "" }))} style={sel}>
                  <option value="RAW_CLOTH">Raw Cloth</option>
                  <option value="FINISHED">Finished Products</option>
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>From Warehouse</label>
                  <select value={form.fromWarehouseId} onChange={e => setForm(f => ({ ...f, fromWarehouseId: e.target.value }))} style={sel}>
                    <option value="">Select…</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>To Warehouse</label>
                  <select value={form.toWarehouseId} onChange={e => setForm(f => ({ ...f, toWarehouseId: e.target.value }))} style={sel}>
                    <option value="">Select…</option>
                    {warehouses.filter(w => w.id !== form.fromWarehouseId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              </div>
              {form.transferKind === "RAW_CLOTH" ? (
                <>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Cloth Batch</label>
                    <select value={form.rawClothBatchId} onChange={e => setForm(f => ({ ...f, rawClothBatchId: e.target.value }))} style={sel}>
                      <option value="">Select batch…</option>
                      {rawClothBatches.filter(b => !form.fromWarehouseId || b.warehouse.id === form.fromWarehouseId).map(b => (
                        <option key={b.id} value={b.id}>{b.batchNumber} — {b.clothCategory.name} {b.clothColor.name} ({b.availableMeters}m available)</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Meters to Transfer</label>
                    <input type="number" min="0.01" step="0.01" value={form.metersToTransfer} onChange={e => setForm(f => ({ ...f, metersToTransfer: e.target.value }))} style={inp} placeholder="e.g. 50" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Finished Product</label>
                    <select value={form.finishedProductId} onChange={e => setForm(f => ({ ...f, finishedProductId: e.target.value }))} style={sel}>
                      <option value="">Select product…</option>
                      {finishedProducts.filter(p => !form.fromWarehouseId || p.warehouse.id === form.fromWarehouseId).map(p => (
                        <option key={p.id} value={p.id}>{p.sku} — {p.itemType.name} {p.size} ({p.quantity} pcs available)</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Quantity to Transfer</label>
                    <input type="number" min="1" value={form.quantityToTransfer} onChange={e => setForm(f => ({ ...f, quantityToTransfer: e.target.value }))} style={inp} placeholder="e.g. 20" />
                  </div>
                </>
              )}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Notes (optional)</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inp, height: 70, resize: "vertical" }} placeholder="Reason for transfer…" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <button onClick={() => { setCreating(false); setErr(""); }} style={{ padding: "9px 20px", border: "1px solid var(--line)", borderRadius: 8, background: "transparent", color: "var(--ink)", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} style={{ padding: "9px 20px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Creating…" : "Create Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
