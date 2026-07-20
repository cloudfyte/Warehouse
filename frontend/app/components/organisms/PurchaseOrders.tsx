"use client";
import { useState } from "react";
import type { PurchaseOrder, Supplier, WarehouseLocation, ClothCategory, ClothColor, ItemType } from "@/app/types";
import { PO_STATUS_LABELS, STATUS_BADGE_COLORS } from "@/app/lib/constants";
import { friendlyError } from "@/app/lib/errors";
import { formatMoney, formatDateShort } from "@/app/lib/formatters";
import CreatableSelect from "@/app/components/atoms/CreatableSelect";
import SizeSelect from "@/app/components/atoms/SizeSelect";
import { printDoc, fmtMoney, fmtDate } from "@/app/lib/print";
import { downloadCsv } from "@/app/lib/csv";

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

interface POItem { kind: "RAW_CLOTH" | "READYMADE"; categoryId: string; colorId: string; meters: number; itemTypeId: string; itemName: string; size: string; qty: number; unitPrice: number }
const emptyItem = (): POItem => ({ kind: "RAW_CLOTH", categoryId: "", colorId: "", meters: 0, itemTypeId: "", itemName: "", size: "", qty: 0, unitPrice: 0 });

const STATUSES = ["DRAFT", "PLACED", "DISPATCHED", "RECEIVED", "VERIFIED", "CANCELLED"];
const PO_NEXT: Record<string, string> = { DRAFT: "PLACED", PLACED: "DISPATCHED", DISPATCHED: "RECEIVED", RECEIVED: "VERIFIED" };

const sel: React.CSSProperties = { padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)", fontSize: 14, width: "100%" };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)", fontSize: 14, width: "100%", boxSizing: "border-box" };
const lbl: React.CSSProperties = { fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 };

