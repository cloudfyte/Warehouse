"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { SalesOrder, Buyer, WarehouseLocation, FinishedProduct } from "@/app/types";
import { SO_STATUS_LABELS, STATUS_BADGE_COLORS, PAYMENT_MODE_LABELS } from "@/app/lib/constants";
import { friendlyError } from "@/app/lib/errors";
import { formatMoney, formatDateShort } from "@/app/lib/formatters";
import { printDoc, fmtMoney, fmtDate } from "@/app/lib/print";
import { downloadCsv } from "@/app/lib/csv";

interface Props {
  orders: SalesOrder[]
  buyers: Buyer[]
  warehouses: WarehouseLocation[]
  finishedProducts: FinishedProduct[]
  isAdmin: boolean; isSuperAdmin: boolean; isManager: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>
}

function Badge({ s, label }: { s: string; label?: string }) {
  return (
    <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, background: (STATUS_BADGE_COLORS[s] || "#888") + "22", color: STATUS_BADGE_COLORS[s] || "#888" }}>
      {label || SO_STATUS_LABELS[s] || s}
    </span>
  );
}

interface SOItem { productId: string; qty: number; unitPrice: number }
const emptyItem = (): SOItem => ({ productId: "", qty: 1, unitPrice: 0 });

const SO_NEXT: Record<string, string> = { REQUESTED: "PROCESSING", PROCESSING: "READY", READY: "DISPATCHED", DISPATCHED: "DELIVERED" };

const inp: React.CSSProperties = { padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--ink)", fontSize: 14, width: "100%", boxSizing: "border-box" };
const sel: React.CSSProperties = { ...inp };
const lbl: React.CSSProperties = { fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 };

