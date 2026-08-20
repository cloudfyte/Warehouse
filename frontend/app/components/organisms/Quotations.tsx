"use client";
import React, { useState, useEffect } from "react";
import { Quotation, Buyer, WarehouseLocation, FinishedProduct, SystemSettings } from "@/app/types";
import { QUOTATION_STATUS_LABELS, STATUS_BADGE_COLORS } from "@/app/lib/constants";
import { showToast } from "@/app/lib/toast";
import Button from "@/app/components/atoms/Button";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Textarea from "@/app/components/atoms/Textarea";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import PageHeader from "@/app/components/molecules/PageHeader";
import Field from "@/app/components/molecules/Field";
import FormGrid from "@/app/components/molecules/FormGrid";
import FilterBar from "@/app/components/molecules/FilterBar";
import Pagination from "@/app/components/atoms/Pagination";

interface Props {
  quotations: Quotation[];
  buyers: Buyer[];
  warehouses: WarehouseLocation[];
  finishedProducts: FinishedProduct[];
  systemSettings?: SystemSettings;
  gql: <T>(q: string, v?: Record<string, unknown>) => Promise<T>;
  onRefresh: () => void;
}

const PER_PAGE = 20;

const STATUS_OPTIONS = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"];

const EMPTY_FORM = {
  buyerId: "", warehouseId: "", discount: "0", notes: "", validityDate: "",
  items: [{ finishedProductId: "", quantity: "1", unitPrice: "" }],
};

