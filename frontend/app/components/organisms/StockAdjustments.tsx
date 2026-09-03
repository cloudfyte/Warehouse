"use client";
import { useState, useEffect } from "react";
import { formatDate, productName } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Textarea from "@/app/components/atoms/Textarea";
import Button from "@/app/components/atoms/Button";
import Field from "@/app/components/molecules/Field";
import FormGrid from "@/app/components/molecules/FormGrid";
import FilterBar from "@/app/components/molecules/FilterBar";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import PageHeader from "@/app/components/molecules/PageHeader";
import ConfirmDialog from "@/app/components/molecules/ConfirmDialog";
import type { ConfirmState } from "@/app/types";
import { downloadCsv } from "@/app/lib/csv";
import Pagination from "@/app/components/atoms/Pagination";
import { showToast } from "@/app/lib/toast";
import Modal from "@/app/components/atoms/Modal";

interface RawClothBatch {
  id: string; batchNumber: string
  clothCategory: { name: string }; clothColor: { name: string }; availableMeters: number
}
interface FinishedProduct {
  id: string; sku: string; itemType: { name: string }; size: string; quantity: number
}
interface Warehouse { id: string; name: string }

interface StockAdjustment {
  id: string; adjustmentNumber: string; itemKind: string
  rawClothBatch?: { id: string; batchNumber: string; clothCategory: { name: string }; clothColor: { name: string } }
  finishedProduct?: { id: string; sku: string; itemType: { name: string } }
  quantityChange: number; adjustmentType: string; reason: string
  warehouse: { id: string; name: string }; createdAt: string
}

interface Props {
  adjustments: StockAdjustment[]
  rawClothBatches: RawClothBatch[]
  finishedProducts: FinishedProduct[]
  warehouses: Warehouse[]
  isAdmin: boolean; isSuperAdmin: boolean; isManager: boolean; isStoreKeeper: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>
}

const PER_PAGE = 20;

const ADJ_TYPE_LABELS: Record<string, string> = {
  DAMAGE: "Damage / Write-off", LOSS: "Loss / Theft",
  QC_REJECT: "QC Rejection", CORRECTION: "Stock Correction", FOUND: "Found / Surplus",
};
const ADJ_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  DAMAGE: { bg: "#ffebee", color: "#c62828" },
  LOSS: { bg: "#fff8e1", color: "#e65100" },
  QC_REJECT: { bg: "#f3e5f5", color: "#6a1b9a" },
  CORRECTION: { bg: "#e3f2fd", color: "#1565c0" },
  FOUND: { bg: "#e8f5e9", color: "#2e7d32" },
};