export default function PurchaseOrders({ orders, suppliers, warehouses, categories, colors, itemTypes, isAdmin, isSuperAdmin, isManager, onMutate }: Props) {
  const [detail, setDetail] = useState<PurchaseOrder | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // New PO form state
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [orderType, setOrderType] = useState("RAW_CLOTH");
  const defaultDelivery = () => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); };
  const [expectedDelivery, setExpectedDelivery] = useState(defaultDelivery);
  const [poNotes, setPoNotes] = useState("");
  const [items, setItems] = useState<POItem[]>([emptyItem()]);

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
    const r = await onMutate(`mutation C($n:String!){createClothColor(name:$n,hexCode:"#CCCCCC"){color{id name}}}`, { n: name });
    return r.createClothColor.color.id;
  }
  async function createItemType(name: string): Promise<string> {
    const r = await onMutate(`mutation C($n:String!){createItemType(name:$n,category:"OTHER",clothLengthPerPiece:1.0){itemType{id name}}}`, { n: name });
    return r.createItemType.itemType.id;
  }

  function resetForm() {
    setSupplierId(""); setWarehouseId(""); setOrderType("RAW_CLOTH");
    setExpectedDelivery(defaultDelivery()); setPoNotes(""); setItems([emptyItem()]);
    setError("");
  }

  function updateItem(idx: number, patch: Partial<POItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  async function createPO() {
    if (!supplierId || !warehouseId) { setError("Select supplier and warehouse"); return; }
    if (items.some(it => it.kind === "RAW_CLOTH" ? !it.categoryId : !it.itemTypeId)) { setError("Fill all item details"); return; }
    setLoading(true); setError("");
    try {
      const gqlItems = items.map(it => it.kind === "RAW_CLOTH"
        ? { itemKind: "RAW_CLOTH", clothCategoryId: it.categoryId, clothColorId: it.colorId || undefined, orderedMeters: Number(it.meters), unitPrice: Number(it.unitPrice) }
        : { itemKind: "READYMADE", itemTypeId: it.itemTypeId, itemName: it.itemName, size: it.size, orderedQuantity: Number(it.qty), unitPrice: Number(it.unitPrice) }
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

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Purchase Orders <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 16 }}>({orders.length})</span></h2>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => downloadCsv(`purchase_orders_${new Date().toISOString().slice(0,10)}.csv`, filtered.map(o => ({
            "PO Number": o.poNumber, "Supplier": o.supplier.name, "Type": o.orderType,
            "Order Date": o.orderDate, "Expected Delivery": o.expectedDelivery || "",
            "Total (₹)": o.totalAmount, "Status": PO_STATUS_LABELS[o.status] || o.status,
          })))}
            style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            ⬇ Export CSV
          </button>
          {canEdit && <button onClick={() => { setShowNew(true); resetForm(); }}
            style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 600, cursor: "pointer" }}>+ New Order</button>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input placeholder="Search PO number or supplier…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)", fontSize: 14 }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)", fontSize: 14 }}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{PO_STATUS_LABELS[s]}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date"
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: dateFrom ? "var(--fg)" : "var(--muted)", fontSize: 14 }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date"
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: dateTo ? "var(--fg)" : "var(--muted)", fontSize: 14 }} />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); }}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", fontSize: 13, cursor: "pointer" }}>
            Clear dates
          </button>
        )}
      </div>

      {/* ── New PO modal ── */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "#0009", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "32px 0" }}>
          <div style={{ background: "var(--paper)", borderRadius: 16, width: "min(680px,95vw)", border: "1px solid var(--border)", marginBottom: 32 }}>
            <div style={{ padding: "22px 28px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>New Purchase Order</h3>
              <button onClick={() => { setShowNew(false); resetForm(); }} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--muted)" }}>×</button>
            </div>
            <div style={{ padding: 28 }}>
              {error && <div style={{ background: "#f4433618", border: "1px solid #f4433644", color: "#d32f2f", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

              {/* Header fields */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <label style={lbl}>
                  Supplier *
                  <select value={supplierId} onChange={e => setSupplierId(e.target.value)} style={sel}>
                    <option value="">Select supplier…</option>
                    {suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label style={lbl}>
                  Destination Warehouse *
                  <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} style={sel}>
                    <option value="">Select warehouse…</option>
                    {warehouses.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </label>
                <label style={lbl}>
                  Order Type
                  <select value={orderType} onChange={e => setOrderType(e.target.value)} style={sel}>
                    <option value="RAW_CLOTH">Raw Cloth</option>
                    <option value="READYMADE">Readymade</option>
                    <option value="MIXED">Mixed</option>
                  </select>
                </label>
                <label style={lbl}>
                  Expected Delivery
                  <input type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} style={inp} />
                </label>
                <div style={{ position: "relative", gridColumn: "1/-1" }}>
                  <label style={lbl}>
                    Notes
                    <textarea value={poNotes} onChange={e => setPoNotes(e.target.value.slice(0, 200))} placeholder="Optional notes for this order"
                      style={{ ...inp, resize: "vertical", minHeight: 60 }} maxLength={200} />
                  </label>
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
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                      <CreatableSelect
                        label="Category *" options={categories} value={item.categoryId}
                        onChange={v => updateItem(idx, { categoryId: v })}
                        onCreate={createCategory} placeholder="Select…" required
                      />
                      <CreatableSelect
                        label="Color *" options={colors} value={item.colorId}
                        onChange={v => updateItem(idx, { colorId: v })}
                        onCreate={createColor} placeholder="Select color…" required
                      />
                      <label style={lbl}>
                        Meters *
                        <input type="number" value={item.meters || ""} onChange={e => updateItem(idx, { meters: +e.target.value })} style={inp} placeholder="0" />
                      </label>
                      <label style={lbl}>
                        Price / meter ₹
                        <input type="number" value={item.unitPrice || ""} onChange={e => updateItem(idx, { unitPrice: +e.target.value })} style={inp} placeholder="0" />
                      </label>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                      <CreatableSelect
                        label="Item Type *" options={itemTypes} value={item.itemTypeId}
                        onChange={v => updateItem(idx, { itemTypeId: v })}
                        onCreate={createItemType} placeholder="Select type…" required
                      />
                      <label style={lbl}>
                        Item Name
                        <input value={item.itemName} onChange={e => updateItem(idx, { itemName: e.target.value })} style={inp} placeholder="Optional" />
                      </label>
                      <SizeSelect value={item.size} onChange={v => updateItem(idx, { size: v })} />
                      <label style={lbl}>
                        Qty (pcs)
                        <input type="number" value={item.qty || ""} onChange={e => updateItem(idx, { qty: +e.target.value })} style={inp} placeholder="0" />
                      </label>
                      <label style={{ ...lbl, gridColumn: "4/5" }}>
                        Price / pc ₹
                        <input type="number" value={item.unitPrice || ""} onChange={e => updateItem(idx, { unitPrice: +e.target.value })} style={inp} placeholder="0" />
                      </label>
                    </div>
                  )}
                </div>
              ))}

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button onClick={createPO} disabled={loading}
                  style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                  {loading ? "Creating…" : "Create Purchase Order"}
                </button>
                <button onClick={() => { setShowNew(false); resetForm(); }}
                  style={{ padding: "12px 24px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)", cursor: "pointer" }}>Cancel</button>
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
                <button onClick={() => printPO(detail)} style={{ padding: "5px 14px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🖨 Print</button>
                <button onClick={() => { setDetail(null); setError(""); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--muted)" }}>×</button>
              </div>
            </div>
            {error && <div style={{ color: "#f44", marginBottom: 12, fontSize: 13 }}>{error}</div>}
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
              <button onClick={() => updateStatus(detail.id, PO_NEXT[detail.status])} disabled={loading}
                style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
                {loading ? "Updating…" : `Mark as ${PO_STATUS_LABELS[PO_NEXT[detail.status]]}`}
              </button>
            )}
            {canEdit && !["CANCELLED", "VERIFIED"].includes(detail.status) && (
              <button onClick={() => updateStatus(detail.id, "CANCELLED")} disabled={loading}
                style={{ width: "100%", padding: "9px", borderRadius: 8, border: "1px solid #f44336", background: "none", color: "#f44336", cursor: "pointer", fontSize: 13 }}>
                Cancel Order
              </button>
            )}
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
                  <button onClick={() => { setDetail(o); setError(""); }}
                    style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer", fontSize: 13 }}>View</button>
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
