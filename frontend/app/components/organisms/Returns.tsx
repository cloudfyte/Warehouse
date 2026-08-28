"use client";
import { useState } from "react";
import type { BuyerReturn, SupplierReturn, Buyer, Supplier, FinishedProduct, RawClothBatch, ReadymadeStock, WarehouseLocation } from "@/app/types";
import { STATUS_BADGE_COLORS } from "@/app/lib/constants";
import { formatDateShort } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Badge from "@/app/components/atoms/Badge";
import Button from "@/app/components/atoms/Button";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Textarea from "@/app/components/atoms/Textarea";
import Field from "@/app/components/molecules/Field";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import Pagination from "@/app/components/atoms/Pagination";
import PageHeader from "@/app/components/molecules/PageHeader";
import Drawer from "@/app/components/atoms/Drawer";

const PER_PAGE = 20;

const CREATE_BUYER_RETURN = `mutation CreateBuyerReturn($buyerId:ID!,$finishedProductId:ID!,$quantity:Int!,$condition:String!,$reason:String!,$warehouseId:ID!,$salesOrderId:ID){
  createBuyerReturn(buyerId:$buyerId,finishedProductId:$finishedProductId,quantity:$quantity,condition:$condition,reason:$reason,warehouseId:$warehouseId,salesOrderId:$salesOrderId){
    buyerReturn{id returnNumber}}}`;

const PROCESS_BUYER_RETURN = `mutation ProcessBuyerReturn($id:ID!,$status:String!){
  processBuyerReturn(id:$id,status:$status){buyerReturn{id status}}}`;

const CREATE_SUPPLIER_RETURN = `mutation CreateSupplierReturn($supplierId:ID!,$returnKind:String!,$reason:String!,$warehouseId:ID!,$rawClothBatchId:ID,$metersReturned:Float,$readymadeStockId:ID,$quantityReturned:Int){
  createSupplierReturn(supplierId:$supplierId,returnKind:$returnKind,reason:$reason,warehouseId:$warehouseId,rawClothBatchId:$rawClothBatchId,metersReturned:$metersReturned,readymadeStockId:$readymadeStockId,quantityReturned:$quantityReturned){
    supplierReturn{id returnNumber}}}`;

interface Props {
  buyerReturns: BuyerReturn[]
  supplierReturns: SupplierReturn[]
  buyers: Buyer[]
  suppliers: Supplier[]
  finishedProducts: FinishedProduct[]
  rawClothBatches: RawClothBatch[]
  readymadeStock: ReadymadeStock[]
  warehouses: WarehouseLocation[]
  isAdmin: boolean; isSuperAdmin: boolean; isManager: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>
}

