"use client";
import React, { useState } from "react";
import { Quotation, Buyer, WarehouseLocation, FinishedProduct } from "@/app/types";
import { QUOTATION_STATUS_LABELS, STATUS_BADGE_COLORS } from "@/app/lib/constants";

interface Props {
  quotations: Quotation[];
  buyers: Buyer[];
  warehouses: WarehouseLocation[];
  finishedProducts: FinishedProduct[];
  gql: <T>(q: string, v?: Record<string, unknown>) => Promise<T>;
  onRefresh: () => void;
}

const STATUS_OPTIONS = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"];

const EMPTY_FORM = {
  buyerId: "", warehouseId: "", discount: "0", notes: "", validityDate: "",
  items: [{ finishedProductId: "", quantity: "1", unitPrice: "" }],
};

export default function Quotations({ quotations, buyers, warehouses, finishedProducts, gql, onRefresh }: Props) {
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState<Quotation | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertMode, setConvertMode] = useState<"CREDIT" | "PAID" | null>(null);

  const visible = filter === "ALL" ? quotations : quotations.filter(q => q.status === filter);

  function addItem() {
    setForm(f => ({ ...f, items: [...f.items, { finishedProductId: "", quantity: "1", unitPrice: "" }] }));
  }

  function removeItem(idx: number) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  function setItemField(idx: number, field: string, value: string) {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: value };
      // Auto-fill unit price from finished product sale price
      if (field === "finishedProductId") {
        const fp = finishedProducts.find(p => p.id === value);
        if (fp) items[idx].unitPrice = String(fp.salePrice);
      }
      return { ...f, items };
    });
  }

  async function saveQuotation() {
    setErr("");
    if (!form.buyerId || !form.warehouseId) { setErr("Buyer and warehouse are required."); return; }
    if (form.items.some(it => !it.finishedProductId || !it.quantity || !it.unitPrice)) {
      setErr("All item fields are required."); return;
    }
    setSaving(true);
    try {
      await gql(`mutation CQ($buyerId:ID!,$warehouseId:ID!,$items:[QuotationItemInput!]!,$discount:Float,$notes:String,$validityDate:Date){
        createQuotation(buyerId:$buyerId,warehouseId:$warehouseId,items:$items,discount:$discount,notes:$notes,validityDate:$validityDate){
          quotation { id quotationNumber }
        }
      }`, {
        buyerId: form.buyerId,
        warehouseId: form.warehouseId,
        discount: parseFloat(form.discount) || 0,
        notes: form.notes,
        validityDate: form.validityDate || null,
        items: form.items.map(it => ({
          finishedProductId: it.finishedProductId,
          quantity: parseInt(it.quantity),
          unitPrice: parseFloat(it.unitPrice),
        })),
      });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create quotation.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(qt: Quotation, status: string) {
    setStatusUpdating(true);
    try {
      await gql(`mutation UQS($id:ID!,$status:String!){updateQuotationStatus(id:$id,status:$status){quotation{id}}}`,
        { id: qt.id, status });
      onRefresh();
      if (selected?.id === qt.id) setSelected(prev => prev ? { ...prev, status } : null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setStatusUpdating(false);
    }
  }

  async function convertToSO(qt: Quotation, paymentMode: string) {
    setConverting(true);
    try {
      await gql(`mutation CQSO($id:ID!,$paymentMode:String){convertQuotationToSo(id:$id,paymentMode:$paymentMode){salesOrder{id orderNumber}}}`,
        { id: qt.id, paymentMode });
      setConvertMode(null);
      onRefresh();
      alert(`Sales Order created from ${qt.quotationNumber}!`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setConverting(false);
    }
  }

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">Quotations</h2>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "var(--accent)", color: "#fff" }}>
          + New Quotation
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        {["ALL", ...STATUS_OPTIONS].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
            style={{
              background: filter === s ? "var(--accent)" : "transparent",
              color: filter === s ? "#fff" : "var(--text-secondary)",
              borderColor: filter === s ? "var(--accent)" : "var(--border)",
            }}>
            {s === "ALL" ? "All" : (QUOTATION_STATUS_LABELS[s] ?? s)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                {["#", "Buyer", "Warehouse", "Items", "Total", "Valid Till", "Status", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--text-secondary)" }}>No quotations</td></tr>
              ) : visible.map(q => (
                <tr key={q.id} className="hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
                  style={{ borderBottom: "1px solid var(--border)" }}
                  onClick={() => setSelected(q)}>
                  <td className="px-4 py-3 font-mono text-xs font-medium">{q.quotationNumber}</td>
                  <td className="px-4 py-3">{q.buyer.name}</td>
                  <td className="px-4 py-3">{q.warehouse.name}</td>
                  <td className="px-4 py-3">{q.items.length}</td>
                  <td className="px-4 py-3 font-medium">{fmt(q.totalAmount)}</td>
                  <td className="px-4 py-3 text-xs">{q.validityDate ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ background: STATUS_BADGE_COLORS[q.status] ?? "#555" }}>
                      {QUOTATION_STATUS_LABELS[q.status] ?? q.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {q.convertedTo && (
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>→ {q.convertedTo.orderNumber}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="ml-auto w-full max-w-xl h-full overflow-y-auto p-6 space-y-5"
            style={{ background: "var(--surface)" }}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">{selected.quotationNumber}</h3>
                <span className="px-2 py-0.5 rounded text-xs font-medium text-white ml-1"
                  style={{ background: STATUS_BADGE_COLORS[selected.status] ?? "#555" }}>
                  {QUOTATION_STATUS_LABELS[selected.status] ?? selected.status}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="text-2xl leading-none" style={{ color: "var(--text-secondary)" }}>×</button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span style={{ color: "var(--text-secondary)" }}>Buyer</span><div className="font-medium">{selected.buyer.name}</div></div>
              <div><span style={{ color: "var(--text-secondary)" }}>Warehouse</span><div className="font-medium">{selected.warehouse.name}</div></div>
              <div><span style={{ color: "var(--text-secondary)" }}>Created</span><div className="font-medium">{new Date(selected.createdAt).toLocaleDateString("en-IN")}</div></div>
              <div><span style={{ color: "var(--text-secondary)" }}>Valid Till</span><div className="font-medium">{selected.validityDate ?? "—"}</div></div>
              {selected.createdBy && <div><span style={{ color: "var(--text-secondary)" }}>Created By</span><div className="font-medium">{selected.createdBy.username}</div></div>}
              {selected.convertedTo && <div><span style={{ color: "var(--text-secondary)" }}>Sales Order</span><div className="font-medium">{selected.convertedTo.orderNumber}</div></div>}
            </div>

            {/* Items */}
            <div>
              <h4 className="font-semibold mb-2 text-sm">Items</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Product", "Qty", "Unit Price", "Total"].map(h => (
                        <th key={h} className="pb-2 text-left font-medium" style={{ color: "var(--text-secondary)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map(it => (
                      <tr key={it.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="py-2">{it.finishedProduct.sku} — {it.finishedProduct.itemType.name}</td>
                        <td className="py-2">{it.quantity}</td>
                        <td className="py-2">{fmt(it.unitPrice)}</td>
                        <td className="py-2 font-medium">{fmt(it.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="text-sm space-y-1 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <div className="flex justify-between"><span style={{ color: "var(--text-secondary)" }}>Subtotal</span><span>{fmt(selected.subtotal)}</span></div>
              {selected.discount > 0 && <div className="flex justify-between"><span style={{ color: "var(--text-secondary)" }}>Discount</span><span style={{ color: "#e53935" }}>−{fmt(selected.discount)}</span></div>}
              {selected.taxAmount > 0 && <div className="flex justify-between"><span style={{ color: "var(--text-secondary)" }}>Tax (GST)</span><span>{fmt(selected.taxAmount)}</span></div>}
              <div className="flex justify-between font-bold text-base pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                <span>Total</span><span>{fmt(selected.totalAmount)}</span>
              </div>
            </div>

            {selected.notes && (
              <div className="text-sm p-3 rounded" style={{ background: "var(--surface-2)" }}>
                <span style={{ color: "var(--text-secondary)" }}>Notes: </span>{selected.notes}
              </div>
            )}

            {/* Actions */}
            {!selected.convertedTo && (
              <div className="space-y-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                {/* Status transitions */}
                <div className="flex gap-2 flex-wrap">
                  {selected.status === "DRAFT" && (
                    <button disabled={statusUpdating}
                      onClick={() => updateStatus(selected, "SENT")}
                      className="px-3 py-1.5 rounded text-sm font-medium text-white"
                      style={{ background: "#2196f3" }}>
                      Mark Sent
                    </button>
                  )}
                  {(selected.status === "DRAFT" || selected.status === "SENT") && (
                    <>
                      <button disabled={statusUpdating}
                        onClick={() => updateStatus(selected, "ACCEPTED")}
                        className="px-3 py-1.5 rounded text-sm font-medium text-white"
                        style={{ background: "#4caf50" }}>
                        Accept
                      </button>
                      <button disabled={statusUpdating}
                        onClick={() => updateStatus(selected, "REJECTED")}
                        className="px-3 py-1.5 rounded text-sm font-medium text-white"
                        style={{ background: "#f44336" }}>
                        Reject
                      </button>
                      <button disabled={statusUpdating}
                        onClick={() => updateStatus(selected, "EXPIRED")}
                        className="px-3 py-1.5 rounded text-sm font-medium"
                        style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>
                        Mark Expired
                      </button>
                    </>
                  )}
                </div>

                {/* Convert to SO */}
                {selected.status === "ACCEPTED" && (
                  <div>
                    <p className="text-xs mb-2 font-semibold" style={{ color: "var(--text-secondary)" }}>CONVERT TO SALES ORDER</p>
                    {convertMode === null ? (
                      <div className="flex gap-2">
                        <button onClick={() => setConvertMode("CREDIT")}
                          className="px-3 py-1.5 rounded text-sm font-medium text-white"
                          style={{ background: "var(--accent)" }}>
                          On Credit
                        </button>
                        <button onClick={() => setConvertMode("PAID")}
                          className="px-3 py-1.5 rounded text-sm font-medium text-white"
                          style={{ background: "#4caf50" }}>
                          Mark as Paid
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 items-center">
                        <span className="text-sm">Confirm convert as <strong>{convertMode}</strong>?</span>
                        <button disabled={converting}
                          onClick={() => convertToSO(selected, convertMode)}
                          className="px-3 py-1.5 rounded text-sm font-medium text-white"
                          style={{ background: "var(--accent)" }}>
                          {converting ? "…" : "Confirm"}
                        </button>
                        <button onClick={() => setConvertMode(null)}
                          className="px-3 py-1.5 rounded text-sm"
                          style={{ color: "var(--text-secondary)" }}>Cancel</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl p-6 space-y-4"
            style={{ background: "var(--surface)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">New Quotation</h3>
              <button onClick={() => setShowCreate(false)} className="text-2xl" style={{ color: "var(--text-secondary)" }}>×</button>
            </div>

            {err && <div className="p-3 rounded text-sm" style={{ background: "#fce4ec", color: "#c62828" }}>{err}</div>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Buyer *</label>
                <select value={form.buyerId} onChange={e => setForm(f => ({ ...f, buyerId: e.target.value }))}
                  className="input w-full">
                  <option value="">Select buyer</option>
                  {buyers.filter(b => b.active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Warehouse *</label>
                <select value={form.warehouseId} onChange={e => setForm(f => ({ ...f, warehouseId: e.target.value }))}
                  className="input w-full">
                  <option value="">Select warehouse</option>
                  {warehouses.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Validity Date</label>
                <input type="date" value={form.validityDate} onChange={e => setForm(f => ({ ...f, validityDate: e.target.value }))}
                  className="input w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Discount (₹)</label>
                <input type="number" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))}
                  className="input w-full" min="0" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="input w-full" rows={2} />
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold">Items</h4>
                <button onClick={addItem} className="text-xs px-2 py-1 rounded" style={{ background: "var(--surface-2)" }}>+ Add Item</button>
              </div>
              {form.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 mb-2">
                  <select value={item.finishedProductId}
                    onChange={e => setItemField(idx, "finishedProductId", e.target.value)}
                    className="input text-xs">
                    <option value="">Select product</option>
                    {finishedProducts.filter(p => p.quantity > 0).map(p => (
                      <option key={p.id} value={p.id}>{p.sku} — {p.itemType.name} ({p.quantity} in stock)</option>
                    ))}
                  </select>
                  <input type="number" placeholder="Qty" value={item.quantity}
                    onChange={e => setItemField(idx, "quantity", e.target.value)}
                    className="input text-xs" min="1" />
                  <input type="number" placeholder="Price" value={item.unitPrice}
                    onChange={e => setItemField(idx, "unitPrice", e.target.value)}
                    className="input text-xs" min="0" />
                  {form.items.length > 1 && (
                    <button onClick={() => removeItem(idx)}
                      className="text-red-500 font-bold text-lg leading-none self-center">×</button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2 justify-end">
              <button onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded text-sm" style={{ color: "var(--text-secondary)" }}>Cancel</button>
              <button onClick={saveQuotation} disabled={saving}
                className="px-4 py-2 rounded text-sm font-medium text-white"
                style={{ background: "var(--accent)" }}>
                {saving ? "Saving…" : "Create Quotation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