export default function Quotations({ quotations, buyers, warehouses, finishedProducts, systemSettings, gql, onRefresh }: Props) {
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState<Quotation | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertMode, setConvertMode] = useState<"CREDIT" | "PAID" | null>(null);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filter]);

  const visible = filter === "ALL" ? quotations : quotations.filter(q => q.status === filter);
  const paged = visible.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function printQuotation(qt: Quotation) {
    const ss = systemSettings;
    const curr = ss?.currencySymbol || "₹";
    const fmt = (n: number) => `${curr}${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    const companyName = ss?.companyName || ss?.appName || "Warehouse ERP";
    const addr = (ss?.printCompanyAddress || "").replace(/\n/g, "<br>");
    const logoUrl = ss?.printShowLogo !== false && ss?.logoUrl ? ss.logoUrl : "";
    const sigLabel = ss?.printSignatureLabel || "Authorised Signatory";
    const bankDetails = (ss?.printBankDetails || "").replace(/\n/g, "<br>");
    const terms = (ss?.printTerms || "").split("\n").filter(Boolean);

    const rows = qt.items.map(it => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee">${it.finishedProduct.itemType?.name ?? "—"} (${it.finishedProduct.size})</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center">${it.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right">${fmt(it.unitPrice)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right">${fmt(it.totalPrice)}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${qt.quotationNumber}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;color:#111;padding:40px;max-width:780px;margin:auto}
      @media print{body{padding:20px}.no-print{display:none}}
    </style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;border-bottom:2px solid #111;padding-bottom:24px">
      <div style="display:flex;align-items:center;gap:14px">
        ${logoUrl ? `<img src="${logoUrl}" style="height:52px;object-fit:contain" onerror="this.style.display='none'" />` : ""}
        <div>
          <div style="font-size:20px;font-weight:800">${companyName}</div>
          ${addr ? `<div style="font-size:11px;color:#555;margin-top:4px;line-height:1.5">${addr}</div>` : ""}
        </div>
      </div>
      <div style="text-align:right">
        <h1 style="font-size:26px;font-weight:800;letter-spacing:1px">QUOTATION</h1>
        <div style="color:#666;font-size:13px;margin-top:4px">${qt.quotationNumber}</div>
        <div style="font-size:12px;color:#555;margin-top:6px">Date: ${new Date(qt.createdAt).toLocaleDateString("en-IN")}</div>
        ${qt.validityDate ? `<div style="font-size:12px;color:#555">Valid till: ${qt.validityDate}</div>` : ""}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px">
      <div style="background:#f8f8f8;border-radius:8px;padding:16px 20px">
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Bill To</div>
        <div style="font-size:17px;font-weight:700">${qt.buyer.name}</div>
        ${qt.buyer.phone ? `<div style="font-size:13px;color:#555;margin-top:3px">${qt.buyer.phone}</div>` : ""}
        ${qt.buyer.address ? `<div style="font-size:12px;color:#666;margin-top:3px">${qt.buyer.address}</div>` : ""}
        ${qt.buyer.gstin ? `<div style="font-size:12px;color:#777;margin-top:3px">GSTIN: ${qt.buyer.gstin}</div>` : ""}
      </div>
      <div style="background:#f8f8f8;border-radius:8px;padding:16px 20px">
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Warehouse</div>
        <div style="font-size:16px;font-weight:700">${qt.warehouse.name}</div>
        <div style="font-size:12px;color:#666;margin-top:3px">${qt.warehouse.code}</div>
        ${qt.createdBy ? `<div style="font-size:12px;color:#777;margin-top:6px">Prepared by: ${qt.createdBy.username}</div>` : ""}
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <thead><tr style="background:#111;color:#fff">
        <th style="padding:11px 12px;text-align:left;font-size:12px">Item</th>
        <th style="padding:11px 12px;text-align:center;font-size:12px">Qty</th>
        <th style="padding:11px 12px;text-align:right;font-size:12px">Unit Price</th>
        <th style="padding:11px 12px;text-align:right;font-size:12px">Total</th>
      </tr></thead><tbody>${rows}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-bottom:32px">
      <div style="width:280px;font-size:14px">
        <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eee"><span style="color:#666">Subtotal</span><span>${fmt(qt.subtotal)}</span></div>
        ${qt.discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eee"><span style="color:#666">Discount</span><span style="color:#e53935">−${fmt(qt.discount)}</span></div>` : ""}
        ${qt.taxAmount > 0 ? `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eee"><span style="color:#666">GST</span><span>${fmt(qt.taxAmount)}</span></div>` : ""}
        <div style="display:flex;justify-content:space-between;padding:10px 0;font-size:18px;font-weight:800;border-top:2px solid #111"><span>Total</span><span>${fmt(qt.totalAmount)}</span></div>
      </div>
    </div>
    ${qt.notes ? `<div style="margin-bottom:24px;padding:14px;background:#fffde7;border-radius:8px;font-size:13px;color:#555"><strong>Notes:</strong> ${qt.notes}</div>` : ""}
    ${terms.length > 0 ? `
    <div style="margin-bottom:32px">
      <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Terms & Conditions</div>
      <ol style="padding-left:18px;font-size:12px;color:#666;line-height:1.8">${terms.map(t => `<li>${t.replace(/^\d+\.\s*/, "")}</li>`).join("")}</ol>
    </div>` : ""}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px;padding-top:20px;border-top:1px solid #eee">
      ${bankDetails ? `<div>
        <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Bank Details</div>
        <div style="font-size:12px;color:#555;line-height:1.8">${bankDetails}</div>
      </div>` : "<div></div>"}
      <div style="text-align:right">
        <div style="margin-top:60px;border-top:1px solid #333;padding-top:8px;font-size:12px;color:#555">${sigLabel}</div>
      </div>
    </div>
    <div style="margin-top:32px;font-size:10px;color:#bbb;text-align:center">This is a computer-generated quotation. Thank you for your business.</div>
    <script>window.onload=()=>{window.print()}</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

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
      showToast(e instanceof Error ? e.message : "Update failed.", "error");
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
      setSelected(null);
      onRefresh();
      showToast(`Sales Order created from ${qt.quotationNumber}!`, "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Conversion failed.", "error");
    } finally {
      setConverting(false);
    }
  }

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Quotations"
        actions={<Button variant="primary" onClick={() => setShowCreate(true)}>+ New Quotation</Button>}
      />

      {/* Filter chips */}
      <FilterBar>
        {["ALL", ...STATUS_OPTIONS].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
            style={{
              background: filter === s ? "var(--primary)" : "transparent",
              color: filter === s ? "#fff" : "var(--text-secondary)",
              borderColor: filter === s ? "var(--primary)" : "var(--border)",
            }}>
            {s === "ALL" ? "All" : (QUOTATION_STATUS_LABELS[s] ?? s)}
          </button>
        ))}
      </FilterBar>

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
                <tr>
                  <td colSpan={8}>
                    <div style={{ textAlign: "center", padding: "60px 24px" }}>
                      <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.3 }}>📄</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                        {filter === "ALL" ? "No quotations yet" : `No ${filter.toLowerCase()} quotations`}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>
                        {filter === "ALL" ? "Click + New Quotation to create your first price proposal" : "Try selecting a different status tab"}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : paged.map(q => (
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
      <Pagination page={page} total={visible.length} perPage={PER_PAGE} onChange={setPage} />

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
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => printQuotation(selected)} title="Print / Save as PDF">
                  🖨 Print
                </Button>
                <button onClick={() => { setSelected(null); setConvertMode(null); }} className="text-2xl leading-none" style={{ color: "var(--text-secondary)" }}>×</button>
              </div>
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
                        <td className="py-2">{it.finishedProduct.sku} — {it.finishedProduct.itemType?.name ?? "—"}</td>
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
                    <Button size="sm" disabled={statusUpdating} onClick={() => updateStatus(selected, "SENT")} style={{ background: "#2196f3" }}>
                      Mark Sent
                    </Button>
                  )}
                  {(selected.status === "DRAFT" || selected.status === "SENT") && (
                    <>
                      <Button size="sm" disabled={statusUpdating} onClick={() => updateStatus(selected, "ACCEPTED")} style={{ background: "#4caf50" }}>
                        Accept
                      </Button>
                      <Button variant="danger" size="sm" disabled={statusUpdating} onClick={() => updateStatus(selected, "REJECTED")}>
                        Reject
                      </Button>
                      <Button variant="secondary" size="sm" disabled={statusUpdating} onClick={() => updateStatus(selected, "EXPIRED")}>
                        Mark Expired
                      </Button>
                    </>
                  )}
                </div>

                {/* Convert to SO */}
                {selected.status === "ACCEPTED" && (
                  <div>
                    <p className="text-xs mb-2 font-semibold" style={{ color: "var(--text-secondary)" }}>CONVERT TO SALES ORDER</p>
                    {convertMode === null ? (
                      <div className="flex gap-2">
                        <Button variant="primary" size="sm" onClick={() => setConvertMode("CREDIT")}>On Credit</Button>
                        <Button size="sm" onClick={() => setConvertMode("PAID")} style={{ background: "#4caf50" }}>Mark as Paid</Button>
                      </div>
                    ) : (
                      <div className="flex gap-2 items-center">
                        <span className="text-sm">Confirm convert as <strong>{convertMode}</strong>?</span>
                        <Button variant="primary" size="sm" disabled={converting} onClick={() => convertToSO(selected, convertMode)}>
                          {converting ? "…" : "Confirm"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConvertMode(null)}>Cancel</Button>
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
              <button onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); setErr(""); }} className="text-2xl" style={{ color: "var(--text-secondary)" }}>×</button>
            </div>

            <ErrorBanner msg={err} />

            <FormGrid cols={2}>
              <Field label="Buyer" required>
                <Select value={form.buyerId} onChange={e => setForm(f => ({ ...f, buyerId: e.target.value }))}>
                  <option value="">Select buyer</option>
                  {buyers.filter(b => b.active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="Warehouse" required>
                <Select value={form.warehouseId} onChange={e => setForm(f => ({ ...f, warehouseId: e.target.value }))}>
                  <option value="">Select warehouse</option>
                  {warehouses.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </Field>
              <Field label="Validity Date">
                <Input type="date" value={form.validityDate} onChange={e => setForm(f => ({ ...f, validityDate: e.target.value }))} />
              </Field>
              <Field label="Discount (₹)">
                <Input type="number" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} min="0" />
              </Field>
            </FormGrid>

            <Field label="Notes">
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </Field>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold">Items</h4>
                <Button variant="secondary" size="sm" onClick={addItem}>+ Add Item</Button>
              </div>
              {form.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 mb-2">
                  <Select value={item.finishedProductId}
                    onChange={e => setItemField(idx, "finishedProductId", e.target.value)}
                    style={{ fontSize: 11 }}>
                    <option value="">Select product</option>
                    {finishedProducts.filter(p => p.quantity > 0).map(p => (
                      <option key={p.id} value={p.id}>{p.sku} — {p.itemType.name} ({p.quantity} in stock)</option>
                    ))}
                  </Select>
                  <Input type="number" placeholder="Qty" value={item.quantity}
                    onChange={e => setItemField(idx, "quantity", e.target.value)}
                    style={{ fontSize: 11 }} min="1" />
                  <Input type="number" placeholder="Price" value={item.unitPrice}
                    onChange={e => setItemField(idx, "unitPrice", e.target.value)}
                    style={{ fontSize: 11 }} min="0" />
                  {form.items.length > 1 && (
                    <button onClick={() => removeItem(idx)}
                      className="text-red-500 font-bold text-lg leading-none self-center">×</button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2 justify-end">
              <Button variant="secondary" onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); setErr(""); }}>Cancel</Button>
              <Button variant="primary" onClick={saveQuotation} disabled={saving}>
                {saving ? "Saving…" : "Create Quotation"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
