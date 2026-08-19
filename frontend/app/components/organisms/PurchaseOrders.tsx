"use client";
import { useState } from "react";
import type { PurchaseOrder, ParcelInspection, Supplier, WarehouseLocation, ClothCategory, ClothColor, ItemType } from "@/app/types";
import { PO_STATUS_LABELS, STATUS_BADGE_COLORS } from "@/app/lib/constants";
import { friendlyError } from "@/app/lib/errors";
import { formatMoney, formatDateShort } from "@/app/lib/formatters";
import CreatableSelect from "@/app/components/atoms/CreatableSelect";
import SizeSelect from "@/app/components/atoms/SizeSelect";
import AgeGroupSelect from "@/app/components/atoms/AgeGroupSelect";
import { printDoc, fmtMoney, fmtDate } from "@/app/lib/print";
import { downloadCsv } from "@/app/lib/csv";
import { nameToColorHex } from "@/app/lib/colorUtils";
import Button from "@/app/components/atoms/Button";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Textarea from "@/app/components/atoms/Textarea";
import FileInput from "@/app/components/atoms/FileInput";
import Checkbox from "@/app/components/atoms/Checkbox";
import Field from "@/app/components/molecules/Field";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import PageHeader from "@/app/components/molecules/PageHeader";
import FilterBar from "@/app/components/molecules/FilterBar";

interface Props {
  orders: PurchaseOrder[]; suppliers: Supplier[]; warehouses: WarehouseLocation[]
  categories: ClothCategory[]; colors: ClothColor[]; itemTypes: ItemType[]
  isAdmin: boolean; isSuperAdmin: boolean; isManager: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>
}

function Badge({ s }: { s: string }) {
  return <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, background: (STATUS_BADGE_COLORS[s] || "#888") + "22", color: STATUS_BADGE_COLORS[s] || "#888" }}>{PO_STATUS_LABELS[s] || s}</span>;
}

interface POItem { kind: "RAW_CLOTH" | "READYMADE"; categoryId: string; colorId: string; meters: number; itemTypeId: string; itemName: string; ageGroup: string; size: string; qty: number; unitPrice: number }
const emptyItem = (): POItem => ({ kind: "RAW_CLOTH", categoryId: "", colorId: "", meters: 0, itemTypeId: "", itemName: "", ageGroup: "", size: "", qty: 0, unitPrice: 0 });

const STATUSES = ["DRAFT", "PLACED", "DISPATCHED", "RECEIVED", "VERIFIED", "CANCELLED"];
const PO_NEXT: Record<string, string> = { DRAFT: "PLACED", PLACED: "DISPATCHED", DISPATCHED: "RECEIVED", RECEIVED: "VERIFIED" };

const CONDITION_LABEL: Record<string, string> = { GOOD: "Good Condition", PARTIAL_DAMAGE: "Partial Damage", DAMAGED: "Damaged" };
const CONDITION_COLOR: Record<string, string> = { GOOD: "#10b981", PARTIAL_DAMAGE: "#f59e0b", DAMAGED: "#ef4444" };

