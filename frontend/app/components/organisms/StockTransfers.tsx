"use client";
import { useState, useEffect } from "react";
import { productName } from "@/app/lib/formatters";
import { nameToColorHex } from "@/app/lib/colorUtils";
import { ArrowLeftRight } from "lucide-react";
import type { StockTransfer, WarehouseLocation, RawClothBatch, FinishedProduct } from "@/app/types";
import Button from "@/app/components/atoms/Button";
import Pagination from "@/app/components/atoms/Pagination";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Textarea from "@/app/components/atoms/Textarea";
import Field from "@/app/components/molecules/Field";
import FormGrid from "@/app/components/molecules/FormGrid";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import { showToast } from "@/app/lib/toast";
import Modal from "@/app/components/atoms/Modal";
import { friendlyError } from "@/app/lib/errors";

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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filter, search]);


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
    } catch (e: unknown) { const msg = friendlyError(e); setErr(msg); showToast(msg, "error"); }
    finally { setSaving(false); }
  }

  async function action(mutation: string, id: string) {
    try {
      await gql(`mutation A($id:ID!){ ${mutation}(id:$id){ transfer{id status} } }`, { id });
      onRefresh();
      const label: Record<string, string> = { dispatchStockTransfer: "Transfer dispatched.", receiveStockTransfer: "Transfer received — stock updated.", cancelStockTransfer: "Transfer cancelled." };
      showToast(label[mutation] || "Transfer updated.", "success");
    } catch (e: unknown) { showToast(friendlyError(e), "error"); }
  }

  const q = search.trim().toLowerCase();
  const filtered = transfers.filter(t =>
    (filter === "ALL" || t.status === filter)
    && (!q
        || t.transferNumber?.toLowerCase().includes(q)
        || t.fromWarehouse?.name?.toLowerCase().includes(q)
        || t.toWarehouse?.name?.toLowerCase().includes(q)
        || (t.rawClothBatch?.designNumber || "").toLowerCase().includes(q)
        || (t.rawClothBatch?.clothColor?.name || "").toLowerCase().includes(q)
        || (t.finishedProduct ? productName(t.finishedProduct) : "").toLowerCase().includes(q)));

  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  /** Stock that has left one godown and not yet arrived at the other — the
   *  thing worth knowing on this screen, and the thing it never showed. */
  const moving = transfers.filter(t => t.status === "IN_TRANSIT");
  const waiting = transfers.filter(t => t.status === "PENDING");
  const inTransitMeters = moving.reduce((a, t) => a + Number(t.metersToTransfer ?? 0), 0);
  const inTransitPieces = moving.reduce((a, t) => a + Number(t.quantityToTransfer ?? 0), 0);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>Stock Transfers</h2>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>
            Cloth and finished goods moving between your godowns.
          </div>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>+ New Transfer</Button>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 1,
        background: "var(--line)", border: "1px solid var(--line)", borderRadius: 14,
        overflow: "hidden", marginBottom: 14,
      }}>
        {([
          ["On the road", String(moving.length), moving.length ? "#6366f1" : undefined],
          ["Cloth in transit", `${inTransitMeters.toLocaleString("en-IN", { maximumFractionDigits: 0 })}m`, undefined],
          ["Pieces in transit", `${inTransitPieces}`, undefined],
          ["Waiting to go", String(waiting.length), waiting.length ? "#e65100" : undefined],
        ] as const).map(([label, value, color]) => (
          <div key={label} style={{ background: "var(--paper)", padding: "15px 18px" }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>
              {label}
            </div>
            <div style={{ fontSize: 25, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <Input placeholder="Transfer number, godown, design number, colour…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
        {["ALL", "PENDING", "IN_TRANSIT", "RECEIVED", "CANCELLED"].map(s => {
          const count = s === "ALL" ? transfers.length : transfers.filter(t => t.status === s).length;
          const active = filter === s;
          return (
            <button type="button" key={s} onClick={() => setFilter(s)} style={{
              padding: "8px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              border: `1px solid ${active ? "var(--primary)" : "var(--line)"}`,
              background: active ? "var(--primary)" : "var(--paper)",
              color: active ? "#fff" : "var(--muted)",
              display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
            }}>
              {s === "ALL" ? "All" : s.replace(/_/g, " ").toLowerCase().replace(/^./, c => c.toUpperCase())}
              {count > 0 && (
                <span style={{
                  background: active ? "rgba(255,255,255,0.25)" : "var(--canvas)",
                  color: active ? "#fff" : "var(--ink)", borderRadius: 99,
                  fontSize: 11, fontWeight: 700, padding: "0 7px", lineHeight: "18px",
                }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{
            border: "1px dashed var(--line)", borderRadius: 12, padding: "52px 24px", textAlign: "center",
          }}>
            <ArrowLeftRight size={30} style={{ opacity: 0.25, marginBottom: 10 }} />
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 5 }}>
              {filter === "ALL" && !q ? "Nothing has moved yet" : "Nothing matches"}
            </div>
            <div style={{ fontSize: 13.5, color: "var(--muted)" }}>
              {filter === "ALL" && !q
                ? "Use New Transfer to send cloth or finished goods to another godown."
                : "Try another status, or clear the search."}
            </div>
          </div>
        ) : paged.map(t => {
          const cloth = t.rawClothBatch;
          const made = t.finishedProduct;
          const colour = cloth?.clothColor ?? made?.clothColor;
          const swatch = colour ? nameToColorHex(colour.name, colour.hexCode) : null;
          const amount = cloth ? `${t.metersToTransfer}m` : `${t.quantityToTransfer} pcs`;

          return (
            <div key={t.id} style={{
              background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12,
              padding: "14px 16px",
              display: "grid",
              gridTemplateColumns: "minmax(150px,1fr) minmax(230px,1.5fr) 110px 190px",
              gap: 16, alignItems: "center",
            }}>
              {/* What is moving. The design number leads, as it does everywhere. */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>
                    {cloth ? (cloth.designNumber || cloth.batchNumber) : (made ? productName(made) : "—")}
                  </span>
                  {colour && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "2px 10px 2px 3px", borderRadius: 99,
                      background: "var(--canvas)", border: "1px solid var(--line)", fontSize: 12.5,
                    }}>
                      <span style={{
                        width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                        background: swatch ?? "transparent", border: "1px solid rgba(0,0,0,.18)",
                      }} />
                      {colour.name}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
                  {cloth ? cloth.clothCategory?.name : [made?.itemType?.name, made?.size].filter(Boolean).join(" · ")}
                  {" · "}{t.transferNumber}
                </div>
              </div>

              {/* The movement itself — the reason this screen exists. */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <span style={{ fontSize: 14.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.fromWarehouse.name}
                </span>
                <ArrowLeftRight size={16} style={{ color: "var(--primary)", flexShrink: 0 }} />
                <span style={{ fontSize: 14.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.toWarehouse.name}
                </span>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: -0.4, lineHeight: 1.1 }}>
                  {amount}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
                  {t.transferKind === "RAW_CLOTH" ? "raw cloth" : "finished"}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                <span style={{
                  fontSize: 11.5, fontWeight: 700, padding: "3px 11px", borderRadius: 100,
                  background: STATUS_BG[t.status] ?? "#f3f4f6", color: STATUS_COLOR[t.status] ?? "#6b7280",
                  whiteSpace: "nowrap",
                }}>
                  {t.status.replace("_", " ")}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  {t.status === "PENDING" && (
                    <>
                      <Button size="sm" variant="primary" style={{ background: "#6366f1" }}
                        onClick={() => action("dispatchStockTransfer", t.id)}>Dispatch</Button>
                      <Button size="sm" variant="secondary"
                        onClick={() => action("cancelStockTransfer", t.id)}>Cancel</Button>
                    </>
                  )}
                  {t.status === "IN_TRANSIT" && (
                    <Button size="sm" variant="primary" style={{ background: "#10b981" }}
                      onClick={() => action("receiveStockTransfer", t.id)}>Mark Received</Button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "right" }}>
                  {t.createdBy?.username && <>by {t.createdBy.username}</>}
                  {t.receivedBy?.username && <> · taken in by {t.receivedBy.username}</>}
                </div>
              </div>

              {t.notes && (
                <div style={{ gridColumn: "1 / -1", fontSize: 12.5, color: "var(--muted)", borderTop: "1px solid var(--line)", paddingTop: 9 }}>
                  {t.notes}
                </div>
              )}
            </div>
          );
        })}
        <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
      </div>


      {/* Create modal */}
      {creating && (
        <Modal
          title="New Stock Transfer"
          width={480}
          onClose={() => { setCreating(false); setErr(""); }}
          onSubmit={handleCreate}
          footer={
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => { setCreating(false); setErr(""); }}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create Transfer"}
              </Button>
            </div>
          }
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <ErrorBanner msg={err} />
              <Field label="What are you moving">
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
                  <Field label="Which cloth" hint="Only cloth sitting in the godown you are sending from.">
                    <Select value={form.rawClothBatchId} onChange={e => setForm(f => ({ ...f, rawClothBatchId: e.target.value }))}>
                      <option value="">Select batch…</option>
                      {rawClothBatches.filter(b => !form.fromWarehouseId || b.warehouse.id === form.fromWarehouseId).map(b => (
                        <option key={b.id} value={b.id}>
                          {b.designNumberProvisional ? b.batchNumber : b.designNumber}
                          {" — "}{b.clothCategory?.name} {b.clothColor?.name} ({b.availableMeters}m left)
                        </option>
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
                        <option key={p.id} value={p.id}>{p.sku} — {productName(p)} {p.size} ({p.quantity} pcs available)</option>
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
        </Modal>
      )}
    </div>
  );
}