export default function StockAdjustments({
  adjustments, rawClothBatches, finishedProducts, warehouses,
  isAdmin, isSuperAdmin, isManager, isStoreKeeper, onMutate,
}: Props) {
  const canCreate = isSuperAdmin || isAdmin || isManager || isStoreKeeper;
  const canDelete = isSuperAdmin || isAdmin;

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, typeFilter]);

  // Form
  const [itemKind, setItemKind] = useState<"RAW_CLOTH" | "FINISHED_PRODUCT">("RAW_CLOTH");
  const [batchId, setBatchId] = useState("");
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [quantityChange, setQuantityChange] = useState("");
  const [adjustmentType, setAdjustmentType] = useState("DAMAGE");
  const [reason, setReason] = useState("");

  function resetForm() {
    setBatchId(""); setProductId(""); setQuantityChange("");
    setAdjustmentType("DAMAGE"); setReason(""); setErr("");
    setItemKind("RAW_CLOTH");
  }

  const filtered = adjustments.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      a.adjustmentNumber.toLowerCase().includes(q) ||
      (a.rawClothBatch?.batchNumber || "").toLowerCase().includes(q) ||
      (a.finishedProduct?.sku || "").toLowerCase().includes(q) ||
      (a.finishedProduct?.itemType?.name || "").toLowerCase().includes(q) ||
      a.reason.toLowerCase().includes(q);
    const matchType = !typeFilter || a.adjustmentType === typeFilter;
    return matchSearch && matchType;
  });
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  async function handleSubmit() {
    setErr("");
    if (!warehouseId) return setErr("Please select a warehouse.");
    if (!quantityChange || Number(quantityChange) === 0) return setErr("Quantity change cannot be zero.");
    if (!reason.trim()) return setErr("Reason is required.");
    if (itemKind === "RAW_CLOTH" && !batchId) return setErr("Please select a raw cloth batch.");
    if (itemKind === "FINISHED_PRODUCT" && !productId) return setErr("Please select a finished product.");

    setSaving(true);
    try {
      await onMutate(
        `mutation Adj($itemKind:String!,$qtyChange:Float!,$adjType:String!,$reason:String!,$warehouseId:ID!,$batchId:ID,$productId:ID){
          createStockAdjustment(itemKind:$itemKind,quantityChange:$qtyChange,adjustmentType:$adjType,reason:$reason,warehouseId:$warehouseId,rawClothBatchId:$batchId,finishedProductId:$productId){
            adjustment{ id adjustmentNumber }
          }
        }`,
        {
          itemKind, qtyChange: parseFloat(quantityChange),
          adjType: adjustmentType, reason: reason.trim(),
          warehouseId,
          batchId: itemKind === "RAW_CLOTH" ? batchId : null,
          productId: itemKind === "FINISHED_PRODUCT" ? productId : null,
        }
      );
      setShowForm(false);
      resetForm();
      showToast("Stock adjustment recorded.", "success");
    } catch (e) {
      setErr(friendlyError(e));
      showToast(friendlyError(e), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await onMutate(
        `mutation D($id:ID!){deleteStockAdjustment(id:$id){ok}}`,
        { id }
      );
      showToast("Adjustment deleted and stock reversed.", "success");
    } catch (e) {
      showToast(friendlyError(e), "error");
    } finally {
      setDeleting(null);
    }
  }

  // Auto-set warehouse when batch or product is selected
  function handleBatchSelect(id: string) {
    setBatchId(id);
    const batch = rawClothBatches.find(b => b.id === id);
    if (batch) {
      // no direct warehouse on batch in props, keep existing
    }
  }

  const selectedBatch = rawClothBatches.find(b => b.id === batchId);
  const selectedProduct = finishedProducts.find(p => p.id === productId);

  return (
    <div style={{ padding: 28 }}>
      <PageHeader
        title="Stock Adjustments"
        sub="Record damage, loss, corrections or surplus for raw cloth and finished goods"
        actions={<>
          <Button variant="secondary" size="sm" onClick={() => downloadCsv(`stock-adj-${new Date().toISOString().slice(0,10)}.csv`, adjustments.map(a => ({
            "Adj #": a.adjustmentNumber, Kind: a.itemKind, Type: ADJ_TYPE_LABELS[a.adjustmentType] || a.adjustmentType,
            Batch: a.rawClothBatch?.batchNumber || "", Product: a.finishedProduct?.sku || "",
            "Qty Change": a.quantityChange, Reason: a.reason, Warehouse: a.warehouse.name,
            Date: a.createdAt?.slice(0,10),
          })))}>
            ↓ Export CSV
          </Button>
          {canCreate && (
            <Button variant="primary" onClick={() => { setShowForm(true); setErr(""); }}>
              + Record Adjustment
            </Button>
          )}
        </>}
      />

      <FilterBar style={{ marginBottom: 20 }}>
        <Input placeholder="Search batch, SKU, reason…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }} />
        <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ minWidth: 180 }}>
          <option value="">All types</option>
          {Object.entries(ADJ_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </FilterBar>

      {/* Summary chips */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {Object.entries(ADJ_TYPE_COLORS).map(([type, colors]) => {
          const count = adjustments.filter(a => a.adjustmentType === type).length;
          if (!count) return null;
          return (
            <div key={type} style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: colors.bg, color: colors.color }}>
              {ADJ_TYPE_LABELS[type]}: {count}
            </div>
          );
        })}
      </div>

      {/* Adjustments list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)" }}>
          No adjustments recorded.{canCreate ? ' Click "Record Adjustment" to add one.' : ""}
        </div>
      ) : (
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--canvas)" }}>
                {["Adj #", "Type", "Item", "Change", "Reason", "Warehouse", "Date", canDelete ? "" : ""].filter(Boolean).map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map(adj => {
                const colors = ADJ_TYPE_COLORS[adj.adjustmentType] ?? { bg: "#eee", color: "#333" };
                const isPositive = adj.quantityChange > 0;
                return (
                  <tr key={adj.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 700 }}>{adj.adjustmentNumber}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: colors.bg, color: colors.color }}>
                        {ADJ_TYPE_LABELS[adj.adjustmentType] || adj.adjustmentType}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {adj.itemKind === "RAW_CLOTH" ? (
                        <span>
                          <span style={{ fontSize: 11, color: "var(--muted)", marginRight: 4 }}>Cloth</span>
                          {adj.rawClothBatch?.batchNumber || "—"}
                          {adj.rawClothBatch && (
                            <span style={{ color: "var(--muted)", fontSize: 11 }}> · {adj.rawClothBatch.clothCategory.name} {adj.rawClothBatch.clothColor.name}</span>
                          )}
                        </span>
                      ) : (
                        <span>
                          <span style={{ fontSize: 11, color: "var(--muted)", marginRight: 4 }}>FP</span>
                          {adj.finishedProduct?.sku || "—"}
                          {adj.finishedProduct && (
                            <span style={{ color: "var(--muted)", fontSize: 11 }}> · {productName(adj.finishedProduct)}</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: isPositive ? "#2e7d32" : "#c62828" }}>
                      {isPositive ? "+" : ""}{adj.quantityChange}
                      <span style={{ fontSize: 11, fontWeight: 400, color: "var(--muted)", marginLeft: 3 }}>
                        {adj.itemKind === "RAW_CLOTH" ? "m" : "pcs"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={adj.reason}>
                      {adj.reason}
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--muted)", fontSize: 12 }}>{adj.warehouse.name}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--muted)" }}>{formatDate(adj.createdAt)}</td>
                    {canDelete && (
                      <td style={{ padding: "10px 14px" }}>
                        <Button variant="danger" size="sm" onClick={() => setConfirmDelete(adj.id)} disabled={deleting === adj.id}>
                          {deleting === adj.id ? "…" : "Delete"}
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />

      {/* Create Adjustment Modal */}
      {showForm && (
        <Modal
          title="Record Stock Adjustment"
          width={560}
          onClose={() => { setShowForm(false); resetForm(); }}
          onSubmit={handleSubmit}
          footer={
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => { setShowForm(false); resetForm(); }}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Record Adjustment"}
              </Button>
            </div>
          }
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Item Kind toggle */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Adjust what?</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["RAW_CLOTH", "FINISHED_PRODUCT"] as const).map(k => (
                    <button type="button" key={k} onClick={() => { setItemKind(k); setBatchId(""); setProductId(""); }}
                      style={{ padding: "8px 16px", borderRadius: 20, border: "1px solid var(--line)", cursor: "pointer", fontSize: 13, fontWeight: 600,
                        background: itemKind === k ? "var(--primary)" : "var(--canvas)",
                        color: itemKind === k ? "#fff" : "var(--ink)" }}>
                      {k === "RAW_CLOTH" ? "🧵 Raw Cloth" : "👕 Finished Product"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Select item */}
              {itemKind === "RAW_CLOTH" ? (
                <Field label="Raw Cloth Batch" required>
                  <>
                    <Select value={batchId} onChange={e => handleBatchSelect(e.target.value)}>
                      <option value="">Select batch…</option>
                      {rawClothBatches.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.batchNumber} — {b.clothCategory.name} {b.clothColor.name} ({b.availableMeters}m available)
                        </option>
                      ))}
                    </Select>
                    {selectedBatch && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                        Available: <strong>{selectedBatch.availableMeters}m</strong>
                      </div>
                    )}
                  </>
                </Field>
              ) : (
                <Field label="Finished Product" required>
                  <>
                    <Select value={productId} onChange={e => setProductId(e.target.value)}>
                      <option value="">Select product…</option>
                      {finishedProducts.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {productName(p)}{p.size ? ` (${p.size})` : ""} ({p.quantity} pcs available)
                        </option>
                      ))}
                    </Select>
                    {selectedProduct && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                        Available: <strong>{selectedProduct.quantity} pcs</strong>
                      </div>
                    )}
                  </>
                </Field>
              )}

              <FormGrid>
                <Field label="Adjustment Type" required>
                  <Select value={adjustmentType} onChange={e => setAdjustmentType(e.target.value)}>
                    {Object.entries(ADJ_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Quantity Change" required hint="negative = reduce, positive = add">
                  <Input type="number" step={itemKind === "RAW_CLOTH" ? "0.1" : "1"}
                    placeholder={itemKind === "RAW_CLOTH" ? "e.g. -5.5 (meters)" : "e.g. -3 (pieces)"}
                    value={quantityChange} onChange={e => setQuantityChange(e.target.value)} />
                </Field>
              </FormGrid>

              <Field label="Warehouse" required>
                <Select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </Field>

              <Field label="Reason" required>
                <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                  placeholder="Describe what happened — e.g. 'Machine oil stain on 3 meters', 'QC rejected 2 pieces with stitching defect'…" />
              </Field>

              {/* Preview */}
              {quantityChange && Number(quantityChange) !== 0 && (
                <div style={{
                  background: Number(quantityChange) < 0 ? "#fff5f5" : "#f0fff4",
                  border: `1px solid ${Number(quantityChange) < 0 ? "#fcc" : "#b2f0cc"}`,
                  borderRadius: 9, padding: "10px 14px", fontSize: 13,
                }}>
                  <strong>{Number(quantityChange) < 0 ? "⚠️ Reducing" : "✅ Adding"}</strong>{" "}
                  stock by{" "}
                  <strong>{Math.abs(Number(quantityChange))}{itemKind === "RAW_CLOTH" ? "m" : " pcs"}</strong>
                  {" "}— Type: <strong>{ADJ_TYPE_LABELS[adjustmentType]}</strong>
                </div>
              )}

              <ErrorBanner msg={err} />
            </div>
        </Modal>
      )}

      {confirmDelete !== null && (
        <ConfirmDialog
          state={{
            open: true,
            title: "Delete Adjustment",
            message: "This will permanently delete the adjustment and reverse the stock change. This action cannot be undone.",
            confirmLabel: "Delete",
            onConfirm: () => handleDelete(confirmDelete),
          } satisfies ConfirmState}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