function EmptyTable({ colSpan, icon, title, hint }: { colSpan: number; icon: string; title: string; hint: string }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div style={{ padding: "56px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.35 }}>{icon}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{hint}</div>
        </div>
      </td>
    </tr>
  );
}

const emptyBuyerForm = () => ({ buyerId: "", finishedProductId: "", quantity: 1, condition: "RESTOCKABLE", reason: "", warehouseId: "" });
const emptySupplierForm = () => ({ supplierId: "", returnKind: "RAW_CLOTH", reason: "", warehouseId: "", rawClothBatchId: "", metersReturned: "", readymadeStockId: "", quantityReturned: "" });

export default function Returns({ buyerReturns, supplierReturns, buyers, suppliers, finishedProducts, rawClothBatches, readymadeStock, warehouses, isAdmin, isSuperAdmin, isManager, onMutate }: Props) {
  const [buyerPage, setBuyerPage] = useState(1);
  const [supplierPage, setSupplierPage] = useState(1);

  // Buyer return modal
  const [showBuyer, setShowBuyer] = useState(false);
  const [buyerForm, setBuyerForm] = useState(emptyBuyerForm);
  const [buyerLoading, setBuyerLoading] = useState(false);
  const [buyerErr, setBuyerErr] = useState("");

  // Supplier return modal
  const [showSupplier, setShowSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierErr, setSupplierErr] = useState("");

  const canEdit = isSuperAdmin || isAdmin || isManager;
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function processReturn(id: string, status: string) {
    setProcessingId(id);
    try {
      await onMutate(PROCESS_BUYER_RETURN, { id, status });
      const labels: Record<string, string> = { RECEIVED: "Marked as received", RESTOCKED: "Restocked to inventory", DISCARDED: "Discarded" };
      showToast(labels[status] || "Updated", "success");
    } catch (e) {
      showToast(friendlyError(e), "error");
    } finally {
      setProcessingId(null);
    }
  }

  const pagedBuyer = buyerReturns.slice((buyerPage - 1) * PER_PAGE, buyerPage * PER_PAGE);
  const pagedSupplier = supplierReturns.slice((supplierPage - 1) * PER_PAGE, supplierPage * PER_PAGE);
  const total = buyerReturns.length + supplierReturns.length;

  async function submitBuyerReturn() {
    const { buyerId, finishedProductId, quantity, condition, reason, warehouseId } = buyerForm;
    if (!buyerId || !finishedProductId || !condition || !reason || !warehouseId) {
      setBuyerErr("Fill all required fields."); return;
    }
    setBuyerLoading(true); setBuyerErr("");
    try {
      await onMutate(CREATE_BUYER_RETURN, {
        buyerId, finishedProductId, quantity: Number(quantity), condition, reason, warehouseId,
      });
      setShowBuyer(false); setBuyerForm(emptyBuyerForm);
      showToast("Buyer return recorded.", "success");
    } catch (e: unknown) { setBuyerErr(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setBuyerLoading(false); }
  }

  async function submitSupplierReturn() {
    const { supplierId, returnKind, reason, warehouseId, rawClothBatchId, metersReturned, readymadeStockId, quantityReturned } = supplierForm;
    if (!supplierId || !returnKind || !reason || !warehouseId) {
      setSupplierErr("Fill all required fields."); return;
    }
    if (returnKind === "RAW_CLOTH" && !rawClothBatchId) { setSupplierErr("Select a raw cloth batch."); return; }
    if (returnKind === "READYMADE" && !readymadeStockId) { setSupplierErr("Select a readymade stock item."); return; }
    setSupplierLoading(true); setSupplierErr("");
    try {
      await onMutate(CREATE_SUPPLIER_RETURN, {
        supplierId, returnKind, reason, warehouseId,
        rawClothBatchId: returnKind === "RAW_CLOTH" ? rawClothBatchId : undefined,
        metersReturned: returnKind === "RAW_CLOTH" && metersReturned ? Number(metersReturned) : undefined,
        readymadeStockId: returnKind === "READYMADE" ? readymadeStockId : undefined,
        quantityReturned: returnKind === "READYMADE" && quantityReturned ? Number(quantityReturned) : undefined,
      });
      setShowSupplier(false); setSupplierForm(emptySupplierForm);
      showToast("Supplier return recorded.", "success");
    } catch (e: unknown) { setSupplierErr(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setSupplierLoading(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Returns"
        sub={`${total === 0 ? "No returns recorded" : `${total} return${total === 1 ? "" : "s"} total`}`}
        style={{ marginBottom: 28 }}
      />

      {/* Customer Returns */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Customer Returns</span>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Buyers → Us</span>
          {buyerReturns.length > 0 && <Badge label={String(buyerReturns.length)} />}
          {canEdit && (
            <Button size="sm" onClick={() => { setShowBuyer(true); setBuyerErr(""); }} style={{ marginLeft: "auto" }}>
              + Add Return
            </Button>
          )}
        </div>
        <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--border)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
                {["Return #", "Buyer", "Item", "Qty", "Condition", "Reason", "Date", "Status", ""].map(h => (
                  <th key={h} style={{ padding: "10px 14px", fontWeight: 600, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedBuyer.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600, fontSize: 13, color: "var(--primary)" }}>{r.returnNumber}</td>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>{r.buyer.name}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13 }}>{r.finishedProduct?.itemType?.name ?? "—"} <span style={{ color: "var(--muted)" }}>({r.finishedProduct?.sku ?? "—"})</span></td>
                  <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600 }}>{r.quantity}</td>
                  <td style={{ padding: "12px 14px" }}><Badge label={r.condition} color={STATUS_BADGE_COLORS[r.condition] || "#888"} /></td>
                  <td style={{ padding: "12px 14px", fontSize: 13, maxWidth: 200, color: "var(--muted)" }}>{r.reason}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatDateShort(r.createdAt)}</td>
                  <td style={{ padding: "12px 14px" }}><Badge label={r.status} color={STATUS_BADGE_COLORS[r.status] || "#888"} /></td>
                  <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                    {canEdit && r.status === "PENDING" && (
                      <Button size="sm" variant="secondary" disabled={processingId === r.id} onClick={() => processReturn(r.id, "RECEIVED")}>Receive</Button>
                    )}
                    {canEdit && r.status === "RECEIVED" && r.condition === "RESTOCKABLE" && (
                      <Button size="sm" variant="primary" disabled={processingId === r.id} onClick={() => processReturn(r.id, "RESTOCKED")}>Restock</Button>
                    )}
                    {canEdit && r.status === "RECEIVED" && r.condition === "DAMAGED" && (
                      <Button size="sm" variant="danger" disabled={processingId === r.id} onClick={() => processReturn(r.id, "DISCARDED")}>Discard</Button>
                    )}
                  </td>
                </tr>
              ))}
              {buyerReturns.length === 0 && (
                <EmptyTable colSpan={9} icon="↩️" title="No customer returns" hint="Log a return when a buyer sends goods back" />
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={buyerPage} total={buyerReturns.length} perPage={PER_PAGE} onChange={setBuyerPage} />
      </div>

      {/* Supplier Returns */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Supplier Returns</span>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Us → Suppliers</span>
          {supplierReturns.length > 0 && <Badge label={String(supplierReturns.length)} />}
          {canEdit && (
            <Button size="sm" onClick={() => { setShowSupplier(true); setSupplierErr(""); }} style={{ marginLeft: "auto" }}>
              + Add Return
            </Button>
          )}
        </div>
        <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--border)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
                {["Return #", "Supplier", "Kind", "Details", "Reason", "Date", "Status"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", fontWeight: 600, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedSupplier.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600, fontSize: 13, color: "var(--primary)" }}>{r.returnNumber}</td>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>{r.supplier.name}</td>
                  <td style={{ padding: "12px 14px" }}><Badge label={r.returnKind} color={STATUS_BADGE_COLORS[r.returnKind] || "#888"} /></td>
                  <td style={{ padding: "12px 14px", fontSize: 13 }}>
                    {r.returnKind === "RAW_CLOTH" ? `${r.metersReturned}m — ${r.rawClothBatch?.batchNumber ?? "N/A"}` : `${r.quantityReturned} pcs`}
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 13, maxWidth: 200, color: "var(--muted)" }}>{r.reason}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatDateShort(r.createdAt)}</td>
                  <td style={{ padding: "12px 14px" }}><Badge label={r.status} color={STATUS_BADGE_COLORS[r.status] || "#888"} /></td>
                </tr>
              ))}
              {supplierReturns.length === 0 && (
                <EmptyTable colSpan={7} icon="📦" title="No supplier returns" hint="Log a return when sending goods back to a supplier" />
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={supplierPage} total={supplierReturns.length} perPage={PER_PAGE} onChange={setSupplierPage} />
      </div>

      {/* ── Buyer Return modal ── */}
      {showBuyer && (
        <Drawer
          title="New Customer Return"
          width={480}
          onClose={() => setShowBuyer(false)}
          onSubmit={submitBuyerReturn}
          footer={
            <Button type="submit" disabled={buyerLoading} style={{ width: "100%", fontSize: 15 }}>
              {buyerLoading ? "Recording…" : "Record Return"}
            </Button>
          }
        >
            <ErrorBanner msg={buyerErr} />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Buyer" required>
                <Select value={buyerForm.buyerId} onChange={e => setBuyerForm(f => ({ ...f, buyerId: e.target.value }))}>
                  <option value="">Select buyer</option>
                  {buyers.filter(b => b.active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="Product" required>
                <Select value={buyerForm.finishedProductId} onChange={e => setBuyerForm(f => ({ ...f, finishedProductId: e.target.value }))}>
                  <option value="">Select product</option>
                  {finishedProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.itemType.name}{p.size ? ` (${p.size})` : ""} — {p.sku}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Quantity" required>
                <Input type="number" min="1" value={buyerForm.quantity}
                  onChange={e => setBuyerForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))} />
              </Field>
              <Field label="Condition" required>
                <Select value={buyerForm.condition} onChange={e => setBuyerForm(f => ({ ...f, condition: e.target.value }))}>
                  <option value="RESTOCKABLE">Restockable</option>
                  <option value="DAMAGED">Damaged</option>
                </Select>
              </Field>
              <Field label="Warehouse" required>
                <Select value={buyerForm.warehouseId} onChange={e => setBuyerForm(f => ({ ...f, warehouseId: e.target.value }))}>
                  <option value="">Select warehouse</option>
                  {warehouses.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </Field>
              <Field label="Reason" required>
                <Textarea value={buyerForm.reason} onChange={e => setBuyerForm(f => ({ ...f, reason: e.target.value }))} rows={3} placeholder="Why is the buyer returning this?" style={{ minHeight: "unset" }} />
              </Field>
            </div>
        </Drawer>
      )}

      {/* ── Supplier Return modal ── */}
      {showSupplier && (
        <Drawer
          title="New Supplier Return"
          width={480}
          onClose={() => setShowSupplier(false)}
          onSubmit={submitSupplierReturn}
          footer={
            <Button type="submit" disabled={supplierLoading} style={{ width: "100%", fontSize: 15 }}>
              {supplierLoading ? "Recording…" : "Record Return"}
            </Button>
          }
        >
            <ErrorBanner msg={supplierErr} />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Supplier" required>
                <Select value={supplierForm.supplierId} onChange={e => setSupplierForm(f => ({ ...f, supplierId: e.target.value }))}>
                  <option value="">Select supplier</option>
                  {suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="Return Kind" required>
                <Select value={supplierForm.returnKind} onChange={e => setSupplierForm(f => ({ ...f, returnKind: e.target.value, rawClothBatchId: "", metersReturned: "", readymadeStockId: "", quantityReturned: "" }))}>
                  <option value="RAW_CLOTH">Raw Cloth</option>
                  <option value="READYMADE">Readymade</option>
                </Select>
              </Field>
              {supplierForm.returnKind === "RAW_CLOTH" ? (<>
                <Field label="Raw Cloth Batch" required>
                  <Select value={supplierForm.rawClothBatchId} onChange={e => setSupplierForm(f => ({ ...f, rawClothBatchId: e.target.value }))}>
                    <option value="">Select batch</option>
                    {rawClothBatches.map(b => (
                      <option key={b.id} value={b.id}>{b.batchNumber} — {b.clothCategory.name} / {b.clothColor.name} ({b.availableMeters}m avail)</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Meters Returned">
                  <Input type="number" min="0" step="0.01" value={supplierForm.metersReturned}
                    onChange={e => setSupplierForm(f => ({ ...f, metersReturned: e.target.value }))} placeholder="0.00" />
                </Field>
              </>) : (<>
                <Field label="Readymade Stock Item" required>
                  <Select value={supplierForm.readymadeStockId} onChange={e => setSupplierForm(f => ({ ...f, readymadeStockId: e.target.value }))}>
                    <option value="">Select item</option>
                    {readymadeStock.map(s => (
                      <option key={s.id} value={s.id}>{s.itemType.name}{s.size ? ` (${s.size})` : ""} — {s.quantityAvailable} avail</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Quantity Returned">
                  <Input type="number" min="0" value={supplierForm.quantityReturned}
                    onChange={e => setSupplierForm(f => ({ ...f, quantityReturned: e.target.value }))} placeholder="0" />
                </Field>
              </>)}
              <Field label="Warehouse" required>
                <Select value={supplierForm.warehouseId} onChange={e => setSupplierForm(f => ({ ...f, warehouseId: e.target.value }))}>
                  <option value="">Select warehouse</option>
                  {warehouses.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </Field>
              <Field label="Reason" required>
                <Textarea value={supplierForm.reason} onChange={e => setSupplierForm(f => ({ ...f, reason: e.target.value }))} rows={3} placeholder="Why are you returning this?" style={{ minHeight: "unset" }} />
              </Field>
            </div>
        </Drawer>
      )}
    </div>
  );
}
