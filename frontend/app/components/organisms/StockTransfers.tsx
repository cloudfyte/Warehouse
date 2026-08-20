"use client";
import { useState, useEffect } from "react";
import type { StockTransfer, WarehouseLocation, RawClothBatch, FinishedProduct } from "@/app/types";
import Button from "@/app/components/atoms/Button";
import Pagination from "@/app/components/atoms/Pagination";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Textarea from "@/app/components/atoms/Textarea";
import Field from "@/app/components/molecules/Field";
import FormGrid from "@/app/components/molecules/FormGrid";
import PageHeader from "@/app/components/molecules/PageHeader";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import { showToast } from "@/app/lib/toast";

const PER_PAGE = 20;

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
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filter]);

  const filtered = filter === "ALL" ? transfers : transfers.filter(t => t.status === filter);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

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
        const selectedBatch = rawClothBatches.find(b => b.id === form.rawClothBatchId);
        const meters = parseFloat(form.metersToTransfer);
        if (selectedBatch && meters > selectedBatch.availableMeters) {
          setErr(`Only ${selectedBatch.availableMeters}m available in this batch.`); setSaving(false); return;
        }
        vars.rawClothBatchId = form.rawClothBatchId;
        vars.metersToTransfer = meters;
      } else {
        if (!form.finishedProductId || !form.quantityToTransfer) { setErr("Select product and enter quantity."); setSaving(false); return; }
        const selectedProduct = finishedProducts.find(p => p.id === form.finishedProductId);
        const qty = parseInt(form.quantityToTransfer);
        if (selectedProduct && qty > selectedProduct.quantity) {
          setErr(`Only ${selectedProduct.quantity} pcs available for this product.`); setSaving(false); return;
        }
        if (qty < 1) { setErr("Quantity must be at least 1."); setSaving(false); return; }
        vars.finishedProductId = form.finishedProductId;
        vars.quantityToTransfer = qty;
      }
      await gql(`mutation CreateTransfer($fromWarehouseId:ID!,$toWarehouseId:ID!,$transferKind:String!,$rawClothBatchId:ID,$metersToTransfer:Float,$finishedProductId:ID,$quantityToTransfer:Int,$notes:String){
        createStockTransfer(fromWarehouseId:$fromWarehouseId,toWarehouseId:$toWarehouseId,transferKind:$transferKind,rawClothBatchId:$rawClothBatchId,metersToTransfer:$metersToTransfer,finishedProductId:$finishedProductId,quantityToTransfer:$quantityToTransfer,notes:$notes){
          transfer{id}
        }
      }`, vars);
      setCreating(false);
      setForm({ fromWarehouseId: "", toWarehouseId: "", transferKind: "RAW_CLOTH", rawClothBatchId: "", metersToTransfer: "", finishedProductId: "", quantityToTransfer: "", notes: "" });
      onRefresh();
      showToast("Transfer created.", "success");
    } catch (e: unknown) { const msg = e instanceof Error ? e.message : "Failed"; setErr(msg); showToast(msg, "error"); }
    finally { setSaving(false); }
  }

  async function action(mutation: string, id: string) {
    try {
      await gql(`mutation A($id:ID!){ ${mutation}(id:$id){ transfer{id status} } }`, { id });
      onRefresh();
      const label: Record<string, string> = { dispatchStockTransfer: "Transfer dispatched.", markStockTransferReceived: "Transfer received — stock updated.", cancelStockTransfer: "Transfer cancelled." };
      showToast(label[mutation] || "Transfer updated.", "success");
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : "Failed", "error"); }
  }

  return (
    <div style={{ padding: "0 0 40px" }}>
      <PageHeader
        title="Stock Transfers"
        sub="Move cloth or finished products between warehouse locations"
        actions={<Button variant="primary" onClick={() => setCreating(true)}>+ New Transfer</Button>}
      />

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {["ALL", "PENDING", "IN_TRANSIT", "RECEIVED", "CANCELLED"].map(s => {
          const count = s === "ALL" ? transfers.length : transfers.filter(t => t.status === s).length;
          const active = filter === s;
          return (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${active ? "var(--primary)" : "var(--line)"}`,
              background: active ? "var(--primary)" : "var(--paper)",
              color: active ? "#fff" : "var(--muted)",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              {s.replace(/_/g, " ")}
              {count > 0 && (
                <span style={{ background: active ? "rgba(255,255,255,0.25)" : "var(--canvas)", color: active ? "#fff" : "var(--ink)", borderRadius: 99, fontSize: 10, fontWeight: 700, padding: "0 6px", lineHeight: "18px" }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Transfer list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 24px" }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>🔄</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
              {filter === "ALL" ? "No transfers yet" : `No ${filter.replace(/_/g, " ").toLowerCase()} transfers`}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              {filter === "ALL" ? "Use + New Transfer to move stock between warehouse locations" : "Try selecting a different status filter"}
            </div>
          </div>
        ) : paged.map(t => (
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
                    <Button size="sm" variant="primary" style={{ background: "#6366f1" }} onClick={() => action("dispatchStockTransfer", t.id)}>Dispatch</Button>
                    <Button size="sm" variant="secondary" onClick={() => action("cancelStockTransfer", t.id)}>Cancel</Button>
                  </>
                )}
                {t.status === "IN_TRANSIT" && (
                  <Button size="sm" variant="primary" style={{ background: "#10b981" }} onClick={() => action("receiveStockTransfer", t.id)}>Mark Received</Button>
                )}
              </div>
            </div>
          </div>
        ))}
      <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
      </div>

      {/* Create modal */}
      {creating && (
        <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--paper)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>New Stock Transfer</div>
              <button onClick={() => { setCreating(false); setErr(""); }} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--muted)", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <ErrorBanner msg={err} />
              <Field label="Transfer Kind">
                <Select value={form.transferKind} onChange={e => setForm(f => ({ ...f, transferKind: e.target.value, rawClothBatchId: "", finishedProductId: "", metersToTransfer: "", quantityToTransfer: "" }))}>
                  <option value="RAW_CLOTH">Raw Cloth</option>
                  <option value="FINISHED">Finished Products</option>
                </Select>
              </Field>
              <FormGrid gap={10}>
                <Field label="From Warehouse">
                  <Select value={form.fromWarehouseId} onChange={e => setForm(f => ({ ...f, fromWarehouseId: e.target.value }))}>
                    <option value="">Select…</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </Select>
                </Field>
                <Field label="To Warehouse">
                  <Select value={form.toWarehouseId} onChange={e => setForm(f => ({ ...f, toWarehouseId: e.target.value }))}>
                    <option value="">Select…</option>
                    {warehouses.filter(w => w.id !== form.fromWarehouseId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </Select>
                </Field>
              </FormGrid>
              {form.transferKind === "RAW_CLOTH" ? (
                <>
                  <Field label="Cloth Batch">
                    <Select value={form.rawClothBatchId} onChange={e => setForm(f => ({ ...f, rawClothBatchId: e.target.value }))}>
                      <option value="">Select batch…</option>
                      {rawClothBatches.filter(b => !form.fromWarehouseId || b.warehouse.id === form.fromWarehouseId).map(b => (
                        <option key={b.id} value={b.id}>{b.batchNumber} — {b.clothCategory.name} {b.clothColor.name} ({b.availableMeters}m available)</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Meters to Transfer">
                    {(() => {
                      const batch = rawClothBatches.find(b => b.id === form.rawClothBatchId);
                      return (
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <Input type="number" min="0.01" step="0.01"
                            max={batch ? batch.availableMeters : undefined}
                            value={form.metersToTransfer}
                            onChange={e => setForm(f => ({ ...f, metersToTransfer: e.target.value }))}
                            placeholder={batch ? `Max ${batch.availableMeters}m` : "e.g. 50"} />
                          {batch && (
                            <Button variant="secondary" size="sm"
                              onClick={() => setForm(f => ({ ...f, metersToTransfer: String(batch.availableMeters) }))}>
                              All ({batch.availableMeters}m)
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Finished Product">
                    <Select value={form.finishedProductId} onChange={e => setForm(f => ({ ...f, finishedProductId: e.target.value }))}>
                      <option value="">Select product…</option>
                      {finishedProducts.filter(p => !form.fromWarehouseId || p.warehouse?.id === form.fromWarehouseId).map(p => (
                        <option key={p.id} value={p.id}>{p.sku} — {p.itemType.name} {p.size} ({p.quantity} pcs available)</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Quantity to Transfer">
                    {(() => {
                      const prod = finishedProducts.find(p => p.id === form.finishedProductId);
                      return (
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <Input type="number" min="1" step="1"
                            max={prod ? prod.quantity : undefined}
                            value={form.quantityToTransfer}
                            onChange={e => setForm(f => ({ ...f, quantityToTransfer: e.target.value }))}
                            placeholder={prod ? `Max ${prod.quantity} pcs` : "e.g. 20"} />
                          {prod && (
                            <Button variant="secondary" size="sm"
                              onClick={() => setForm(f => ({ ...f, quantityToTransfer: String(prod.quantity) }))}>
                              All ({prod.quantity} pcs)
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                  </Field>
                </>
              )}
              <Field label="Notes (optional)">
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ minHeight: 70, height: 70 }} placeholder="Reason for transfer…" />
              </Field>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => { setCreating(false); setErr(""); }}>Cancel</Button>
              <Button variant="primary" onClick={handleCreate} disabled={saving}>
                {saving ? "Creating…" : "Create Transfer"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
