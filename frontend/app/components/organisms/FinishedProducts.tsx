"use client";
import { useState } from "react";
import type { FinishedProduct } from "@/app/types";
import { formatMoney, formatDateShort } from "@/app/lib/formatters";
import { downloadCsv } from "@/app/lib/csv";
import BarcodeScanner from "@/app/components/atoms/BarcodeScanner";

interface Props {
  products: FinishedProduct[]
  isAdmin: boolean; isSuperAdmin: boolean; isManager: boolean; isStoreKeeper: boolean
  onMutate: (q: string, v: Record<string, unknown>) => Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gql?: (q: string, v?: Record<string, unknown>) => Promise<any>
}

function printTag(product: FinishedProduct) {
  const win = window.open("", "_blank");
  if (!win) return;
  const desc = [product.clothColor?.name, product.size].filter(Boolean).join(" · ");
  const mrp = Number(product.salePrice).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  win.document.write(`<!DOCTYPE html><html><head><title>Tag — ${product.sku}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; background: #fff; }
    .page { display: flex; flex-wrap: wrap; gap: 6mm; padding: 6mm; }
    .tag {
      width: 72mm; min-height: 48mm;
      border: 1.5px solid #222; border-radius: 3mm;
      padding: 3mm 4mm; display: flex; flex-direction: column; gap: 1.5mm;
      page-break-inside: avoid;
    }
    .brand { font-size: 7pt; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 1px; }
    .name { font-size: 13pt; font-weight: 800; line-height: 1.1; color: #111; }
    .desc { font-size: 8pt; color: #444; }
    .barcode-wrap { width: 100%; display: flex; justify-content: center; margin: 1mm 0; }
    .barcode-wrap svg { max-width: 100%; height: 14mm; }
    .barcode-text { font-family: monospace; font-size: 7pt; color: #555; text-align: center; }
    .bottom { display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; padding-top: 1mm; border-top: 1px solid #ddd; }
    .mrp-label { font-size: 7pt; color: #555; font-weight: 600; }
    .mrp { font-size: 18pt; font-weight: 900; color: #111; line-height: 1; }
    .sku { font-size: 7pt; color: #666; font-family: monospace; text-align: right; }
    @media print { body { margin: 0; } @page { margin: 0; } }
  </style></head><body>
  <div class="page">
    <div class="tag">
      <div class="brand">Garment Tag</div>
      <div class="name">${product.itemType.name}</div>
      ${desc ? `<div class="desc">${desc}</div>` : ""}
      <div class="barcode-wrap">
        ${product.barcodeSvg ? product.barcodeSvg : `<span style="font-family:monospace;font-size:9pt;">${product.barcode}</span>`}
      </div>
      <div class="barcode-text">${product.barcode}</div>
      <div class="bottom">
        <div>
          <div class="mrp-label">MRP (incl. taxes)</div>
          <div class="mrp">₹${mrp}</div>
        </div>
        <div class="sku">
          <div>SKU</div>
          <div>${product.sku}</div>
        </div>
      </div>
    </div>
  </div>
  <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`);
  win.document.close();
}

