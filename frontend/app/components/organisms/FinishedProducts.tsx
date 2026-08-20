"use client";
import { useState, useEffect } from "react";
import type { FinishedProduct } from "@/app/types";
import { formatMoney, formatDateShort } from "@/app/lib/formatters";
import { downloadCsv } from "@/app/lib/csv";
import BarcodeScanner from "@/app/components/atoms/BarcodeScanner";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Button from "@/app/components/atoms/Button";
import { showToast } from "@/app/lib/toast";
import Badge from "@/app/components/atoms/Badge";
import PageHeader from "@/app/components/molecules/PageHeader";
import FilterBar from "@/app/components/molecules/FilterBar";
import Pagination from "@/app/components/atoms/Pagination";
import BluetoothPrintButton from "@/app/components/molecules/BluetoothPrintButton";
import { buildTagEscPos } from "@/app/lib/useBluetooth";

interface TagSettings {
  tagBrandName?: string; tagTagline?: string; tagShowBarcode?: boolean; tagShowSku?: boolean
  tagShowColor?: boolean; tagShowAgeGroup?: boolean; tagFooterText?: string; tagPrinterWidth?: string
  companyName?: string
}

interface Props {
  products: FinishedProduct[]
  isAdmin: boolean; isSuperAdmin: boolean; isManager: boolean; isStoreKeeper: boolean
  onMutate: (q: string, v: Record<string, unknown>) => Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gql?: (q: string, v?: Record<string, unknown>) => Promise<any>
  systemSettings?: TagSettings
}

const PER_PAGE = 20;

function printTag(product: FinishedProduct, ts: TagSettings = {}) {
  const win = window.open("", "_blank");
  if (!win) return;
  const cap = (s: string | undefined) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  const brandName = ts.tagBrandName || ts.companyName || "Garment Tag";
  const descParts = [
    ts.tagShowColor !== false ? (product.clothColor?.name || undefined) : undefined,
    ts.tagShowAgeGroup !== false ? (product.ageGroup || undefined) : undefined,
    product.size || undefined,
  ].filter((v): v is string => !!v).map(cap);
  const desc = descParts.join(" · ");
  const mrp = Number(product.salePrice).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const tagW = ts.tagPrinterWidth === "80mm" ? "90mm" : "72mm";
  win.document.write(`<!DOCTYPE html><html><head><title>Tag — ${product.sku}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; background: #fff; }
    .page { display: flex; flex-wrap: wrap; gap: 6mm; padding: 6mm; }
    .tag {
      width: ${tagW}; min-height: 48mm;
      border: 1.5px solid #222; border-radius: 3mm;
      padding: 3mm 4mm; display: flex; flex-direction: column; gap: 1.5mm;
      page-break-inside: avoid;
    }
    .brand { font-size: 7pt; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 1px; }
    .tagline { font-size: 6pt; color: #888; margin-top: -1mm; }
    .name { font-size: 13pt; font-weight: 800; line-height: 1.1; color: #111; }
    .desc { font-size: 8pt; color: #444; }
    .barcode-wrap { width: 100%; display: flex; justify-content: center; margin: 1mm 0; }
    .barcode-wrap svg { max-width: 100%; height: 14mm; }
    .barcode-text { font-family: monospace; font-size: 7pt; color: #555; text-align: center; }
    .bottom { display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; padding-top: 1mm; border-top: 1px solid #ddd; }
    .mrp-label { font-size: 7pt; color: #555; font-weight: 600; }
    .mrp { font-size: 18pt; font-weight: 900; color: #111; line-height: 1; }
    .sku { font-size: 7pt; color: #666; font-family: monospace; text-align: right; }
    .footer { font-size: 6pt; color: #999; text-align: center; margin-top: 1.5mm; }
    @media print { body { margin: 0; } @page { margin: 0; } }
  </style></head><body>
  <div class="page">
    <div class="tag">
      <div class="brand">${brandName}</div>
      ${ts.tagTagline ? `<div class="tagline">${ts.tagTagline}</div>` : ""}
      <div class="name">${cap(product.itemType.name)}</div>
      ${desc ? `<div class="desc">${desc}</div>` : ""}
      ${ts.tagShowBarcode !== false ? `<div class="barcode-wrap">
        ${product.barcodeSvg ? product.barcodeSvg : `<span style="font-family:monospace;font-size:9pt;">${product.barcode}</span>`}
      </div>
      <div class="barcode-text">${product.barcode}</div>` : ""}
      <div class="bottom">
        <div>
          <div class="mrp-label">MRP (incl. taxes)</div>
          <div class="mrp">₹${mrp}</div>
        </div>
        ${ts.tagShowSku !== false ? `<div class="sku">
          <div>SKU</div>
          <div>${product.sku}</div>
        </div>` : ""}
      </div>
      ${ts.tagFooterText ? `<div class="footer">${ts.tagFooterText}</div>` : ""}
    </div>
  </div>
  <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`);
  win.document.close();
}

