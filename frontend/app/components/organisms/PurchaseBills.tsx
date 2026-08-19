"use client";
import { useState, useRef } from "react";
import { formatMoney, formatDate } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import SizeSelect from "@/app/components/atoms/SizeSelect";
import AgeGroupSelect from "@/app/components/atoms/AgeGroupSelect";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Textarea from "@/app/components/atoms/Textarea";
import Button from "@/app/components/atoms/Button";
import Field from "@/app/components/molecules/Field";
import FormGrid from "@/app/components/molecules/FormGrid";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import PageHeader from "@/app/components/molecules/PageHeader";
import { downloadCsv } from "@/app/lib/csv";
import { showToast } from "@/app/lib/toast";
import { printDoc, fmtMoney, fmtDate } from "@/app/lib/print";

// ─── types ────────────────────────────────────────────────────────────────────

interface Supplier { id: string; name: string }
interface Warehouse { id: string; name: string }
interface ClothCategory { id: string; name: string }
interface ClothColor { id: string; name: string; hexCode?: string }
interface ItemType { id: string; name: string }

interface BillItem {
  id: string
  itemKind: "RAW_CLOTH" | "READYMADE"
  clothCategory?: { id: string; name: string }
  clothColor?: { id: string; name: string; hexCode?: string }
  totalMeters?: number
  costPerMeter?: number
  binLocation: string
  clothCode: string
  itemType?: { id: string; name: string }
  size: string
  quantity: number
  unitPrice?: number
  gstRate: number
  totalPrice: number
  notes: string
}

interface SupplierPayment {
  id: string
  paymentNumber: string
  amount: number
  paymentDate: string
  paymentMode: string
  reference: string
  notes: string
}

interface PurchaseBill {
  id: string
  billNumber: string
  supplier: { id: string; name: string }
  warehouse: { id: string; name: string }
  billDate: string
  invoiceRef: string
  billImage?: string
  taxableAmount: number
  taxAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalAmount: number
  amountPaid: number
  amountPending: number
  paymentStatus: "PENDING" | "PARTIAL" | "PAID"
  notes: string
  createdAt: string
  items: BillItem[]
  supplierPayments: SupplierPayment[]
}

interface DraftItem {
  itemKind: "RAW_CLOTH" | "READYMADE"
  clothCategoryId: string
  clothColorId: string
  totalMeters: string
  costPerMeter: string
  binLocation: string
  clothCode: string
  itemTypeId: string
  ageGroup: string
  size: string
  quantity: string
  unitPrice: string
  gstRate: string
  notes: string
}

