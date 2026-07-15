"use client";
import { useState, useRef } from "react";
import { formatMoney, formatDate } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import SizeSelect from "@/app/components/atoms/SizeSelect";

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
  totalPrice: number
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
  totalAmount: number
  amountPaid: number
  amountPending: number
  paymentStatus: "PENDING" | "PARTIAL" | "PAID"
  notes: string
  createdAt: string
  items: BillItem[]
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
  size: string
  quantity: string
  unitPrice: string
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
    itemTypeId: "", size: "", quantity: "", unitPrice: "", notes: "",
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

const FIELD: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid var(--line)", background: "var(--canvas)",
  color: "var(--ink)", fontSize: 13, outline: "none", boxSizing: "border-box",
};

const BTN = (bg = "var(--primary)", color = "#fff"): React.CSSProperties => ({
  padding: "9px 18px", borderRadius: 8, border: "none", background: bg,
  color, fontWeight: 700, fontSize: 13, cursor: "pointer",
});

// ─── main component ────────────────────────────────────────────────────────────

export default function PurchaseBills({
  bills, suppliers, warehouses, clothCategories, clothColors, itemTypes,
  isAdmin, isSuperAdmin, isManager, isStoreKeeper, onMutate,
}: Props) {
  const canCreate = isSuperAdmin || isAdmin || isManager || isStoreKeeper;

  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Form state
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceRef, setInvoiceRef] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [billImageB64, setBillImageB64] = useState("");
  const [billImageName, setBillImageName] = useState("");
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
  const fileRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setSupplierId(""); setWarehouseId(warehouses[0]?.id ?? "");
    setBillDate(new Date().toISOString().slice(0, 10));
    setInvoiceRef(""); setAmountPaid(""); setNotes("");
    setBillImageB64(""); setBillImageName("");
    setItems([blankItem()]); setErr("");
  }

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setErr("Bill photo must be under 5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setBillImageB64(reader.result as string);
      setBillImageName(file.name);
    };
    reader.readAsDataURL(file);
  }

  function updateItem(idx: number, patch: Partial<DraftItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  const computedTotal = items.reduce((s, it) => s + itemLineTotal(it), 0);

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
    if (paid > computedTotal) return setErr(`Amount paid (₹${paid}) cannot exceed total (₹${computedTotal.toFixed(2)}).`);

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
          totalAmount: computedTotal,
          amountPaid: paid,
          billImage: billImageB64,
          items: items.map(it => ({
            itemKind: it.itemKind,
            clothCategoryId: it.clothCategoryId || null,
            clothColorId: it.clothColorId || null,
            totalMeters: it.totalMeters ? parseFloat(it.totalMeters) : null,
            costPerMeter: it.costPerMeter ? parseFloat(it.costPerMeter) : null,
            binLocation: it.binLocation,
            clothCode: it.clothCode,
            itemTypeId: it.itemTypeId || null,
            size: it.size,
            quantity: it.quantity ? parseInt(it.quantity) : null,
            unitPrice: it.unitPrice ? parseFloat(it.unitPrice) : null,
            notes: it.notes,
          })),
        }
      );
      setShowForm(false);
      resetForm();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Purchase Bills</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Direct supplier purchases — items go to stock immediately</div>
        </div>
        {canCreate && (
          <button onClick={() => { setShowForm(true); setErr(""); }} style={BTN()}>
            + Record Purchase
          </button>
        )}
      </div>

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
                    <span style={{ fontWeight: 700 }}>₹{formatMoney(bill.totalAmount)}</span>
                    {bill.amountPending > 0 && (
                      <span style={{ fontSize: 12, color: "#e65100" }}>₹{formatMoney(bill.amountPending)} pending</span>
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
                      <Stat label="Total" value={`₹${formatMoney(bill.totalAmount)}`} />
                      <Stat label="Paid" value={`₹${formatMoney(bill.amountPaid)}`} color="#2e7d32" />
                      <Stat label="Pending" value={`₹${formatMoney(bill.amountPending)}`} color={bill.amountPending > 0 ? "#e65100" : undefined} />
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
                            {["Type", "Description", "Code", "Qty / Meters", "Unit Price", "Total"].map(h => (
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
                                  ? (item.costPerMeter ? `₹${item.costPerMeter}/m` : "—")
                                  : (item.unitPrice ? `₹${item.unitPrice}` : "—")}
                              </td>
                              <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                                ₹{formatMoney(item.totalPrice)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Bill image */}
                    {bill.billImage && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Bill Photo</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={bill.billImage} alt="Bill" style={{ maxWidth: 320, maxHeight: 240, borderRadius: 8, border: "1px solid var(--line)" }} />
                      </div>
                    )}

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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Supplier *</label>
                  <select value={supplierId} onChange={e => setSupplierId(e.target.value)} style={FIELD}>
                    <option value="">Select supplier…</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Warehouse *</label>
                  <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} style={FIELD}>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Purchase Date</label>
                  <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} style={FIELD} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Supplier Invoice # (optional)</label>
                  <input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} placeholder="e.g. INV-2024-001" style={FIELD} />
                </div>
              </div>

              {/* Items */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>Items</span>
                  <button onClick={() => setItems(p => [...p, blankItem()])} style={BTN("var(--canvas)", "var(--ink)")}>
                    + Add Item
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {items.map((item, idx) => (
                    <ItemEditor
                      key={idx} item={item} idx={idx}
                      clothCategories={clothCategories} clothColors={clothColors} itemTypes={itemTypes}
                      onChange={patch => updateItem(idx, patch)}
                      onRemove={items.length > 1 ? () => removeItem(idx) : undefined}
                    />
                  ))}
                </div>
              </div>

              {/* Total summary */}
              <div style={{ background: "var(--canvas)", borderRadius: 10, padding: "14px 16px", display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>TOTAL AMOUNT</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>₹{formatMoney(computedTotal)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Amount Paid (₹)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                    placeholder={`0 – ${computedTotal.toFixed(2)}`}
                    style={{ ...FIELD, width: "auto", minWidth: 150 }}
                  />
                </div>
                {(() => {
                  const paid = parseFloat(amountPaid) || 0;
                  const pending = computedTotal - paid;
                  return pending > 0 ? (
                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>PENDING</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#e65100" }}>₹{formatMoney(pending)}</div>
                    </div>
                  ) : paid > 0 ? (
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#2e7d32" }}>✓ Fully Paid</div>
                  ) : null;
                })()}
              </div>

              {/* Bill photo */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Bill Photo (optional)</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button onClick={() => fileRef.current?.click()} style={BTN("var(--canvas)", "var(--ink)")}>
                    📷 {billImageName ? "Change Photo" : "Upload Bill"}
                  </button>
                  {billImageName && <span style={{ fontSize: 12, color: "var(--muted)" }}>{billImageName}</span>}
                  {billImageB64 && (
                    <button onClick={() => { setBillImageB64(""); setBillImageName(""); }}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--muted)" }}>×</button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleImagePick} style={{ display: "none" }} />
                {billImageB64 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={billImageB64} alt="Preview" style={{ marginTop: 8, maxWidth: 220, maxHeight: 160, borderRadius: 8, border: "1px solid var(--line)" }} />
                )}
              </div>

              {/* Notes */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Notes (optional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Any remarks about this purchase…"
                  style={{ ...FIELD, resize: "vertical" }} />
              </div>

              {err && (
                <div style={{ background: "#fff1f0", border: "1px solid #ffc5c2", color: "#8d3e39", borderRadius: 9, padding: "10px 14px", fontSize: 13 }}>
                  {err}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => { setShowForm(false); resetForm(); }} style={BTN("var(--canvas)", "var(--ink)")}>
                  Cancel
                </button>
                <button onClick={handleSubmit} disabled={saving} style={{ ...BTN(), opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving…" : "Record Purchase & Stock"}
                </button>
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
  item, idx, clothCategories, clothColors, itemTypes, onChange, onRemove,
}: {
  item: DraftItem; idx: number
  clothCategories: ClothCategory[]; clothColors: ClothColor[]; itemTypes: ItemType[]
  onChange: (patch: Partial<DraftItem>) => void
  onRemove?: () => void
}) {
  const lineTotal = itemLineTotal(item);

  function handleCostPerMeterChange(val: string) {
    const code = val ? genClothCode(val) : "";
    onChange({ costPerMeter: val, clothCode: code });
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Category *</label>
            <select value={item.clothCategoryId} onChange={e => onChange({ clothCategoryId: e.target.value })} style={FIELD}>
              <option value="">Select…</option>
              {clothCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Color *</label>
            <select value={item.clothColorId} onChange={e => onChange({ clothColorId: e.target.value })} style={FIELD}>
              <option value="">Select…</option>
              {clothColors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Total Meters *</label>
            <input type="number" min="0" step="0.1" value={item.totalMeters} onChange={e => onChange({ totalMeters: e.target.value })} placeholder="e.g. 50" style={FIELD} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Cost per Meter (₹) *</label>
            <input type="number" min="0" step="0.01" value={item.costPerMeter}
              onChange={e => handleCostPerMeterChange(e.target.value)}
              placeholder="e.g. 200" style={FIELD} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Bin / Shelf Location</label>
            <input value={item.binLocation} onChange={e => onChange({ binLocation: e.target.value })} placeholder="e.g. A-12" style={FIELD} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Cloth Code</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input value={item.clothCode} onChange={e => onChange({ clothCode: e.target.value })}
                placeholder="Auto-generated" style={{ ...FIELD, fontFamily: "monospace", flex: 1 }} />
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
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Item Type *</label>
            <select value={item.itemTypeId} onChange={e => onChange({ itemTypeId: e.target.value })} style={FIELD}>
              <option value="">Select…</option>
              {itemTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Color (optional)</label>
            <select value={item.clothColorId} onChange={e => onChange({ clothColorId: e.target.value })} style={FIELD}>
              <option value="">Select…</option>
              {clothColors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <SizeSelect value={item.size} onChange={v => onChange({ size: v })} label="Size" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Quantity *</label>
            <input type="number" min="0" step="1" value={item.quantity} onChange={e => onChange({ quantity: e.target.value })} placeholder="e.g. 24" style={FIELD} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Unit Price (₹)</label>
            <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => onChange({ unitPrice: e.target.value })} placeholder="e.g. 450" style={FIELD} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Item Notes</label>
          <input value={item.notes} onChange={e => onChange({ notes: e.target.value })} placeholder="Any remarks for this item…" style={{ ...FIELD, width: 260 }} />
        </div>
        {lineTotal > 0 && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>LINE TOTAL</div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>₹{formatMoney(lineTotal)}</div>
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