export default function FinishedProducts({ products, isAdmin, isSuperAdmin, isManager, isStoreKeeper, onMutate, gql, systemSettings }: Props) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, sourceFilter]);
  const [selected, setSelected] = useState<FinishedProduct | null>(null);
  const [markingPrinted, setMarkingPrinted] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<{ found: boolean; product?: FinishedProduct } | null>(null);

  const canManage = isSuperAdmin || isAdmin || isManager || isStoreKeeper;
  const filtered = products.filter(p =>
    (p.sku.toLowerCase().includes(search.toLowerCase()) || p.itemType.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search)) &&
    (!sourceFilter || p.source === sourceFilter)
  );
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  async function markPrinted(id: string) {
    setMarkingPrinted(true);
    try {
      await onMutate(
        `mutation M($id:ID!,$p:Boolean!){updateFinishedProduct(id:$id,tagsPrinted:$p){finishedProduct{id tagsPrinted}}}`,
        { id, p: true }
      );
      showToast("Tag printed and marked.", "success");
    } catch { /* silent — don't block the print flow */ }
    finally { setMarkingPrinted(false); }
  }

  async function handleBarcode(code: string) {
    setShowScanner(false);
    const local = products.find(p => p.barcode === code || p.sku === code);
    if (local) { setSelected(local); return; }
    if (gql) {
      const res = await gql(
        `query L($b:String!){productByBarcode(barcode:$b){id sku quantity salePrice costPrice ageGroup size source barcode barcodeSvg tagsPrinted createdAt itemType{id name} clothColor{id name hexCode} clothCategory{id name} warehouse{id name}}}`,
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

      <PageHeader
        title="Finished Goods"
        sub={`${products.length} SKUs`}
        actions={
          <>
            <Button variant="ghost" onClick={() => setShowScanner(true)}>
              📷 Scan Barcode
            </Button>
            <Button variant="secondary" onClick={() => downloadCsv(
              `finished_goods_${new Date().toISOString().slice(0, 10)}.csv`,
              filtered.map(p => ({
                "SKU": p.sku, "Item Type": p.itemType.name, "Age Group": p.ageGroup || "", "Size": p.size || "", "Color": p.clothColor?.name || "",
                "Source": p.source, "Quantity": p.quantity, "Sale Price (₹)": p.salePrice,
                "Cost Price (₹)": p.costPrice, "Warehouse": p.warehouse?.name || "",
                "Barcode": p.barcode, "Created": formatDateShort(p.createdAt),
              }))
            )}>
              ⬇ Export CSV
            </Button>
          </>
        }
      />

      <FilterBar>
        <Input
          placeholder="Search SKU, item type, or barcode…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, width: "auto" }}
        />
        <Select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="">All sources</option>
          <option value="IN_HOUSE">In-house (Stitched)</option>
          <option value="IMPORTED">Imported (Readymade)</option>
        </Select>
      </FilterBar>

      {/* Detail / tag print panel */}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }}>
          <div style={{ background: "var(--paper)", width: "min(460px, 100vw)", height: "100vh", overflowY: "auto", padding: 28, border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{selected.sku}</div>
                <div style={{ color: "var(--muted)", fontSize: 14 }}>{selected.itemType.name}</div>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close" style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--muted)", padding: "4px 8px", borderRadius: 6 }}>×</button>
            </div>
            <div style={{ background: "var(--bg)", borderRadius: 10, padding: 16, marginBottom: 16, fontSize: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  ["Color", selected.clothColor?.name || "—"],
                  ["Age Group", selected.ageGroup || "—"],
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
            <Button
              variant="primary"
              onClick={() => { printTag(selected, systemSettings || {}); markPrinted(selected.id); }}
              disabled={markingPrinted}
              style={{ width: "100%", padding: "11px", background: "var(--accent)", marginBottom: 8 }}
            >
              🖨 Print Tag
            </Button>
            <BluetoothPrintButton
              label="🔵 Bluetooth Print Tag"
              size="md"
              getData={() => buildTagEscPos({
                sku: selected.sku,
                itemName: selected.itemType.name,
                size: selected.size,
                ageGroup: selected.ageGroup || undefined,
                salePrice: selected.salePrice,
                barcode: selected.barcode,
                companyName: systemSettings?.tagBrandName || systemSettings?.companyName || "Sri Warehouse",
                tagline: systemSettings?.tagTagline || undefined,
                showBarcode: systemSettings?.tagShowBarcode !== false,
                showSku: systemSettings?.tagShowSku !== false,
                showColor: systemSettings?.tagShowColor !== false,
                showAgeGroup: systemSettings?.tagShowAgeGroup !== false,
                footerText: systemSettings?.tagFooterText || undefined,
                printerWidth: systemSettings?.tagPrinterWidth,
              })}
            />
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {paged.map(p => (
          <div key={p.id} onClick={() => setSelected(p)} style={{
            background: "var(--paper)", border: "1px solid var(--border)", borderRadius: 12, padding: 16,
            cursor: "pointer", transition: "box-shadow 0.15s, transform 0.1s",
            borderLeft: p.source === "IN_HOUSE" ? "4px solid var(--primary)" : "4px solid var(--accent)",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = ""; (e.currentTarget as HTMLDivElement).style.transform = ""; }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{p.itemType.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{p.sku}</div>
              </div>
              <Badge
                label={p.source === "IN_HOUSE" ? "Stitched" : "Imported"}
                color={p.source === "IN_HOUSE" ? "var(--primary)" : "var(--accent)"}
                bg={p.source === "IN_HOUSE" ? "var(--primary)22" : "var(--accent)22"}
              />
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
              {[p.clothColor?.name, p.ageGroup, p.size].filter(Boolean).join(" · ") || "—"} · {p.warehouse.code}
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
      <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
    </div>
  );
}