export default function SalesOrders({ orders, buyers, warehouses, finishedProducts, isAdmin, isSuperAdmin, isManager, onMutate }: Props) {
  const [detail, setDetail] = useState<SalesOrder | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // New SO form
  const [buyerId, setBuyerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [paymentMode, setPaymentMode] = useState("PAID");
  const [amountPaid, setAmountPaid] = useState("");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDelivery, setExpectedDelivery] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10);
  });
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<SOItem[]>([emptyItem()]);

  const canEdit = isSuperAdmin || isAdmin || isManager;
  const activeWarehouses = warehouses.filter(w => w.active);
  const activeProducts = finishedProducts.filter(p => p.quantity > 0);

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    if (q && !o.orderNumber.toLowerCase().includes(q) && !o.buyer.name.toLowerCase().includes(q)) return false;
    if (statusFilter && o.status !== statusFilter) return false;
    if (dateFrom && o.orderDate < dateFrom) return false;
    if (dateTo && o.orderDate > dateTo) return false;
    return true;
  });

  // Live totals in create form
  const subtotal = items.reduce((s, it) => s + (it.qty * it.unitPrice), 0);
  const discountAmt = parseFloat(discount) || 0;
  const total = Math.max(0, subtotal - discountAmt);

  function resetForm() {
    setBuyerId(""); setWarehouseId(""); setPaymentMode("PAID"); setAmountPaid("");
    setOrderDate(new Date().toISOString().slice(0, 10));
    const d = new Date(); d.setDate(d.getDate() + 7);
    setExpectedDelivery(d.toISOString().slice(0, 10));
    setDiscount("0"); setNotes(""); setItems([emptyItem()]);
    setError("");
  }

  function setItem(i: number, patch: Partial<SOItem>) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
    // auto-fill sale price when product is selected
    if (patch.productId) {
      const fp = finishedProducts.find(p => p.id === patch.productId);
      if (fp) setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch, unitPrice: fp.salePrice } : it));
    }
  }

  async function createSO() {
    if (!buyerId || !warehouseId || items.some(it => !it.productId || it.qty < 1)) {
      setError("Fill buyer, warehouse and all item fields."); return;
    }
    if (paymentMode === "PARTIAL" && (!amountPaid || parseFloat(amountPaid) <= 0)) {
      setError("Enter the amount paid upfront for partial payment."); return;
    }
    setLoading(true); setError("");
    try {
      await onMutate(
        `mutation C($buyerId:ID!,$payMode:String!,$whId:ID!,$items:[SOItemInput!]!,$date:Date,$del:Date,$disc:Float,$notes:String,$paid:Float){
          createSalesOrder(buyerId:$buyerId,paymentMode:$payMode,warehouseId:$whId,items:$items,orderDate:$date,expectedDelivery:$del,discount:$disc,notes:$notes,amountPaid:$paid){
            salesOrder{id orderNumber}}}`,
        {
          buyerId,
          payMode: paymentMode,
          whId: warehouseId,
          items: items.map(it => ({ finishedProductId: it.productId, quantity: Number(it.qty), unitPrice: Number(it.unitPrice) })),
          date: orderDate || undefined,
          del: expectedDelivery || undefined,
          disc: discountAmt || undefined,
          notes: notes || undefined,
          paid: paymentMode === "PARTIAL" ? parseFloat(amountPaid) : undefined,
        }
      );
      resetForm(); setShowNew(false);
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setLoading(false); }
  }

  async function updateStatus(id: string, status: string) {
    setLoading(true); setError("");
    try {
      await onMutate(`mutation U($id:ID!,$s:String!){updateSalesOrderStatus(id:$id,status:$s){salesOrder{id status}}}`, { id, s: status });
      setDetail(d => d ? { ...d, status } : null);
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setLoading(false); }
  }

  function printSO(so: SalesOrder) {
    const rows = so.items.map(item =>
      `<tr>
        <td>${item.finishedProduct.itemType.name}</td>
        <td style="color:#666;font-size:12px">${item.finishedProduct.sku}</td>
        <td>${item.quantity}</td>
        <td class="amount">${fmtMoney(item.unitPrice)}</td>
        <td class="amount">${fmtMoney(item.totalPrice)}</td>
      </tr>`
    ).join("");
    printDoc(`
      <div class="header">
        <div class="header-left">
          <h1>${so.orderNumber}</h1>
          <div style="font-size:13px;color:#555;margin-top:4px">Sales Order / Invoice</div>
          <div style="margin-top:6px"><span class="badge">${SO_STATUS_LABELS[so.status] || so.status}</span></div>
        </div>
        <div class="header-right">
          <div style="font-weight:700;font-size:15px">${fmtMoney(so.totalAmount)}</div>
          <div>Order Date: ${fmtDate(so.orderDate)}</div>
          <div>Payment: ${PAYMENT_MODE_LABELS[so.paymentMode] || so.paymentMode}</div>
        </div>
      </div>
      <div class="meta">
        <div class="meta-item"><label>Buyer</label><span>${so.buyer.name}</span></div>
        <div class="meta-item"><label>Amount Paid</label><span>${fmtMoney(so.amountPaid)}</span></div>
        <div class="meta-item"><label>Amount Due</label><span style="color:${so.amountDue > 0 ? "#c00" : "#080"}">${fmtMoney(so.amountDue)}</span></div>
      </div>
      <h2>Items</h2>
      <table>
        <thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th class="amount">Unit Price</th><th class="amount">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">
        <div class="totals-row"><span>Subtotal</span><span>${fmtMoney(so.subtotal)}</span></div>
        <div class="totals-row"><span>Discount</span><span>- ${fmtMoney(so.discount)}</span></div>
        <div class="totals-row grand"><span>Grand Total</span><span>${fmtMoney(so.totalAmount)}</span></div>
        ${so.amountDue > 0 ? `<div class="totals-row" style="color:#c00"><span>Balance Due</span><span>${fmtMoney(so.amountDue)}</span></div>` : ""}
      </div>
    `, so.orderNumber);
  }

  return (
    <div style={{ padding: 24 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Sales Orders <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 16 }}>({orders.length})</span></h2>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => downloadCsv(`sales_orders_${new Date().toISOString().slice(0,10)}.csv`, filtered.map(o => ({
            "Order #": o.orderNumber, "Buyer": o.buyer.name, "Order Date": o.orderDate,
            "Total (₹)": o.totalAmount, "Paid (₹)": o.amountPaid, "Due (₹)": o.amountDue,
            "Payment": PAYMENT_MODE_LABELS[o.paymentMode] || o.paymentMode,
            "Status": SO_STATUS_LABELS[o.status] || o.status,
          })))}
            style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            ⬇ Export CSV
          </button>
          {canEdit && (
            <button onClick={() => { setShowNew(true); setError(""); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              <Plus size={16} /> New Sales Order
            </button>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input placeholder="Search order or buyer…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--ink)", fontSize: 14 }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--ink)", fontSize: 14 }}>
          <option value="">All statuses</option>
          {Object.entries(SO_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date"
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--canvas)", color: dateFrom ? "var(--ink)" : "var(--muted)", fontSize: 14 }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date"
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--canvas)", color: dateTo ? "var(--ink)" : "var(--muted)", fontSize: 14 }} />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); }}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: "var(--muted)", fontSize: 13, cursor: "pointer" }}>
            Clear dates
          </button>
        )}
      </div>

      {/* ── Create Sales Order drawer ── */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }}>
          <div style={{ background: "var(--paper)", width: "min(600px, 100vw)", height: "100vh", overflowY: "auto", padding: 28, borderLeft: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>New Sales Order</h3>
              <button onClick={() => { setShowNew(false); resetForm(); }} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--muted)" }}>×</button>
            </div>

            {error && <div style={{ background: "#fff1f0", border: "1px solid #ffc5c2", color: "#8d3e39", borderRadius: 9, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <label style={lbl}>
                Buyer *
                <select value={buyerId} onChange={e => setBuyerId(e.target.value)} style={sel}>
                  <option value="">Select buyer</option>
                  {buyers.filter(b => b.active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label style={lbl}>
                Warehouse *
                <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} style={sel}>
                  <option value="">Select warehouse</option>
                  {activeWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              <label style={lbl}>
                Order Date
                <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} style={inp} />
              </label>
              <label style={lbl}>
                Expected Delivery
                <input type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} style={inp} />
              </label>
              <label style={lbl}>
                Payment Mode *
                <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} style={sel}>
                  <option value="PAID">Fully Paid</option>
                  <option value="CREDIT">Credit</option>
                  <option value="PARTIAL">Partial Payment</option>
                </select>
              </label>
              {paymentMode === "PARTIAL" && (
                <label style={lbl}>
                  Amount Paid Upfront (₹) *
                  <input type="number" min="0" step="0.01" value={amountPaid}
                    onChange={e => setAmountPaid(e.target.value)}
                    placeholder="0.00" style={inp} />
                </label>
              )}
            </div>

            {/* Items */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                Items
                <button onClick={() => setItems(p => [...p, emptyItem()])}
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "4px 10px", borderRadius: 7, border: "1px solid var(--line)", background: "transparent", cursor: "pointer", color: "var(--primary)" }}>
                  <Plus size={12} /> Add Item
                </button>
              </div>
              {items.map((it, i) => {
                const fp = finishedProducts.find(p => p.id === it.productId);
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px 32px", gap: 8, marginBottom: 8, alignItems: "end" }}>
                    <label style={lbl}>
                      {i === 0 && <span>Product</span>}
                      <select value={it.productId} onChange={e => setItem(i, { productId: e.target.value })} style={sel}>
                        <option value="">Select product</option>
                        {activeProducts.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.itemType.name}{p.size ? ` (${p.size})` : ""} — {p.sku} · {p.quantity} avail
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={lbl}>
                      {i === 0 && <span>Qty</span>}
                      <input type="number" min="1" max={fp?.quantity || 9999} value={it.qty}
                        onChange={e => setItem(i, { qty: parseInt(e.target.value) || 1 })} style={inp} />
                    </label>
                    <label style={lbl}>
                      {i === 0 && <span>Unit Price (₹)</span>}
                      <input type="number" min="0" step="0.01" value={it.unitPrice}
                        onChange={e => setItem(i, { unitPrice: parseFloat(e.target.value) || 0 })} style={inp} />
                    </label>
                    <div style={{ paddingBottom: 2 }}>
                      {i === 0 && <div style={{ fontSize: 12, marginBottom: 4, color: "transparent" }}>×</div>}
                      <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} disabled={items.length === 1}
                        style={{ padding: 6, borderRadius: 7, border: "1px solid #ffc5c2", background: "#fff1f0", color: "#c0392b", cursor: "pointer", display: "flex", alignItems: "center" }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              <label style={lbl}>
                Discount (₹)
                <input type="number" min="0" step="0.01" value={discount}
                  onChange={e => setDiscount(e.target.value)} style={inp} />
              </label>
              <label style={{ ...lbl, gridColumn: "1 / -1" }}>
                Notes
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
              </label>
            </div>

            {/* Totals summary */}
            <div style={{ background: "var(--canvas)", borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "var(--muted)" }}>Subtotal</span>
                <span>{formatMoney(subtotal)}</span>
              </div>
              {discountAmt > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#16a34a" }}>
                  <span>Discount</span><span>− {formatMoney(discountAmt)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15, borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 4 }}>
                <span>Total</span><span>{formatMoney(total)}</span>
              </div>
              {paymentMode === "PARTIAL" && parseFloat(amountPaid) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "#f59e0b", marginTop: 4 }}>
                  <span>Balance Due</span><span>{formatMoney(Math.max(0, total - parseFloat(amountPaid)))}</span>
                </div>
              )}
            </div>

            <button onClick={createSO} disabled={loading}
              style={{ width: "100%", padding: 12, borderRadius: 9, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              {loading ? "Creating…" : "Create Sales Order"}
            </button>
          </div>
        </div>
      )}

      {/* ── Detail panel ── */}
      {detail && (
        <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }}>
          <div style={{ background: "var(--paper)", width: "min(560px, 100vw)", height: "100vh", overflowY: "auto", padding: 28, borderLeft: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{detail.orderNumber}</div>
                <div style={{ color: "var(--muted)", fontSize: 14 }}>{detail.buyer.name}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => printSO(detail)}
                  style={{ padding: "5px 14px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  🖨 Print
                </button>
                <button onClick={() => { setDetail(null); setError(""); }}
                  style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--muted)" }}>×</button>
              </div>
            </div>
            {error && <div style={{ color: "#f44", marginBottom: 12, fontSize: 13 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <Badge s={detail.status} />
              <Badge s={detail.paymentMode} label={PAYMENT_MODE_LABELS[detail.paymentMode]} />
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Ordered: {formatDateShort(detail.orderDate)}</span>
            </div>
            <div style={{ background: "var(--canvas)", borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: "var(--muted)" }}>Subtotal</div><div style={{ fontWeight: 600 }}>{formatMoney(detail.subtotal)}</div></div>
                <div><div style={{ fontSize: 11, color: "var(--muted)" }}>Discount</div><div style={{ fontWeight: 600 }}>{formatMoney(detail.discount)}</div></div>
                <div><div style={{ fontSize: 11, color: "var(--muted)" }}>Total</div><div style={{ fontWeight: 700, fontSize: 16 }}>{formatMoney(detail.totalAmount)}</div></div>
                <div><div style={{ fontSize: 11, color: "var(--muted)" }}>Paid</div><div style={{ fontWeight: 600, color: "#16a34a" }}>{formatMoney(detail.amountPaid)}</div></div>
                {detail.amountDue > 0 && <div><div style={{ fontSize: 11, color: "var(--muted)" }}>Due</div><div style={{ fontWeight: 700, color: "#f44336" }}>{formatMoney(detail.amountDue)}</div></div>}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Items</div>
              {detail.items.map((item, i) => (
                <div key={i} style={{ background: "var(--canvas)", borderRadius: 8, padding: "10px 14px", marginBottom: 8, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.finishedProduct.itemType.name}</div>
                    <div style={{ color: "var(--muted)" }}>{item.finishedProduct.sku} · {item.quantity} pcs × {formatMoney(item.unitPrice)}</div>
                  </div>
                  <div style={{ fontWeight: 700 }}>{formatMoney(item.totalPrice)}</div>
                </div>
              ))}
            </div>
            {canEdit && SO_NEXT[detail.status] && (
              <button onClick={() => updateStatus(detail.id, SO_NEXT[detail.status])} disabled={loading}
                style={{ width: "100%", padding: 11, borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
                {loading ? "Updating…" : `Mark as ${SO_STATUS_LABELS[SO_NEXT[detail.status]]}`}
              </button>
            )}
            {canEdit && !["DELIVERED", "CANCELLED"].includes(detail.status) && (
              <button onClick={() => updateStatus(detail.id, "CANCELLED")} disabled={loading}
                style={{ width: "100%", padding: 9, borderRadius: 8, border: "1px solid #f44336", background: "none", color: "#f44336", cursor: "pointer", fontSize: 13 }}>
                Cancel Order
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--line)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--canvas)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
              {["Order", "Buyer", "Date", "Total", "Paid", "Due", "Payment", "Status", ""].map(h => (
                <th key={h} style={{ padding: "10px 14px", fontWeight: 600, borderBottom: "1px solid var(--line)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "12px 14px", fontWeight: 600 }}>{o.orderNumber}</td>
                <td style={{ padding: "12px 14px" }}>{o.buyer.name}</td>
                <td style={{ padding: "12px 14px", fontSize: 13 }}>{formatDateShort(o.orderDate)}</td>
                <td style={{ padding: "12px 14px", fontWeight: 600 }}>{formatMoney(o.totalAmount)}</td>
                <td style={{ padding: "12px 14px", fontSize: 13, color: "#16a34a" }}>{formatMoney(o.amountPaid)}</td>
                <td style={{ padding: "12px 14px", fontSize: 13, color: o.amountDue > 0 ? "#f44336" : "var(--muted)" }}>{formatMoney(o.amountDue)}</td>
                <td style={{ padding: "12px 14px" }}><Badge s={o.paymentMode} label={PAYMENT_MODE_LABELS[o.paymentMode]} /></td>
                <td style={{ padding: "12px 14px" }}><Badge s={o.status} /></td>
                <td style={{ padding: "12px 14px" }}>
                  <button onClick={() => { setDetail(o); setError(""); }}
                    style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--canvas)", cursor: "pointer", fontSize: 13 }}>
                    View
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No sales orders</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