interface Props {
  bills: PurchaseBill[]
  suppliers: Supplier[]
  warehouses: Warehouse[]
  clothCategories: ClothCategory[]
  clothColors: ClothColor[]
  itemTypes: ItemType[]
  isAdmin: boolean; isSuperAdmin: boolean; isManager: boolean; isStoreKeeper: boolean
  systemSettings?: { gstOnPurchases?: boolean; currencySymbol?: string; gstin?: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function genClothCode(priceStr: string): string {
  const price = Math.round(parseFloat(priceStr) || 0);
  if (!price) return "";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const r = () => chars[Math.floor(Math.random() * chars.length)];
  // Format: [2 random][price][2 random] — e.g. K7200AB for ₹200
  return `${r()}${r()}${price}${r()}${r()}`;
}

function blankItem(): DraftItem {
  return {
    itemKind: "RAW_CLOTH", clothCategoryId: "", clothColorId: "",
    totalMeters: "", costPerMeter: "", binLocation: "", clothCode: "",
    itemTypeId: "", ageGroup: "", size: "", quantity: "", unitPrice: "", gstRate: "", notes: "",
  };
}

function itemLineTotal(item: DraftItem): number {
  if (item.itemKind === "RAW_CLOTH") {
    return (parseFloat(item.totalMeters) || 0) * (parseFloat(item.costPerMeter) || 0);
  }
  return (parseInt(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
}

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  PENDING: { bg: "#fff3e0", color: "#e65100", label: "Pending" },
  PARTIAL: { bg: "#e3f2fd", color: "#1565c0", label: "Partial" },
  PAID:    { bg: "#e8f5e9", color: "#2e7d32", label: "Paid" },
};


// ─── main component ────────────────────────────────────────────────────────────

export default function PurchaseBills({
  bills, suppliers, warehouses, clothCategories, clothColors, itemTypes,
  isAdmin, isSuperAdmin, isManager, isStoreKeeper, systemSettings, onMutate,
}: Props) {
  const canCreate = isSuperAdmin || isAdmin || isManager || isStoreKeeper;
  const gstEnabled = !!systemSettings?.gstOnPurchases;
  const currency = systemSettings?.currencySymbol || "₹";

  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Supplier payment state
  const [payBillId, setPayBillId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("CASH");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payLoading, setPayLoading] = useState(false);
  const [payErr, setPayErr] = useState("");

  // Form state
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceRef, setInvoiceRef] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [billImages, setBillImages] = useState<{ b64: string; name: string }[]>([]);
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
  const fileRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setSupplierId(""); setWarehouseId(warehouses[0]?.id ?? "");
    setBillDate(new Date().toISOString().slice(0, 10));
    setInvoiceRef(""); setAmountPaid(""); setNotes("");
    setBillImages([]);
    setItems([blankItem()]); setErr("");
  }

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) { setErr(`${file.name} must be under 5 MB.`); return; }
    }
    setErr("");
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setBillImages(prev => [...prev, { b64: reader.result as string, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  function updateItem(idx: number, patch: Partial<DraftItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  const computedTotal = items.reduce((s, it) => s + itemLineTotal(it), 0);
  const computedGst = gstEnabled
    ? items.reduce((s, it) => {
        const rate = parseFloat(it.gstRate) || 0;
        return s + (rate > 0 ? Math.round(itemLineTotal(it) * rate) / 100 : 0);
      }, 0)
    : 0;
  const grandTotal = computedTotal + computedGst;

  async function handleSubmit() {
    setErr("");
    if (!supplierId) return setErr("Please select a supplier.");
    if (!warehouseId) return setErr("Please select a warehouse.");
    if (items.length === 0) return setErr("Add at least one item.");

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.itemKind === "RAW_CLOTH") {
        if (!it.clothCategoryId) return setErr(`Item ${i + 1}: cloth category is required.`);
        if (!it.clothColorId) return setErr(`Item ${i + 1}: cloth color is required.`);
        if (!it.totalMeters || parseFloat(it.totalMeters) <= 0) return setErr(`Item ${i + 1}: total meters must be > 0.`);
      } else {
        if (!it.itemTypeId) return setErr(`Item ${i + 1}: item type is required.`);
        if (!it.quantity || parseInt(it.quantity) <= 0) return setErr(`Item ${i + 1}: quantity must be > 0.`);
      }
    }

    const paid = parseFloat(amountPaid) || 0;
    if (paid < 0) return setErr("Amount paid cannot be negative.");
    const billTotal = grandTotal;
    if (paid > billTotal) return setErr(`Amount paid (${currency}${paid.toFixed(2)}) cannot exceed total (${currency}${billTotal.toFixed(2)}).`);

    setSaving(true);
    try {
      await onMutate(
        `mutation CreateBill(
          $supplierId:ID! $warehouseId:ID! $items:[PurchaseBillItemInput!]!
          $totalAmount:Float $amountPaid:Float $invoiceRef:String
          $billImage:String $notes:String $billDate:Date
        ){
          createPurchaseBill(
            supplierId:$supplierId warehouseId:$warehouseId items:$items
            totalAmount:$totalAmount amountPaid:$amountPaid invoiceRef:$invoiceRef
            billImage:$billImage notes:$notes billDate:$billDate
          ){ purchaseBill{ id billNumber } }
        }`,
        {
          supplierId, warehouseId, billDate, invoiceRef, notes,
          totalAmount: grandTotal,
          amountPaid: paid,
          billImage: billImages.length ? JSON.stringify(billImages.map(i => i.b64)) : undefined,
          items: items.map(it => ({
            itemKind: it.itemKind,
            clothCategoryId: it.clothCategoryId || null,
            clothColorId: it.clothColorId || null,
            totalMeters: it.totalMeters ? parseFloat(it.totalMeters) : null,
            costPerMeter: it.costPerMeter ? parseFloat(it.costPerMeter) : null,
            binLocation: it.binLocation,
            clothCode: it.clothCode,
            itemTypeId: it.itemTypeId || null,
            ageGroup: it.ageGroup || null,
            size: it.size,
            quantity: it.quantity ? parseInt(it.quantity) : null,
            unitPrice: it.unitPrice ? parseFloat(it.unitPrice) : null,
            gstRate: it.gstRate ? parseFloat(it.gstRate) : null,
            notes: it.notes,
          })),
        }
      );
      setShowForm(false);
      resetForm();
      showToast("Purchase bill recorded.", "success");
    } catch (e) {
      setErr(friendlyError(e));
      showToast(friendlyError(e), "error");
    } finally {
      setSaving(false);
    }
  }

  const payingBill = payBillId ? bills.find(b => b.id === payBillId) : null;

  async function handlePayment() {
    if (!payBillId) return;
    const amt = parseFloat(payAmount);
    if (!payAmount || isNaN(amt) || amt <= 0) { setPayErr("Enter a valid amount."); return; }
    if (payingBill && amt > payingBill.amountPending) {
      setPayErr(`Amount ${currency}${amt} exceeds pending balance ${currency}${payingBill.amountPending.toFixed(2)}.`);
      return;
    }
    setPayLoading(true); setPayErr("");
    try {
      await onMutate(
        `mutation Pay($billId:ID!,$amount:Float!,$paymentDate:Date,$paymentMode:String,$reference:String,$notes:String){
          createSupplierPayment(billId:$billId,amount:$amount,paymentDate:$paymentDate,paymentMode:$paymentMode,reference:$reference,notes:$notes){
            payment{ id paymentNumber }
          }
        }`,
        { billId: payBillId, amount: amt, paymentDate: payDate, paymentMode: payMode, reference: payRef, notes: payNotes }
      );
      setPayBillId(null); setPayAmount(""); setPayMode("CASH"); setPayRef(""); setPayNotes("");
      setPayDate(new Date().toISOString().slice(0, 10));
      showToast("Payment recorded.", "success");
    } catch (e) {
      setPayErr(friendlyError(e));
      showToast(friendlyError(e), "error");
    } finally {
      setPayLoading(false);
    }
  }

  const [pendingDeletePay, setPendingDeletePay] = useState<string | null>(null);

  async function handleDeletePayment(paymentId: string) {
    if (pendingDeletePay !== paymentId) {
      setPendingDeletePay(paymentId);
      showToast("Click delete again to confirm — the paid amount will be reversed.", "warn");
      setTimeout(() => setPendingDeletePay(prev => prev === paymentId ? null : prev), 4000);
      return;
    }
    setPendingDeletePay(null);
    try {
      await onMutate(`mutation D($id:ID!){deleteSupplierPayment(id:$id){ok}}`, { id: paymentId });
      showToast("Payment deleted and bill amount reversed.", "success");
    } catch (e) {
      showToast(friendlyError(e), "error");
    }
  }

  function printBill(bill: PurchaseBill) {
    const hasGst = bill.taxAmount > 0;
    const rows = bill.items.map(item => {
      const desc = item.itemKind === "RAW_CLOTH"
        ? [item.clothCategory?.name, item.clothColor?.name, item.binLocation].filter(Boolean).join(" · ")
        : [item.itemType?.name, item.size].filter(Boolean).join(" · ");
      const qty = item.itemKind === "RAW_CLOTH" ? `${item.totalMeters}m` : `${item.quantity} pcs`;
      const unit = item.itemKind === "RAW_CLOTH"
        ? (item.costPerMeter ? `${fmtMoney(item.costPerMeter)}/m` : "—")
        : (item.unitPrice ? fmtMoney(item.unitPrice) : "—");
      const code = item.clothCode ? `<span style="font-family:monospace;font-size:11px;color:#888">${item.clothCode}</span>` : "";
      const gstCol = hasGst ? `<td class="amount">${item.gstRate > 0 ? `${item.gstRate}%` : "—"}</td>` : "";
      return `<tr><td>${item.itemKind === "RAW_CLOTH" ? "Raw Cloth" : "Readymade"}</td><td>${desc}${code ? " " + code : ""}</td><td>${qty}</td><td class="amount">${unit}</td>${gstCol}<td class="amount">${fmtMoney(item.totalPrice)}</td></tr>`;
    }).join("");

    const paymentRows = (bill.supplierPayments || []).map(p =>
      `<tr><td>${p.paymentNumber}</td><td>${fmtDate(p.paymentDate)}</td><td>${p.paymentMode.replace("_", " ")}</td><td>${p.reference || "—"}</td><td class="amount" style="color:#2e7d32;font-weight:700">${fmtMoney(p.amount)}</td></tr>`
    ).join("");

    const st = STATUS_COLORS[bill.paymentStatus] ?? STATUS_COLORS.PENDING;
    const gstHeader = hasGst ? "<th class=\"amount\">GST %</th>" : "";
    const gstInCompany = systemSettings?.gstin ? `<div class="meta-item"><label>Company GSTIN</label><span>${systemSettings.gstin}</span></div>` : "";

    const gstTotals = hasGst ? `
      <div class="totals-row"><span>Taxable Amount</span><span>${fmtMoney(bill.taxableAmount)}</span></div>
      ${bill.cgstAmount > 0 ? `
        <div class="totals-row"><span>CGST</span><span>${fmtMoney(bill.cgstAmount)}</span></div>
        <div class="totals-row"><span>SGST</span><span>${fmtMoney(bill.sgstAmount)}</span></div>
      ` : `<div class="totals-row"><span>IGST</span><span>${fmtMoney(bill.igstAmount)}</span></div>`}
    ` : "";

    printDoc(`
      <div class="header">
        <div class="header-left">
          <h1>${bill.billNumber}</h1>
          <div style="font-size:13px;color:#555;margin-top:4px">Purchase Bill</div>
          ${bill.invoiceRef ? `<div style="font-size:12px;color:#888;margin-top:2px">Supplier Ref: ${bill.invoiceRef}</div>` : ""}
          <div style="margin-top:6px"><span class="badge" style="background:${st.color}">${st.label}</span></div>
        </div>
        <div class="header-right">
          <div style="font-weight:700;font-size:15px">${fmtMoney(bill.totalAmount)}</div>
          <div>Bill Date: ${fmtDate(bill.billDate)}</div>
        </div>
      </div>
      <div class="meta">
        <div class="meta-item"><label>Supplier</label><span>${bill.supplier.name}</span></div>
        <div class="meta-item"><label>Warehouse</label><span>${bill.warehouse.name}</span></div>
        <div class="meta-item"><label>Payment Status</label><span style="color:${st.color};font-weight:700">${st.label}</span></div>
        ${gstInCompany}
      </div>
      <h2>Items</h2>
      <table>
        <thead><tr><th>Type</th><th>Description</th><th>Qty / Meters</th><th class="amount">Unit Price</th>${gstHeader}<th class="amount">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">
        ${gstTotals}
        <div class="totals-row"><span>Total Amount</span><span>${fmtMoney(bill.totalAmount)}</span></div>
        <div class="totals-row" style="color:#2e7d32"><span>Paid</span><span>${fmtMoney(bill.amountPaid)}</span></div>
        <div class="totals-row grand" style="${bill.amountPending > 0 ? "color:#e65100" : "color:#2e7d32"}"><span>Balance Due</span><span>${fmtMoney(bill.amountPending)}</span></div>
      </div>
      ${(bill.supplierPayments || []).length > 0 ? `
        <h2>Payment History</h2>
        <table>
          <thead><tr><th>Pay #</th><th>Date</th><th>Mode</th><th>Reference</th><th class="amount">Amount</th></tr></thead>
          <tbody>${paymentRows}</tbody>
        </table>
      ` : ""}
      ${bill.notes ? `<div style="margin-top:16px;font-size:12px;color:#666"><strong>Notes:</strong> ${bill.notes}</div>` : ""}
    `, bill.billNumber);
  }

  return (
    <div>
      <PageHeader
        title="Purchase Bills"
        sub="Direct supplier purchases — items go to stock immediately"
        actions={<>
          <Button variant="secondary" size="sm" onClick={() => downloadCsv(`purchase-bills-${new Date().toISOString().slice(0,10)}.csv`, bills.map(b => ({ "Bill #": b.billNumber, Date: b.billDate?.slice(0,10), Supplier: b.supplier?.name, Warehouse: b.warehouse?.name, "Invoice Ref": b.invoiceRef, Total: b.totalAmount, Paid: b.amountPaid, Pending: b.amountPending, Status: b.paymentStatus })))}>
            ↓ Export CSV
          </Button>
          {canCreate && (
            <Button variant="primary" onClick={() => { setShowForm(true); setErr(""); }}>
              + Record Purchase
            </Button>
          )}
        </>}
      />

      {/* Bills list */}
      {bills.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)" }}>
          No purchase bills yet.{canCreate ? ' Click "Record Purchase" to add one.' : ""}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {bills.map(bill => {
            const st = STATUS_COLORS[bill.paymentStatus] ?? STATUS_COLORS.PENDING;
            const isOpen = expanded === bill.id;
            return (
              <div key={bill.id} style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
                <div
                  onClick={() => setExpanded(isOpen ? null : bill.id)}
                  style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: isOpen ? "var(--canvas)" : undefined }}
                >
                  <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{bill.billNumber}</span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>{bill.supplier.name}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{formatDate(bill.billDate)}</span>
                    {bill.invoiceRef && <span style={{ fontSize: 12, color: "var(--muted)" }}>Ref: {bill.invoiceRef}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontWeight: 700 }}>{formatMoney(bill.totalAmount)}</span>
                    {bill.amountPending > 0 && (
                      <span style={{ fontSize: 12, color: "#e65100" }}>{formatMoney(bill.amountPending)} pending</span>
                    )}
                    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                    <span style={{ color: "var(--muted)", fontSize: 16 }}>{isOpen ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ padding: "0 18px 18px", borderTop: "1px solid var(--line)" }}>
                    {/* Payment summary */}
                    <div style={{ display: "flex", gap: 24, padding: "14px 0 18px", flexWrap: "wrap" }}>
                      {bill.taxAmount > 0 && <Stat label="Taxable" value={`${formatMoney(bill.taxableAmount)}`} />}
                      {bill.cgstAmount > 0 && <Stat label="CGST" value={`${formatMoney(bill.cgstAmount)}`} />}
                      {bill.cgstAmount > 0 && <Stat label="SGST" value={`${formatMoney(bill.sgstAmount)}`} />}
                      {bill.igstAmount > 0 && <Stat label="IGST" value={`${formatMoney(bill.igstAmount)}`} />}
                      <Stat label="Total" value={`${formatMoney(bill.totalAmount)}`} />
                      <Stat label="Paid" value={`${formatMoney(bill.amountPaid)}`} color="#2e7d32" />
                      <Stat label="Pending" value={`${formatMoney(bill.amountPending)}`} color={bill.amountPending > 0 ? "#e65100" : undefined} />
                      <Stat label="Warehouse" value={bill.warehouse.name} />
                    </div>

                    {/* Items */}
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--muted)" }}>
                      Items ({bill.items.length})
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: "var(--canvas)" }}>
                            {["Type", "Description", "Code", "Qty / Meters", "Unit Price", ...(bill.taxAmount > 0 ? ["GST %"] : []), "Total"].map(h => (
                              <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {bill.items.map((item, i) => (
                            <tr key={item.id ?? i} style={{ borderBottom: "1px solid var(--line)" }}>
                              <td style={{ padding: "8px 10px" }}>
                                <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                                  background: item.itemKind === "RAW_CLOTH" ? "#e3f2fd" : "#f3e5f5",
                                  color: item.itemKind === "RAW_CLOTH" ? "#1565c0" : "#6a1b9a" }}>
                                  {item.itemKind === "RAW_CLOTH" ? "Raw Cloth" : "Readymade"}
                                </span>
                              </td>
                              <td style={{ padding: "8px 10px" }}>
                                {item.itemKind === "RAW_CLOTH"
                                  ? [item.clothCategory?.name, item.clothColor?.name, item.binLocation].filter(Boolean).join(" · ")
                                  : [item.itemType?.name, item.size].filter(Boolean).join(" · ")
                                }
                              </td>
                              <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: 12 }}>
                                {item.clothCode || "—"}
                              </td>
                              <td style={{ padding: "8px 10px" }}>
                                {item.itemKind === "RAW_CLOTH"
                                  ? `${item.totalMeters}m`
                                  : `${item.quantity} pcs`}
                              </td>
                              <td style={{ padding: "8px 10px" }}>
                                {item.itemKind === "RAW_CLOTH"
                                  ? (item.costPerMeter ? `${currency}${item.costPerMeter}/m` : "—")
                                  : (item.unitPrice ? `${currency}${item.unitPrice}` : "—")}
                              </td>
                              {bill.taxAmount > 0 && (
                                <td style={{ padding: "8px 10px", color: "var(--muted)", fontSize: 12 }}>
                                  {item.gstRate > 0 ? `${item.gstRate}%` : "—"}
                                </td>
                              )}
                              <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                                {formatMoney(item.totalPrice)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Bill images */}
                    {bill.billImage && (() => {
                      let imgs: string[];
                      try { imgs = JSON.parse(bill.billImage); if (!Array.isArray(imgs)) imgs = [bill.billImage]; }
                      catch { imgs = [bill.billImage]; }
                      return (
                        <div style={{ marginTop: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Bill Photo{imgs.length > 1 ? "s" : ""}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {imgs.map((src, i) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={i} src={src} alt={`Bill page ${i + 1}`} style={{ maxWidth: 300, maxHeight: 220, borderRadius: 8, border: "1px solid var(--line)", objectFit: "contain" }} />
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Supplier payment history */}
                    <div style={{ marginTop: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                          Payment History
                          {bill.amountPending > 0 && (
                            <span style={{ marginLeft: 8, fontSize: 12, color: "#e65100", fontWeight: 600 }}>
                              {formatMoney(bill.amountPending)} pending
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Button variant="secondary" size="sm" onClick={() => printBill(bill)}>
                            🖨 Print Bill
                          </Button>
                          {canCreate && bill.amountPending > 0 && (
                            <Button variant="primary" size="sm" onClick={() => { setPayBillId(bill.id); setPayErr(""); setPayAmount(""); setPayMode("CASH"); setPayRef(""); setPayNotes(""); setPayDate(new Date().toISOString().slice(0, 10)); }}>
                              + Record Payment
                            </Button>
                          )}
                        </div>
                      </div>

                      {(bill.supplierPayments || []).length === 0 ? (
                        <div style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic" }}>No payments recorded yet.</div>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: "var(--canvas)" }}>
                              {["Pay #", "Date", "Mode", "Reference", "Amount", ""].map(h => (
                                <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--line)", fontSize: 12 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(bill.supplierPayments || []).map(p => (
                              <tr key={p.id} style={{ borderBottom: "1px solid var(--line)" }}>
                                <td style={{ padding: "7px 10px", fontWeight: 600, fontSize: 12 }}>{p.paymentNumber}</td>
                                <td style={{ padding: "7px 10px", fontSize: 12 }}>{formatDate(p.paymentDate)}</td>
                                <td style={{ padding: "7px 10px", fontSize: 12 }}>{p.paymentMode.replace("_", " ")}</td>
                                <td style={{ padding: "7px 10px", fontSize: 12, color: "var(--muted)" }}>{p.reference || "—"}</td>
                                <td style={{ padding: "7px 10px", fontWeight: 700, color: "#2e7d32" }}>{formatMoney(p.amount)}</td>
                                <td style={{ padding: "7px 10px" }}>
                                  {canCreate && (
                                    <button onClick={() => handleDeletePayment(p.id)}
                                      style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid #fcc", background: pendingDeletePay === p.id ? "#fcc" : "#fff5f5", color: "#c62828", fontSize: 11, cursor: "pointer" }}>
                                      {pendingDeletePay === p.id ? "Confirm?" : "×"}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {bill.notes && (
                      <div style={{ marginTop: 12, fontSize: 13, color: "var(--muted)" }}>Note: {bill.notes}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Record Payment Modal */}
      {payBillId && payingBill && (
        <div onClick={e => { if (e.target === e.currentTarget) setPayBillId(null); }} style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--paper)", borderRadius: 16, width: "min(440px, 100%)", boxShadow: "0 24px 64px #0006" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Record Payment</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  {payingBill.billNumber} · {payingBill.supplier.name} · {formatMoney(payingBill.amountPending)} pending
                </div>
              </div>
              <button onClick={() => setPayBillId(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "var(--muted)" }}>×</button>
            </div>
            <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label={`Amount (${currency})`} required>
                <Input type="number" min="0.01" step="0.01" value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  placeholder={`Max ${formatMoney(payingBill.amountPending)}`}
                  autoFocus />
              </Field>
              <FormGrid cols={2} gap={12}>
                <Field label="Payment Date">
                  <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </Field>
                <Field label="Payment Mode">
                  <Select value={payMode} onChange={e => setPayMode(e.target.value)}>
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                    <option value="UPI">UPI</option>
                    <option value="CHEQUE">Cheque</option>
                  </Select>
                </Field>
              </FormGrid>
              <Field label="Reference / UTR (optional)">
                <Input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="Transaction ID, cheque number…" />
              </Field>
              <Field label="Notes (optional)">
                <Input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Any remarks…" />
              </Field>
              <ErrorBanner msg={payErr} />
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <Button variant="secondary" onClick={() => setPayBillId(null)}>Cancel</Button>
                <Button variant="primary" onClick={handlePayment} disabled={payLoading}>
                  {payLoading ? "Saving…" : "Record Payment"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Bill Modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 200, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px" }}>
          <div style={{ background: "var(--paper)", borderRadius: 16, width: "min(740px, 100%)", boxShadow: "0 24px 64px #0006" }}>
            {/* Modal header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 17 }}>Record Direct Purchase</span>
              <button onClick={() => { setShowForm(false); resetForm(); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "var(--muted)" }}>×</button>
            </div>

            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Header fields */}
              <FormGrid>
                <Field label="Supplier" required>
                  <Select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                    <option value="">Select supplier…</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
                <Field label="Warehouse" required>
                  <Select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </Select>
                </Field>
                <Field label="Purchase Date">
                  <Input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} />
                </Field>
                <Field label="Supplier Invoice # (optional)">
                  <Input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} placeholder="e.g. INV-2024-001" />
                </Field>
              </FormGrid>

              {/* Items */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>Items</span>
                  <Button variant="secondary" onClick={() => setItems(p => [...p, blankItem()])}>
                    + Add Item
                  </Button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {items.map((item, idx) => (
                    <ItemEditor
                      key={idx} item={item} idx={idx}
                      clothCategories={clothCategories} clothColors={clothColors} itemTypes={itemTypes}
                      gstEnabled={gstEnabled}
                      onChange={patch => updateItem(idx, patch)}
                      onRemove={items.length > 1 ? () => removeItem(idx) : undefined}
                    />
                  ))}
                </div>
              </div>

              {/* Total summary */}
              <div style={{ background: "var(--canvas)", borderRadius: 10, padding: "14px 16px", display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center" }}>
                {gstEnabled && computedGst > 0 ? (
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>TAXABLE</div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{formatMoney(computedTotal)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>GST</div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{formatMoney(computedGst)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>GRAND TOTAL</div>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{formatMoney(grandTotal)}</div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>TOTAL AMOUNT</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{formatMoney(computedTotal)}</div>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <Field label={`Amount Paid (${currency})`}>
                    <Input
                      type="number" min="0" step="0.01"
                      value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                      placeholder={`0 – ${grandTotal.toFixed(2)}`}
                      style={{ minWidth: 150 }}
                    />
                  </Field>
                </div>
                {(() => {
                  const paid = parseFloat(amountPaid) || 0;
                  const pending = grandTotal - paid;
                  return pending > 0 ? (
                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>PENDING</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#e65100" }}>{formatMoney(pending)}</div>
                    </div>
                  ) : paid > 0 ? (
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#2e7d32" }}>✓ Fully Paid</div>
                  ) : null;
                })()}
              </div>

              {/* Bill photos */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Bill Photos (optional — upload multiple pages)</label>
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  📷 Add Photo{billImages.length > 0 ? ` (${billImages.length} added)` : ""}
                </Button>
                <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleImagePick} style={{ display: "none" }} />
                {billImages.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                    {billImages.map((img, i) => (
                      <div key={i} style={{ position: "relative", display: "inline-block" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.b64} alt={img.name} style={{ width: 100, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} />
                        <Button variant="danger" size="sm" onClick={() => setBillImages(prev => prev.filter((_, j) => j !== i))}
                          style={{ position: "absolute", top: 2, right: 2, borderRadius: "50%", width: 18, height: 18, padding: 0, fontSize: 11, justifyContent: "center", minWidth: "unset" }}>×</Button>
                        <div style={{ fontSize: 10, color: "var(--muted)", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <Field label="Notes (optional)">
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Any remarks about this purchase…" />
              </Field>

              <ErrorBanner msg={err} />

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <Button variant="secondary" onClick={() => { setShowForm(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleSubmit} disabled={saving}>
                  {saving ? "Saving…" : "Record Purchase & Stock"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── item editor row ──────────────────────────────────────────────────────────

function ItemEditor({
  item, idx, clothCategories, clothColors, itemTypes, gstEnabled, onChange, onRemove,
}: {
  item: DraftItem; idx: number
  clothCategories: ClothCategory[]; clothColors: ClothColor[]; itemTypes: ItemType[]
  gstEnabled?: boolean
  onChange: (patch: Partial<DraftItem>) => void
  onRemove?: () => void
}) {
  const lineTotal = itemLineTotal(item);

  function handleCostPerMeterChange(val: string) {
    onChange({ costPerMeter: val });
  }
  function handleCostPerMeterBlur(val: string) {
    if (val && !item.clothCode) onChange({ clothCode: genClothCode(val) });
  }

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, position: "relative" }}>
      {onRemove && (
        <button onClick={onRemove}
          style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--muted)" }}>
          ×
        </button>
      )}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 10 }}>ITEM {idx + 1}</div>

      {/* Kind selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["RAW_CLOTH", "READYMADE"] as const).map(k => (
          <button key={k} onClick={() => onChange({ itemKind: k })}
            style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid var(--line)", cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: item.itemKind === k ? "var(--primary)" : "var(--canvas)",
              color: item.itemKind === k ? "#fff" : "var(--ink)" }}>
            {k === "RAW_CLOTH" ? "Raw Cloth" : "Readymade"}
          </button>
        ))}
      </div>

      {item.itemKind === "RAW_CLOTH" ? (
        <FormGrid gap={10}>
          <Field label="Category" required>
            <Select value={item.clothCategoryId} onChange={e => onChange({ clothCategoryId: e.target.value })}>
              <option value="">Select…</option>
              {clothCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Color" required>
            <Select value={item.clothColorId} onChange={e => onChange({ clothColorId: e.target.value })}>
              <option value="">Select…</option>
              {clothColors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Total Meters" required>
            <Input type="number" min="0" step="0.1" value={item.totalMeters} onChange={e => onChange({ totalMeters: e.target.value })} placeholder="e.g. 50" />
          </Field>
          <Field label="Cost per Meter (₹)" required>
            <Input type="number" min="0" step="0.01" value={item.costPerMeter}
              onChange={e => handleCostPerMeterChange(e.target.value)}
              onBlur={e => handleCostPerMeterBlur(e.target.value)}
              placeholder="e.g. 200" />
          </Field>
          <Field label="Bin / Shelf Location">
            <Input value={item.binLocation} onChange={e => onChange({ binLocation: e.target.value })} placeholder="e.g. A-12" />
          </Field>
          <Field label="Cloth Code">
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Input value={item.clothCode} onChange={e => onChange({ clothCode: e.target.value })}
                placeholder="Auto-generated" style={{ fontFamily: "monospace", flex: 1 }} />
              {item.costPerMeter && (
                <button onClick={() => onChange({ clothCode: genClothCode(item.costPerMeter) })}
                  title="Regenerate code" style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--canvas)", cursor: "pointer", fontSize: 14 }}>
                  🔄
                </button>
              )}
            </div>
            {item.clothCode && (
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                Code <strong style={{ fontFamily: "monospace" }}>{item.clothCode}</strong> → price embedded
              </div>
            )}
          </Field>
        </FormGrid>
      ) : (
        <FormGrid gap={10}>
          <Field label="Item Type" required>
            <Select value={item.itemTypeId} onChange={e => onChange({ itemTypeId: e.target.value })}>
              <option value="">Select…</option>
              {itemTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Color (optional)">
            <Select value={item.clothColorId} onChange={e => onChange({ clothColorId: e.target.value })}>
              <option value="">Select…</option>
              {clothColors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Age Group">
            <AgeGroupSelect value={item.ageGroup} onChange={v => onChange({ ageGroup: v, size: "" })} />
          </Field>
          <div>
            <SizeSelect value={item.size} onChange={v => onChange({ size: v })} label="Size" ageGroup={item.ageGroup || undefined} />
          </div>
          <Field label="Quantity" required>
            <Input type="number" min="0" step="1" value={item.quantity} onChange={e => onChange({ quantity: e.target.value })} placeholder="e.g. 24" />
          </Field>
          <Field label="Unit Price (₹)">
            <Input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => onChange({ unitPrice: e.target.value })} placeholder="e.g. 450" />
          </Field>
        </FormGrid>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {gstEnabled && (
            <Field label="GST %">
              <Select value={item.gstRate} onChange={e => onChange({ gstRate: e.target.value })} style={{ width: 100 }}>
                <option value="">0%</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
              </Select>
            </Field>
          )}
          <Field label="Item Notes">
            <Input value={item.notes} onChange={e => onChange({ notes: e.target.value })} placeholder="Any remarks for this item…" style={{ width: 240 }} />
          </Field>
        </div>
        {lineTotal > 0 && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>LINE TOTAL</div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{formatMoney(lineTotal)}</div>
            {gstEnabled && (parseFloat(item.gstRate) || 0) > 0 && (
              <div style={{ fontSize: 11, color: "var(--muted)" }}>+ {item.gstRate}% GST = {formatMoney(lineTotal * (parseFloat(item.gstRate) || 0) / 100)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