export default function PurchaseOrders({ orders, suppliers, warehouses, categories, colors, itemTypes, isAdmin, isSuperAdmin, isManager, onMutate }: Props) {
  const [detail, setDetail] = useState<PurchaseOrder | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Parcel inspection state
  const [showInspection, setShowInspection] = useState(false);
  const [inspection, setInspection] = useState<ParcelInspection | null>(null);
  const [inspForm, setInspForm] = useState({
    parcelCondition: "GOOD", quantityCheckPassed: true,
    discrepancyNotes: "", notes: "", inspectionDate: new Date().toISOString().slice(0, 10),
    proofImage: "",
  });
  const [inspSaving, setInspSaving] = useState(false);
  const [inspErr, setInspErr] = useState("");

  // New PO form state
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const defaultDelivery = () => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); };
  const [expectedDelivery, setExpectedDelivery] = useState(defaultDelivery);
  const [poNotes, setPoNotes] = useState("");
  const [items, setItems] = useState<POItem[]>([emptyItem()]);
  // orderType derived from items — no manual dropdown needed
  const orderType = items.every(i => i.kind === "RAW_CLOTH") ? "RAW_CLOTH"
    : items.every(i => i.kind === "READYMADE") ? "READYMADE"
    : "MIXED";
  const [submitted, setSubmitted] = useState(false);

  const canEdit = isSuperAdmin || isAdmin || isManager;
  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    if (q && !o.poNumber.toLowerCase().includes(q) && !o.supplier.name.toLowerCase().includes(q)) return false;
    if (statusFilter && o.status !== statusFilter) return false;
    if (dateFrom && o.orderDate < dateFrom) return false;
    if (dateTo && o.orderDate > dateTo) return false;
    return true;
  });

  async function createCategory(name: string): Promise<string> {
    const r = await onMutate(`mutation C($n:String!){createClothCategory(name:$n,description:""){category{id name}}}`, { n: name });
    return r.createClothCategory.category.id;
  }
  async function createColor(name: string): Promise<string> {
    const hex = nameToColorHex(name);
    const r = await onMutate(`mutation C($n:String!,$h:String!){createClothColor(name:$n,hexCode:$h){color{id name}}}`, { n: name, h: hex });
    return r.createClothColor.color.id;
  }
  async function createItemType(name: string): Promise<string> {
    const r = await onMutate(`mutation C($n:String!){createItemType(name:$n,category:"OTHER",clothLengthPerPiece:1.0){itemType{id name}}}`, { n: name });
    return r.createItemType.itemType.id;
  }

  function resetForm() {
    setSupplierId(""); setWarehouseId("");
    setExpectedDelivery(defaultDelivery()); setPoNotes(""); setItems([emptyItem()]);
    setError(""); setSubmitted(false);
  }

  function updateItem(idx: number, patch: Partial<POItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  async function createPO() {
    setSubmitted(true);
    if (!supplierId || !warehouseId) { setError("Please select a supplier and destination warehouse."); return; }
    if (items.some(it => it.kind === "RAW_CLOTH" ? (!it.categoryId || !it.meters) : (!it.itemTypeId || !it.qty))) {
      setError("Fill in all required fields highlighted in red below."); return;
    }
    setLoading(true); setError("");
    try {
      const gqlItems = items.map(it => it.kind === "RAW_CLOTH"
        ? { itemKind: "RAW_CLOTH", clothCategoryId: it.categoryId, clothColorId: it.colorId || undefined, orderedMeters: Number(it.meters), unitPrice: Number(it.unitPrice) }
        : { itemKind: "READYMADE", itemTypeId: it.itemTypeId, clothColorId: it.colorId || undefined, itemName: it.itemName, ageGroup: it.ageGroup || undefined, size: it.size, orderedQuantity: Number(it.qty), unitPrice: Number(it.unitPrice) }
      );
      await onMutate(
        `mutation C($sup:ID!,$wh:ID!,$type:String!,$del:Date,$notes:String,$items:[POItemInput!]!){createPurchaseOrder(supplierId:$sup,warehouseId:$wh,orderType:$type,expectedDelivery:$del,notes:$notes,items:$items){purchaseOrder{id poNumber}}}`,
        { sup: supplierId, wh: warehouseId, type: orderType, del: expectedDelivery || undefined, notes: poNotes || undefined, items: gqlItems }
      );
      setShowNew(false); resetForm();
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setLoading(false); }
  }

  async function updateStatus(id: string, status: string) {
    setLoading(true); setError("");
    try {
      await onMutate(`mutation U($id:ID!,$s:String!){updatePurchaseOrderStatus(id:$id,status:$s){purchaseOrder{id status}}}`, { id, s: status });
      setDetail(d => d ? { ...d, status } : null);
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setLoading(false); }
  }

  function openInspection(po: PurchaseOrder) {
    const existing = po.parcelInspection;
    if (existing) {
      setInspForm({
        parcelCondition: existing.parcelCondition,
        quantityCheckPassed: existing.quantityCheckPassed,
        discrepancyNotes: existing.discrepancyNotes || "",
        notes: existing.notes || "",
        inspectionDate: existing.inspectionDate,
        proofImage: existing.photos || "",
      });
      setInspection(existing);
    } else {
      setInspForm({ parcelCondition: "GOOD", quantityCheckPassed: true, discrepancyNotes: "", notes: "", inspectionDate: new Date().toISOString().slice(0, 10), proofImage: "" });
      setInspection(null);
    }
    setInspErr(""); setShowInspection(true);
  }

  async function saveInspection() {
    if (!detail) return;
    setInspSaving(true); setInspErr("");
    try {
      let savedId = inspection?.id ?? "";
      if (inspection) {
        await onMutate(
          `mutation U($id:ID!,$cond:String,$qcp:Boolean,$dn:String,$photos:String,$notes:String){updateParcelInspection(id:$id,parcelCondition:$cond,quantityCheckPassed:$qcp,discrepancyNotes:$dn,photos:$photos,notes:$notes){inspection{id parcelCondition}}}`,
          { id: inspection.id, cond: inspForm.parcelCondition, qcp: inspForm.quantityCheckPassed, dn: inspForm.discrepancyNotes || undefined, photos: inspForm.proofImage || undefined, notes: inspForm.notes || undefined }
        );
      } else {
        const r = await onMutate(
          `mutation C($poId:ID!,$date:Date!,$cond:String,$qcp:Boolean,$dn:String,$photos:String,$notes:String){createParcelInspection(poId:$poId,inspectionDate:$date,parcelCondition:$cond,quantityCheckPassed:$qcp,discrepancyNotes:$dn,photos:$photos,notes:$notes){inspection{id parcelCondition}}}`,
          { poId: detail.id, date: inspForm.inspectionDate, cond: inspForm.parcelCondition, qcp: inspForm.quantityCheckPassed, dn: inspForm.discrepancyNotes || undefined, photos: inspForm.proofImage || undefined, notes: inspForm.notes || undefined }
        );
        savedId = r.createParcelInspection.inspection.id;
      }
      // Update detail immediately so panel reflects without a page refresh
      const updated = {
        id: savedId, parcelCondition: inspForm.parcelCondition,
        quantityCheckPassed: inspForm.quantityCheckPassed,
        discrepancyNotes: inspForm.discrepancyNotes, photos: inspForm.proofImage,
        notes: inspForm.notes, inspectionDate: inspForm.inspectionDate,
        createdAt: inspection?.createdAt ?? new Date().toISOString(),
        inspectedBy: inspection?.inspectedBy,
      };
      setDetail(d => d ? { ...d, parcelInspection: updated } : null);
      setInspection(updated);
      setShowInspection(false);
    } catch (e: unknown) { setInspErr(e instanceof Error ? e.message : "Failed"); }
    finally { setInspSaving(false); }
  }

  function printPO(po: PurchaseOrder) {
    const rows = po.items.map(item => {
      const name = item.itemKind === "RAW_CLOTH"
        ? `${item.clothCategory?.name ?? ""} — ${item.clothColor?.name ?? "Any color"}`
        : (item.itemType?.name || item.itemName || "—");
      const qty = item.itemKind === "RAW_CLOTH"
        ? `${item.orderedMeters}m`
        : `${item.orderedQuantity} pcs${item.size ? ` · ${item.size}` : ""}`;
      return `<tr><td>${name}</td><td>${item.itemKind === "RAW_CLOTH" ? "Raw Cloth" : "Readymade"}</td><td>${qty}</td><td class="amount">${fmtMoney(item.unitPrice)}</td><td class="amount">${fmtMoney(item.totalPrice)}</td></tr>`;
    }).join("");

    printDoc(`
      <div class="header">
        <div class="header-left">
          <h1>${po.poNumber}</h1>
          <div style="font-size:13px;color:#555;margin-top:4px">Purchase Order</div>
          <div style="margin-top:6px"><span class="badge">${PO_STATUS_LABELS[po.status] || po.status}</span></div>
        </div>
        <div class="header-right">
          <div style="font-weight:700;font-size:15px">${fmtMoney(po.totalAmount)}</div>
          <div>Order Date: ${fmtDate(po.orderDate)}</div>
          ${po.expectedDelivery ? `<div>Expected: ${fmtDate(po.expectedDelivery)}</div>` : ""}
        </div>
      </div>
      <div class="meta">
        <div class="meta-item"><label>Supplier</label><span>${po.supplier.name}</span></div>
        <div class="meta-item"><label>Warehouse</label><span>${po.warehouse.name}</span></div>
        <div class="meta-item"><label>Order Type</label><span>${po.orderType}</span></div>
      </div>
      <h2>Items</h2>
      <table>
        <thead><tr><th>Item</th><th>Type</th><th>Qty / Meters</th><th class="amount">Unit Price</th><th class="amount">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">
        <div class="totals-row grand"><span>Grand Total</span><span>${fmtMoney(po.totalAmount)}</span></div>
      </div>
      ${po.notes ? `<div style="margin-top:20px;font-size:12px;color:#666"><strong>Notes:</strong> ${po.notes}</div>` : ""}
    `, po.poNumber);
  }

  function exportCsv() {
    downloadCsv(`purchase_orders_${new Date().toISOString().slice(0,10)}.csv`, filtered.map(o => ({
      "PO Number": o.poNumber, "Supplier": o.supplier.name, "Type": o.orderType,
      "Order Date": o.orderDate, "Expected Delivery": o.expectedDelivery || "",
      "Total (INR)": o.totalAmount, "Status": PO_STATUS_LABELS[o.status] || o.status,
    })));
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Purchase Orders"
        sub={`${orders.length} orders`}
        actions={<>
          <Button variant="secondary" onClick={exportCsv}>⬇ Export CSV</Button>
          {canEdit && <Button onClick={() => { setShowNew(true); resetForm(); }}>+ New Order</Button>}
        </>}
      />

      <FilterBar style={{ marginBottom: 16, flexDirection: "column", alignItems: "stretch" }}>
        <Input placeholder="Search PO number or supplier…" value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ minWidth: 160, width: "auto" }}>
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{PO_STATUS_LABELS[s]}</option>)}
          </Select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
            From
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: "auto" }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
            To
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: "auto" }} />
          </label>
          {(dateFrom || dateTo) && (
            <Button variant="secondary" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>✕ Clear</Button>
          )}
        </div>
      </FilterBar>

      {/* ── New PO modal ── */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "#0009", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "32px 0" }}>
          <div style={{ background: "var(--paper)", borderRadius: 16, width: "min(860px,96vw)", border: "1px solid var(--border)", marginBottom: 32 }}>
            <div style={{ padding: "22px 28px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>New Purchase Order</h3>
              <button onClick={() => { setShowNew(false); resetForm(); }} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--muted)" }}>×</button>
            </div>
            <div style={{ padding: 28 }}>
              <ErrorBanner msg={error} />

              {/* Header fields */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <Field label="Supplier" required hint={submitted && !supplierId ? "Required" : undefined}>
                  <Select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                    style={{ borderColor: submitted && !supplierId ? "#e53935" : undefined, boxShadow: submitted && !supplierId ? "0 0 0 2px #e5393520" : undefined }}>
                    <option value="">Select supplier…</option>
                    {suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
                <Field label="Destination Warehouse" required hint={submitted && !warehouseId ? "Required" : undefined}>
                  <Select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
                    style={{ borderColor: submitted && !warehouseId ? "#e53935" : undefined, boxShadow: submitted && !warehouseId ? "0 0 0 2px #e5393520" : undefined }}>
                    <option value="">Select warehouse…</option>
                    {warehouses.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </Select>
                </Field>
                <Field label="Expected Delivery">
                  <Input type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} />
                </Field>
                <div style={{ position: "relative", gridColumn: "1/-1" }}>
                  <Field label="Notes">
                    <Textarea value={poNotes} onChange={e => setPoNotes(e.target.value.slice(0, 200))} placeholder="Optional notes for this order"
                      style={{ minHeight: 60 }} maxLength={200} />
                  </Field>
                  <span style={{ position: "absolute", bottom: 8, right: 10, fontSize: 10, color: poNotes.length > 170 ? "#e07" : "var(--muted)", pointerEvents: "none" }}>{poNotes.length}/200</span>
                </div>
              </div>

              {/* Items */}
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Order Items</span>
                <button onClick={() => setItems(p => [...p, emptyItem()])}
                  style={{ padding: "5px 14px", borderRadius: 7, border: "1px dashed var(--primary)", background: "var(--primary)10", color: "var(--primary)", cursor: "pointer", fontSize: 13 }}>
                  + Add Item
                </button>
              </div>

              {items.map((item, idx) => (
                <div key={idx} style={{ background: "var(--bg)", borderRadius: 10, padding: 16, marginBottom: 12, border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(["RAW_CLOTH", "READYMADE"] as const).map(k => (
                        <button key={k} type="button" onClick={() => updateItem(idx, { kind: k })}
                          style={{ padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: item.kind === k ? 700 : 400,
                            background: item.kind === k ? "var(--primary)" : "var(--paper)", color: item.kind === k ? "#fff" : "var(--muted)" }}>
                          {k === "RAW_CLOTH" ? "Raw Cloth" : "Readymade"}
                        </button>
                      ))}
                    </div>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(idx)} style={{ background: "none", border: "none", color: "#f44336", cursor: "pointer", fontSize: 18 }}>×</button>
                    )}
                  </div>

                  {item.kind === "RAW_CLOTH" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr", gap: 12 }}>
                      <CreatableSelect
                        label="Fabric / Category" options={categories} value={item.categoryId}
                        onChange={v => updateItem(idx, { categoryId: v })}
                        onCreate={createCategory} placeholder="e.g. Cotton, Polyester…" required
                        style={submitted && !item.categoryId ? { outline: "2px solid #e53935", borderRadius: 8 } : {}}
                      />
                      <CreatableSelect
                        label="Color" options={colors} value={item.colorId}
                        onChange={v => updateItem(idx, { colorId: v })}
                        onCreate={createColor} placeholder="Select color…"
                      />
                      <Field label="Meters" required hint={submitted && !item.meters ? "Required" : undefined}>
                        <Input type="number" min="0" value={item.meters || ""} onChange={e => updateItem(idx, { meters: +e.target.value })}
                          style={{ borderColor: submitted && !item.meters ? "#e53935" : undefined }} placeholder="0" />
                      </Field>
                      <Field label="Price / meter ₹">
                        <Input type="number" min="0" value={item.unitPrice || ""} onChange={e => updateItem(idx, { unitPrice: +e.target.value })} placeholder="0" />
                      </Field>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1fr", gap: 12 }}>
                      <CreatableSelect
                        label="Item Type" options={itemTypes} value={item.itemTypeId}
                        onChange={v => updateItem(idx, { itemTypeId: v })}
                        onCreate={createItemType} placeholder="e.g. Shirt, Pant, Kurti…" required
                        style={submitted && !item.itemTypeId ? { outline: "2px solid #e53935", borderRadius: 8 } : {}}
                      />
                      <CreatableSelect
                        label="Color" options={colors} value={item.colorId}
                        onChange={v => updateItem(idx, { colorId: v })}
                        onCreate={createColor} placeholder="Select color…"
                      />
                      <Field label="Age Group">
                        <AgeGroupSelect value={item.ageGroup} onChange={v => updateItem(idx, { ageGroup: v, size: "" })} />
                      </Field>
                      <SizeSelect value={item.size} onChange={v => updateItem(idx, { size: v })} label="Size" ageGroup={item.ageGroup || undefined} />
                      <Field label="Qty (pcs)" required hint={submitted && !item.qty ? "Required" : undefined}>
                        <Input type="number" min="1" value={item.qty || ""} onChange={e => updateItem(idx, { qty: +e.target.value })}
                          style={{ borderColor: submitted && !item.qty ? "#e53935" : undefined }} placeholder="0" />
                      </Field>
                      <Field label="Price / pc ₹">
                        <Input type="number" min="0" value={item.unitPrice || ""} onChange={e => updateItem(idx, { unitPrice: +e.target.value })} placeholder="0" />
                      </Field>
                      <Field label="Description" style={{ gridColumn: "1 / -1" }}>
                        <Input value={item.itemName} onChange={e => updateItem(idx, { itemName: e.target.value })} placeholder="Brand, variant, or any detail…" />
                      </Field>
                    </div>
                  )}
                </div>
              ))}

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <Button onClick={createPO} disabled={loading} style={{ flex: 1, fontSize: 15 }}>
                  {loading ? "Creating…" : "Create Purchase Order"}
                </Button>
                <Button variant="secondary" onClick={() => { setShowNew(false); resetForm(); }}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail panel ── */}
      {detail && (
        <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }}>
          <div style={{ background: "var(--paper)", width: "min(560px, 100vw)", height: "100vh", overflowY: "auto", padding: 28, border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{detail.poNumber}</div>
                <div style={{ color: "var(--muted)", fontSize: 14 }}>{detail.supplier.name}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Button variant="secondary" size="sm" onClick={() => printPO(detail)}>🖨 Print</Button>
                <button onClick={() => { setDetail(null); setError(""); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--muted)" }}>×</button>
              </div>
            </div>
            <ErrorBanner msg={error} />
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <Badge s={detail.status} />
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Ordered: {formatDateShort(detail.orderDate)}</span>
              {detail.expectedDelivery && <span style={{ fontSize: 13, color: "var(--muted)" }}>Expected: {formatDateShort(detail.expectedDelivery)}</span>}
            </div>
            <div style={{ background: "var(--bg)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 14, display: "flex", flexDirection: "column", gap: 4 }}>
              <div><strong>Warehouse:</strong> {detail.warehouse.name} &nbsp;·&nbsp; <strong>Total:</strong> {formatMoney(detail.totalAmount)}</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                <strong style={{ color: "var(--ink)" }}>Ordered by:</strong> {detail.createdBy?.username ?? "—"}
                {detail.receivedBy && (
                  <span style={{ marginLeft: 16 }}>
                    <strong style={{ color: "var(--ink)" }}>Received by:</strong>{" "}
                    <span style={{ color: "#2e7d32", fontWeight: 600 }}>{detail.receivedBy.username}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Progress steps */}
            <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 20 }}>
              {["DRAFT", "PLACED", "DISPATCHED", "RECEIVED", "VERIFIED"].map((s, i, arr) => {
                const statusOrder = ["DRAFT", "PLACED", "DISPATCHED", "RECEIVED", "VERIFIED"];
                const currentIdx = statusOrder.indexOf(detail.status);
                const stepIdx = statusOrder.indexOf(s);
                const done = stepIdx <= currentIdx;
                return (
                  <div key={s} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                    <div style={{ textAlign: "center", flex: "none" }}>
                      <div style={{ width: 28, height: 28, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                        background: done ? "var(--primary)" : "var(--bg)", color: done ? "#fff" : "var(--muted)", border: "2px solid", borderColor: done ? "var(--primary)" : "var(--border)" }}>
                        {stepIdx < currentIdx ? "✓" : i + 1}
                      </div>
                      <div style={{ fontSize: 10, marginTop: 4, color: done ? "var(--primary)" : "var(--muted)", fontWeight: done ? 700 : 400 }}>{PO_STATUS_LABELS[s]}</div>
                    </div>
                    {i < arr.length - 1 && <div style={{ flex: 1, height: 2, background: stepIdx < currentIdx ? "var(--primary)" : "var(--border)", margin: "0 4px", marginBottom: 16 }} />}
                  </div>
                );
              })}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Items</div>
              {detail.items.map((item, i) => (
                <div key={i} style={{ background: "var(--bg)", borderRadius: 8, padding: "10px 14px", marginBottom: 8, fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{item.itemKind === "RAW_CLOTH" ? `${item.clothCategory?.name} — ${item.clothColor?.name || "any color"}` : (item.itemType?.name || item.itemName)}</div>
                  {item.itemKind === "RAW_CLOTH"
                    ? <div style={{ color: "var(--muted)", marginTop: 2 }}>{item.orderedMeters}m ordered · {item.receivedMeters ?? 0}m received · ₹{item.unitPrice}/m</div>
                    : <div style={{ color: "var(--muted)", marginTop: 2 }}>{item.orderedQuantity} pcs ordered · {item.receivedQuantity ?? 0} received · ₹{item.unitPrice}/pc {item.size && `· ${item.size}`}</div>}
                  <div style={{ color: "var(--accent)", fontWeight: 600, marginTop: 4 }}>{formatMoney(item.totalPrice)}</div>
                </div>
              ))}
            </div>

            {canEdit && PO_NEXT[detail.status] && (
              <Button onClick={() => updateStatus(detail.id, PO_NEXT[detail.status])} disabled={loading} style={{ width: "100%", marginBottom: 8 }}>
                {loading ? "Updating…" : `Mark as ${PO_STATUS_LABELS[PO_NEXT[detail.status]]}`}
              </Button>
            )}
            {canEdit && !["CANCELLED", "VERIFIED"].includes(detail.status) && (
              <Button variant="danger" onClick={() => updateStatus(detail.id, "CANCELLED")} disabled={loading} style={{ width: "100%" }}>
                Cancel Order
              </Button>
            )}

            {/* Parcel Inspection */}
            <div style={{ marginTop: 20, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Parcel Inspection</div>
                {canEdit && (
                  <Button variant="secondary" size="sm" onClick={() => openInspection(detail)}>
                    {detail.parcelInspection ? "Update Inspection" : "Record Inspection"}
                  </Button>
                )}
              </div>
              {detail.parcelInspection ? (
                <div style={{ background: "var(--canvas)", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: CONDITION_COLOR[detail.parcelInspection.parcelCondition] || "#888" }}>
                      {CONDITION_LABEL[detail.parcelInspection.parcelCondition] || detail.parcelInspection.parcelCondition}
                    </span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 100, background: detail.parcelInspection.quantityCheckPassed ? "#d1fae5" : "#fef2f2", color: detail.parcelInspection.quantityCheckPassed ? "#065f46" : "#b91c1c" }}>
                      Qty {detail.parcelInspection.quantityCheckPassed ? "OK" : "Mismatch"}
                    </span>
                  </div>
                  {detail.parcelInspection.discrepancyNotes && <div style={{ color: "var(--muted)", fontSize: 12 }}>{detail.parcelInspection.discrepancyNotes}</div>}
                  {detail.parcelInspection.photos && (
                    <img src={detail.parcelInspection.photos} alt="Proof" style={{ marginTop: 8, maxWidth: "100%", maxHeight: 140, borderRadius: 6, border: "1px solid var(--line)", display: "block" }} />
                  )}
                  <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>Inspected: {detail.parcelInspection.inspectionDate} · by {detail.parcelInspection.inspectedBy?.username ?? "unknown"}</div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic" }}>No inspection recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Parcel Inspection Modal */}
      {showInspection && detail && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowInspection(false); }}
          style={{ position: "fixed", inset: 0, background: "#0009", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}>
          <div style={{ background: "var(--paper)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 460, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{inspection ? "Update" : "Record"} Parcel Inspection</div>
              <button onClick={() => setShowInspection(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--muted)", lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>{detail.poNumber} — {detail.supplier.name}</div>
            <ErrorBanner msg={inspErr} />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Inspection Date">
                <Input type="date" value={inspForm.inspectionDate} onChange={e => setInspForm(f => ({ ...f, inspectionDate: e.target.value }))} />
              </Field>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 8 }}>Parcel Condition</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["GOOD", "PARTIAL_DAMAGE", "DAMAGED"].map(c => (
                    <Button key={c} variant="secondary" size="sm" onClick={() => setInspForm(f => ({ ...f, parcelCondition: c }))}
                      style={{ flex: 1, justifyContent: "center", border: `2px solid ${inspForm.parcelCondition === c ? CONDITION_COLOR[c] : "var(--line)"}`, background: inspForm.parcelCondition === c ? CONDITION_COLOR[c] + "22" : "transparent", color: inspForm.parcelCondition === c ? CONDITION_COLOR[c] : "var(--muted)" }}>
                      {CONDITION_LABEL[c]}
                    </Button>
                  ))}
                </div>
              </div>
              <Checkbox label="Quantity check passed (received matches ordered)" checked={inspForm.quantityCheckPassed} onChange={e => setInspForm(f => ({ ...f, quantityCheckPassed: e.target.checked }))} />
              <Field label="Discrepancy Notes">
                <Textarea value={inspForm.discrepancyNotes} onChange={e => setInspForm(f => ({ ...f, discrepancyNotes: e.target.value }))} rows={2} placeholder="Describe any discrepancies…" style={{ minHeight: "unset" }} />
              </Field>
              <Field label="Additional Notes">
                <Textarea value={inspForm.notes} onChange={e => setInspForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional notes…" style={{ minHeight: "unset" }} />
              </Field>
              <Field label="Proof Photo">
                <FileInput accept="image/*" onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => setInspForm(f => ({ ...f, proofImage: ev.target?.result as string ?? "" }));
                  reader.readAsDataURL(file);
                }} />
                {inspForm.proofImage && (
                  <div style={{ marginTop: 8, position: "relative", display: "inline-block" }}>
                    <img src={inspForm.proofImage} alt="Proof" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 6, border: "1px solid var(--line)" }} />
                    <Button variant="danger" size="sm" onClick={() => setInspForm(f => ({ ...f, proofImage: "" }))}
                      style={{ position: "absolute", top: 4, right: 4, borderRadius: "50%", width: 20, height: 20, padding: 0, fontSize: 12, lineHeight: 1, justifyContent: "center" }}>×</Button>
                  </div>
                )}
              </Field>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowInspection(false)}>Cancel</Button>
              <Button onClick={saveInspection} disabled={inspSaving}>
                {inspSaving ? "Saving…" : inspection ? "Update" : "Save Inspection"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--border)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
              {["PO Number", "Supplier", "Type", "Date", "Total", "Status", ""].map(h => (
                <th key={h} style={{ padding: "10px 16px", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600 }}>{o.poNumber}</td>
                <td style={{ padding: "12px 16px" }}>{o.supplier.name}</td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--muted)" }}>{o.orderType.replace("_", " ")}</td>
                <td style={{ padding: "12px 16px", fontSize: 13 }}>{formatDateShort(o.orderDate)}</td>
                <td style={{ padding: "12px 16px", fontWeight: 600 }}>{formatMoney(o.totalAmount)}</td>
                <td style={{ padding: "12px 16px" }}><Badge s={o.status} /></td>
                <td style={{ padding: "12px 16px" }}>
                  <Button variant="secondary" size="sm" onClick={() => { setDetail(o); setError(""); }}>View</Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No purchase orders. Click "New Order" to create one.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