export default function FinishedProducts({ products, isAdmin, isSuperAdmin, isManager, isStoreKeeper, onMutate, gql }: Props) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [selected, setSelected] = useState<FinishedProduct | null>(null);
  const [markingPrinted, setMarkingPrinted] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<{ found: boolean; product?: FinishedProduct } | null>(null);

  const canManage = isSuperAdmin || isAdmin || isManager || isStoreKeeper;
  const filtered = products.filter(p =>
    (p.sku.toLowerCase().includes(search.toLowerCase()) || p.itemType.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search)) &&
    (!sourceFilter || p.source === sourceFilter)
  );

  async function markPrinted(id: string) {
    setMarkingPrinted(true);
    try {
      await onMutate(
        `mutation M($id:ID!,$p:Boolean!){createFinishedProducts(id:$id,tagsPrinted:$p){finishedProduct{id}}}`,
        { id, p: true }
      );
    } catch { /* ignore */ }
    finally { setMarkingPrinted(false); }
  }

  async function handleBarcode(code: string) {
    setShowScanner(false);
    // Try local list first (fast path)
    const local = products.find(p => p.barcode === code || p.sku === code);
    if (local) { setSelected(local); return; }
    // Fall back to server lookup
    if (gql) {
      const res = await gql(
        `query L($b:String!){productByBarcode(barcode:$b){id sku quantity salePrice costPrice size source barcode barcodeSvg tagsPrinted createdAt itemType{id name} clothColor{id name hexCode} clothCategory{id name} warehouse{id name}}}`,
        { b: code }
      ).catch(() => null);
      if (res?.productByBarcode) { setSelected(res.productByBarcode); return; }
    }
    setScanResult({ found: false });
    setTimeout(() => setScanResult(null), 3500);
  }

  return (
    <div style={{ padding: 24 }}>
      {showScanner && <BarcodeScanner onDetected={handleBarcode} onClose={() => setShowScanner(false)} />}

      {scanResult && !scanResult.found && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a1a2e", color: "#fff", padding: "14px 24px", borderRadius: 12, zIndex: 100, fontSize: 14, fontWeight: 600, boxShadow: "0 8px 32px #0006" }}>
          No product found for that barcode
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Finished Goods <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 16 }}>({products.length} SKUs)</span></h2>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setShowScanner(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, border: "1px solid var(--primary)", background: "transparent", color: "var(--primary)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            📷 Scan Barcode
          </button>
          <button onClick={() => downloadCsv(`finished_goods_${new Date().toISOString().slice(0,10)}.csv`, filtered.map(p => ({
            "SKU": p.sku, "Item Type": p.itemType.name, "Size": p.size || "", "Color": p.clothColor?.name || "",
            "Source": p.source, "Quantity": p.quantity, "Sale Price (₹)": p.salePrice,
            "Cost Price (₹)": p.costPrice, "Warehouse": p.warehouse?.name || "",
            "Barcode": p.barcode, "Created": formatDateShort(p.createdAt),
          })))}
            style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            ⬇ Export CSV
          </button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input placeholder="Search SKU, item type, or barcode…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)", fontSize: 14 }} />
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)", fontSize: 14 }}>
          <option value="">All sources</option>
          <option value="IN_HOUSE">In-house (Stitched)</option>
          <option value="IMPORTED">Imported (Readymade)</option>
        </select>
      </div>

      {/* Detail / tag print panel */}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }}>
          <div style={{ background: "var(--paper)", width: "min(460px, 100vw)", height: "100vh", overflowY: "auto", padding: 28, border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{selected.sku}</div>
                <div style={{ color: "var(--muted)", fontSize: 14 }}>{selected.itemType.name}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--muted)" }}>×</button>
            </div>
            <div style={{ background: "var(--bg)", borderRadius: 10, padding: 16, marginBottom: 16, fontSize: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  ["Color", selected.clothColor?.name || "—"],
                  ["Size", selected.size || "—"],
                  ["Source", selected.source === "IN_HOUSE" ? "Stitched" : "Imported"],
                  ["Quantity", `${selected.quantity} pcs`],
                  ["Cost Price", formatMoney(selected.costPrice)],
                  ["Sale Price", formatMoney(selected.salePrice)],
                  ["Profit", formatMoney(selected.profitMargin)],
                  ["Warehouse", selected.warehouse.name],
                  ["Tags Printed", selected.tagsPrinted ? "Yes" : "No"],
                  ["Added", formatDateShort(selected.createdAt)],
                ].map(([k, v]) => (
                  <div key={k}><div style={{ fontSize: 11, color: "var(--muted)" }}>{k}</div><div style={{ fontWeight: 600 }}>{v}</div></div>
                ))}
              </div>
            </div>
            {selected.barcodeSvg && (
              <div style={{ background: "#fff", borderRadius: 8, padding: 12, marginBottom: 16 }}
                dangerouslySetInnerHTML={{ __html: selected.barcodeSvg }} />
            )}
            <div style={{ fontFamily: "monospace", fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>{selected.barcode}</div>
            <button onClick={() => { printTag(selected); markPrinted(selected.id); }} disabled={markingPrinted}
              style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
              🖨 Print Tag
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {filtered.map(p => (
          <div key={p.id} onClick={() => setSelected(p)} style={{
            background: "var(--paper)", border: "1px solid var(--border)", borderRadius: 12, padding: 16,
            cursor: "pointer", transition: "box-shadow 0.15s",
            borderLeft: p.source === "IN_HOUSE" ? "4px solid var(--primary)" : "4px solid var(--accent)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{p.itemType.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{p.sku}</div>
              </div>
              <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600,
                background: p.source === "IN_HOUSE" ? "var(--primary)22" : "var(--accent)22",
                color: p.source === "IN_HOUSE" ? "var(--primary)" : "var(--accent)" }}>
                {p.source === "IN_HOUSE" ? "Stitched" : "Imported"}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
              {[p.clothColor?.name, p.size].filter(Boolean).join(" · ") || "—"} · {p.warehouse.code}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>Sale Price</div>
                <div style={{ fontWeight: 700, color: "var(--accent)" }}>{formatMoney(p.salePrice)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>In Stock</div>
                <div style={{ fontWeight: 700 }}>{p.quantity} pcs</div>
              </div>
            </div>
            {!p.tagsPrinted && <div style={{ marginTop: 8, fontSize: 11, color: "#ff9800", fontWeight: 600 }}>⚠ Tags not printed</div>}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 60, color: "var(--muted)" }}>No finished products found</div>
        )}
      </div>
    </div>
  );
}
