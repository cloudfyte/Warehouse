"use client";
import { useState, useEffect } from "react";
import { Plus, Trash2, Download, Printer, Truck } from "lucide-react";
import type { SalesOrder, Buyer, WarehouseLocation, FinishedProduct, ConfirmState } from "@/app/types";
import ConfirmDialog from "@/app/components/molecules/ConfirmDialog";
import { SO_STATUS_LABELS, STATUS_BADGE_COLORS, PAYMENT_MODE_LABELS } from "@/app/lib/constants";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import { formatDateShort, formatMoney, productName } from "@/app/lib/formatters";
import { printDoc, fmtMoney, fmtDate } from "@/app/lib/print";
import { downloadCsv } from "@/app/lib/csv";
import Button from "@/app/components/atoms/Button";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Textarea from "@/app/components/atoms/Textarea";
import Field from "@/app/components/molecules/Field";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import PageHeader from "@/app/components/molecules/PageHeader";
import FilterBar from "@/app/components/molecules/FilterBar";
import Pagination from "@/app/components/atoms/Pagination";
import Drawer from "@/app/components/atoms/Drawer";
import Modal from "@/app/components/atoms/Modal";
import PhotoPicker from "@/app/components/molecules/PhotoPicker";

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
const PER_PAGE = 20;

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

  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, statusFilter, dateFrom, dateTo]);

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
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

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
      showToast("Sales order created.", "success");
    } catch (e: unknown) { setError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  const [dispatchFor, setDispatchFor] = useState<SalesOrder | null>(null);
  const [dispatchForm, setDispatchForm] = useState({
    transporterName: "", lrNumber: "", vehicleNumber: "", driverPhone: "",
    dispatchDate: "", freightCharges: "", dispatchNotes: "", dispatchPhotos: "",
  });
  const [dispatchSaving, setDispatchSaving] = useState(false);
  const [dispatchErr, setDispatchErr] = useState("");

  function openDispatch(so: SalesOrder) {
    setDispatchForm({
      transporterName: so.transporterName || "",
      lrNumber: so.lrNumber || "",
      vehicleNumber: so.vehicleNumber || "",
      driverPhone: so.driverPhone || "",
      dispatchDate: so.dispatchDate || new Date().toISOString().slice(0, 10),
      freightCharges: so.freightCharges ? String(so.freightCharges) : "",
      dispatchNotes: so.dispatchNotes || "",
      dispatchPhotos: "",
    });
    setDispatchErr(""); setDispatchFor(so);
  }

  async function saveDispatch() {
    if (!dispatchFor) return;
    const f = dispatchForm;
    if (!f.lrNumber.trim() && !f.transporterName.trim()) {
      setDispatchErr("Enter the transporter or the LR number — one of them has to identify the shipment.");
      return;
    }
    setDispatchSaving(true); setDispatchErr("");
    try {
      await onMutate(
        `mutation D($id:ID!,$tn:String,$lr:String,$vn:String,$dp:String,$dd:Date,$fc:Float,$dn:String,$ph:String){`
        + `dispatchSalesOrder(id:$id,transporterName:$tn,lrNumber:$lr,vehicleNumber:$vn,driverPhone:$dp,`
        + `dispatchDate:$dd,freightCharges:$fc,dispatchNotes:$dn,dispatchPhotos:$ph)`
        + `{salesOrder{id status lrNumber transporterName vehicleNumber dispatchDate dispatchPhotos}}}`,
        {
          id: dispatchFor.id,
          tn: f.transporterName || undefined, lr: f.lrNumber || undefined,
          vn: f.vehicleNumber || undefined, dp: f.driverPhone || undefined,
          dd: f.dispatchDate || undefined,
          fc: f.freightCharges === "" ? undefined : +f.freightCharges,
          dn: f.dispatchNotes || undefined, ph: f.dispatchPhotos || undefined,
        },
      );
      setDetail(d => d && d.id === dispatchFor.id ? {
        ...d, status: "DISPATCHED",
        transporterName: f.transporterName, lrNumber: f.lrNumber,
        vehicleNumber: f.vehicleNumber.toUpperCase(), dispatchDate: f.dispatchDate,
      } : d);
      setDispatchFor(null);
      showToast("Dispatch recorded. The buyer has been sent the shipment details.", "success");
    } catch (e: unknown) {
      const msg = friendlyError(e);
      setDispatchErr(msg); showToast(msg, "error");
    } finally { setDispatchSaving(false); }
  }

  async function updateStatus(id: string, status: string) {
    setLoading(true); setError("");
    try {
      await onMutate(`mutation U($id:ID!,$s:String!){updateSalesOrderStatus(id:$id,status:$s){salesOrder{id status}}}`, { id, s: status });
      setDetail(d => d ? { ...d, status } : null);
      showToast(`Order marked as ${SO_STATUS_LABELS[status] || status}.`, "success");
    } catch (e: unknown) { setError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  function printSO(so: SalesOrder) {
    const rows = so.items.map(item =>
      `<tr>
        <td>${productName(item.finishedProduct)}</td>
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
        ${so.discount > 0 ? `<div class="totals-row"><span>Discount</span><span>- ${fmtMoney(so.discount)}</span></div>` : ""}
        ${so.taxAmount > 0 ? `<div class="totals-row"><span>GST</span><span>+ ${fmtMoney(so.taxAmount)}</span></div>` : ""}
        <div class="totals-row grand"><span>Grand Total</span><span>${fmtMoney(so.totalAmount)}</span></div>
        ${so.amountDue > 0 ? `<div class="totals-row" style="color:#c00"><span>Balance Due</span><span>${fmtMoney(so.amountDue)}</span></div>` : ""}
      </div>
    `, so.orderNumber);
  }

  function exportCsv() {
    downloadCsv(`sales_orders_${new Date().toISOString().slice(0,10)}.csv`, filtered.map(o => ({
      "Order #": o.orderNumber, "Buyer": o.buyer.name, "Order Date": o.orderDate,
      "Total (INR)": o.totalAmount, "Paid (INR)": o.amountPaid, "Due (INR)": o.amountDue,
      "Payment": PAYMENT_MODE_LABELS[o.paymentMode] || o.paymentMode,
      "Status": SO_STATUS_LABELS[o.status] || o.status,
    })));
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Sales Orders"
        sub={`${orders.length} orders`}
        actions={<>
          <Button variant="secondary" onClick={exportCsv}><Download size={14} /> Export CSV</Button>
          {canEdit && (
            <Button onClick={() => { setShowNew(true); setError(""); }}>
              <Plus size={16} /> New Sales Order
            </Button>
          )}
        </>}
      />

      {/* ── Filters ── */}
      <FilterBar style={{ marginBottom: 16, flexDirection: "column", alignItems: "stretch" }}>
        <Input placeholder="Search order or buyer…" value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ minWidth: 160, width: "auto" }}>
            <option value="">All statuses</option>
            {Object.entries(SO_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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

      {/* ── Create Sales Order drawer ── */}
      {showNew && (
        <Drawer
          title="New Sales Order"
          width={600}
          onClose={() => { setShowNew(false); resetForm(); }}
          onSubmit={createSO}
          footer={
            <Button type="submit" disabled={loading} style={{ width: "100%", fontSize: 15 }}>
              {loading ? "Creating…" : "Create Sales Order"}
            </Button>
          }
        >

            <ErrorBanner msg={error} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <Field label="Warehouse (from)" required>
                <Select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                  <option value="">Select warehouse</option>
                  {activeWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </Field>
              <Field label="Buyer (to)" required>
                <Select value={buyerId} onChange={e => setBuyerId(e.target.value)}>
                  <option value="">Select buyer</option>
                  {buyers.filter(b => b.active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="Order Date">
                <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
              </Field>
              <Field label="Expected Delivery">
                <Input type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} />
              </Field>
              <Field label="Payment Mode" required>
                <Select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                  <option value="PAID">Fully Paid</option>
                  <option value="CREDIT">Credit</option>
                  <option value="PARTIAL">Partial Payment</option>
                </Select>
              </Field>
              {paymentMode === "PARTIAL" && (
                <Field label="Amount Paid Upfront (₹)" required>
                  <Input type="number" min="0" step="0.01" value={amountPaid}
                    onChange={e => setAmountPaid(e.target.value)} placeholder="0.00" />
                </Field>
              )}
            </div>

            {/* Items */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                Items
                <button type="button" onClick={() => setItems(p => [...p, emptyItem()])}
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "4px 10px", borderRadius: 7, border: "1px solid var(--line)", background: "transparent", cursor: "pointer", color: "var(--primary)" }}>
                  <Plus size={12} /> Add Item
                </button>
              </div>
              {items.map((it, i) => {
                const fp = finishedProducts.find(p => p.id === it.productId);
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px 32px", gap: 8, marginBottom: 8, alignItems: "end" }}>
                    <Field label={i === 0 ? "Product" : ""}>
                      <Select value={it.productId} onChange={e => setItem(i, { productId: e.target.value })}>
                        <option value="">Select product</option>
                        {activeProducts.map(p => (
                          <option key={p.id} value={p.id}>
                            {productName(p)}{p.size ? ` (${p.size})` : ""} — {p.sku} · {p.quantity} avail
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={i === 0 ? "Qty" : ""}>
                      <Input type="number" min="1" max={fp?.quantity || 9999} value={it.qty || ""}
                        onChange={e => setItem(i, { qty: parseInt(e.target.value) || 0 })} />
                      {fp && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>max {fp.quantity} avail</div>}
                    </Field>
                    <Field label={i === 0 ? "Unit Price (₹)" : ""}>
                      <Input type="number" min="0" step="0.01" value={it.unitPrice}
                        onChange={e => setItem(i, { unitPrice: parseFloat(e.target.value) || 0 })} />
                    </Field>
                    <div style={{ paddingBottom: 2 }}>
                      {i === 0 && <div style={{ fontSize: 12, marginBottom: 4, color: "transparent" }}>×</div>}
                      <button type="button" onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} disabled={items.length === 1}
                        style={{ padding: 6, borderRadius: 7, border: "1px solid #ffc5c2", background: "#fff1f0", color: "#c0392b", cursor: "pointer", display: "flex", alignItems: "center" }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              <Field label="Discount (₹)">
                <Input type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} />
              </Field>
              <Field label="Notes" style={{ gridColumn: "1 / -1" }}>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ minHeight: "unset" }} />
              </Field>
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

        </Drawer>
      )}

      {/* ── Detail panel ── */}
      {detail && (
        <Drawer
          title={detail.orderNumber}
          subtitle={detail.buyer.name}
          width={560}
          zIndex={100}
          onClose={() => { setDetail(null); setError(""); }}
          headerActions={
            <Button variant="secondary" size="sm" onClick={() => printSO(detail)}><Printer size={14} /> Print</Button>
          }
        >
            <ErrorBanner msg={error} />
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <Badge s={detail.status} />
              <Badge s={detail.paymentMode} label={PAYMENT_MODE_LABELS[detail.paymentMode]} />
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Ordered: {formatDateShort(detail.orderDate)}</span>
            </div>
            <div style={{ background: "var(--canvas)", borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "var(--muted)" }}>Subtotal</span>
                <span style={{ fontWeight: 600 }}>{formatMoney(detail.subtotal)}</span>
              </div>
              {detail.discount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, color: "#16a34a" }}>
                  <span>Discount</span>
                  <span>− {formatMoney(detail.discount)}</span>
                </div>
              )}
              {detail.taxAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, color: "#6366f1" }}>
                  <span>GST</span>
                  <span>+ {formatMoney(detail.taxAmount)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 4, marginBottom: 10 }}>
                <span>Total</span>
                <span>{formatMoney(detail.totalAmount)}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><div style={{ fontSize: 11, color: "var(--muted)" }}>Paid</div><div style={{ fontWeight: 600, color: "#16a34a" }}>{formatMoney(detail.amountPaid)}</div></div>
                {detail.amountDue > 0 && <div><div style={{ fontSize: 11, color: "var(--muted)" }}>Due</div><div style={{ fontWeight: 700, color: "#f44336" }}>{formatMoney(detail.amountDue)}</div></div>}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Items</div>
              {detail.items.map((item, i) => (
                <div key={i} style={{ background: "var(--canvas)", borderRadius: 8, padding: "10px 14px", marginBottom: 8, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{productName(item.finishedProduct)}</div>
                    <div style={{ color: "var(--muted)" }}>{item.finishedProduct.sku} · {item.quantity} pcs × {formatMoney(item.unitPrice)}</div>
                  </div>
                  <div style={{ fontWeight: 700 }}>{formatMoney(item.totalPrice)}</div>
                </div>
              ))}
            </div>

            {(detail.lrNumber || detail.transporterName) && (
              <div style={{ background: "var(--canvas)", borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 13 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <Truck size={14} /> Shipment
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {([
                    ["Transporter", detail.transporterName],
                    ["LR Number", detail.lrNumber],
                    ["Vehicle", detail.vehicleNumber],
                    ["Driver", detail.driverPhone],
                    ["Dispatched", detail.dispatchDate ? formatDateShort(detail.dispatchDate) : ""],
                    ["Freight", detail.freightCharges ? formatMoney(detail.freightCharges) : ""],
                  ] as const).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{k}</div>
                      <div style={{ fontWeight: 600 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {detail.dispatchNotes && (
                  <div style={{ marginTop: 8, color: "var(--muted)" }}>{detail.dispatchNotes}</div>
                )}
                {detail.dispatchPhotos && (
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {detail.dispatchPhotos.split(",").filter(Boolean).map((src, j) => (
                      <a key={j} href={src} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`Shipment photo ${j + 1}`}
                          style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)", display: "block" }} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {canEdit && SO_NEXT[detail.status] && (
              <Button
                onClick={() => SO_NEXT[detail.status] === "DISPATCHED"
                  ? openDispatch(detail)
                  : updateStatus(detail.id, SO_NEXT[detail.status])}
                disabled={loading}
                style={{ width: "100%", marginBottom: 8 }}
              >
                {loading ? "Updating…"
                  : SO_NEXT[detail.status] === "DISPATCHED"
                    ? <><Truck size={14} /> Dispatch & Record LR</>
                    : `Mark as ${SO_STATUS_LABELS[SO_NEXT[detail.status]]}`}
              </Button>
            )}
            {canEdit && !["DELIVERED", "CANCELLED"].includes(detail.status) && (
              <Button variant="danger" onClick={() => setConfirmCancel(detail.id)} disabled={loading} style={{ width: "100%" }}>
                Cancel Order
              </Button>
            )}
        </Drawer>
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
            {paged.map(o => (
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
                  <Button variant="secondary" size="sm" onClick={() => { setDetail(o); setError(""); }}>View</Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No sales orders</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />

      {/* Dispatch — shipment details recorded as the goods leave */}
      {dispatchFor && (
        <Modal
          title="Dispatch Order"
          subtitle={`${dispatchFor.orderNumber} · ${dispatchFor.buyer.name}`}
          width={520}
          zIndex={300}
          onClose={() => setDispatchFor(null)}
          onSubmit={saveDispatch}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="primary" type="submit" disabled={dispatchSaving} style={{ flex: 1 }}>
                {dispatchSaving ? "Recording…" : "Dispatch & Notify Buyer"}
              </Button>
              <Button variant="secondary" onClick={() => setDispatchFor(null)}>Cancel</Button>
            </div>
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Transporter" hint="Courier or lorry service carrying the goods.">
              <Input value={dispatchForm.transporterName} placeholder="e.g. VRL Logistics"
                onChange={e => setDispatchForm(f => ({ ...f, transporterName: e.target.value }))} />
            </Field>
            <Field label="LR / Consignment No." hint="What you quote if the parcel goes missing.">
              <Input value={dispatchForm.lrNumber} placeholder="e.g. VRL-99812"
                onChange={e => setDispatchForm(f => ({ ...f, lrNumber: e.target.value }))} />
            </Field>
            <Field label="Vehicle Number">
              <Input value={dispatchForm.vehicleNumber} placeholder="e.g. TS07 AB 1234"
                onChange={e => setDispatchForm(f => ({ ...f, vehicleNumber: e.target.value }))} />
            </Field>
            <Field label="Driver Phone">
              <Input value={dispatchForm.driverPhone} placeholder="10-digit number"
                onChange={e => setDispatchForm(f => ({ ...f, driverPhone: e.target.value }))} />
            </Field>
            <Field label="Dispatch Date">
              <Input type="date" value={dispatchForm.dispatchDate}
                onChange={e => setDispatchForm(f => ({ ...f, dispatchDate: e.target.value }))} />
            </Field>
            <Field label="Freight Charges">
              <Input type="number" min="0" step="0.01" value={dispatchForm.freightCharges} placeholder="0.00"
                onChange={e => setDispatchForm(f => ({ ...f, freightCharges: e.target.value }))} />
            </Field>
          </div>

          <Field label="Notes">
            <Textarea rows={2} value={dispatchForm.dispatchNotes} placeholder="Number of parcels, markings, anything the buyer should know…"
              onChange={e => setDispatchForm(f => ({ ...f, dispatchNotes: e.target.value }))}
              style={{ minHeight: "unset" }} />
          </Field>

          <Field label="Shipment Photos" hint="The loaded parcel and the LR copy. This is what settles a dispute later.">
            <PhotoPicker
              value={dispatchForm.dispatchPhotos}
              onChange={v => setDispatchForm(f => ({ ...f, dispatchPhotos: v }))}
              max={5}
            />
          </Field>

          {dispatchErr && <ErrorBanner msg={dispatchErr} />}
        </Modal>
      )}

      {confirmCancel !== null && (
        <ConfirmDialog
          state={{
            open: true,
            title: "Cancel Order",
            message: "This will permanently cancel the order. This action cannot be undone.",
            confirmLabel: "Cancel Order",
            onConfirm: () => updateStatus(confirmCancel, "CANCELLED"),
          } satisfies ConfirmState}
          onCancel={() => setConfirmCancel(null)}
        />
      )}
    </div>
  );
}
