"use client";
import { useState, useEffect } from "react";
import { Camera, Download, Printer, Bluetooth } from "lucide-react";
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
  tagShowPrice?: boolean; tagShowSize?: boolean; tagBrandFontSize?: number; tagLogoSize?: number
  tagLogoData?: string; tagComponentOrder?: string[]; tagHeightMm?: number; tagWidthMm?: number
  companyName?: string
}

const DEFAULT_TAG_ORDER = ["barcode","barcode-text","item-info","size","age-group","price","sku"];

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
  const wMm = ts.tagWidthMm ?? 54;
  const hMm = ts.tagHeightMm ?? 65;
  // Open popup at exact label size (px at 96dpi) so the viewport = the tag = 1 print page
  const pxW = Math.round(wMm * 96 / 25.4);
  const pxH = Math.round(hMm * 96 / 25.4);
  const win = window.open("", "_blank", `width=${pxW},height=${pxH},menubar=no,toolbar=no,scrollbars=no,resizable=no,status=no,location=no`);
  if (!win) return;
  const cap = (s: string | undefined) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  const brandName = ts.tagBrandName || ts.companyName || "Garment Tag";
  const unitPrice = product.quantity > 1 ? Number(product.salePrice) / product.quantity : Number(product.salePrice);
  const mrp = unitPrice.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const tagW = `${wMm}mm`;
  const tagH = `${hMm}mm`;
  const brandPt = ts.tagBrandFontSize ?? 7;
  const logoH = ts.tagLogoSize ?? 30;
  const order = (ts.tagComponentOrder && ts.tagComponentOrder.length) ? ts.tagComponentOrder : DEFAULT_TAG_ORDER;

  const blocks: string[] = [];
  for (const key of order) {
    if (key === "logo" && ts.tagLogoData) {
      blocks.push(`<img src="${ts.tagLogoData}" style="height:${logoH}px;display:block;margin:0 auto;" />`);
    } else if (key === "brand") {
      blocks.push(`<div class="brand" style="font-size:${brandPt}pt">${brandName}</div>`);
      if (ts.tagTagline) blocks.push(`<div class="tagline">${ts.tagTagline}</div>`);
    } else if (key === "barcode" && ts.tagShowBarcode !== false) {
      blocks.push(`<div class="barcode-wrap">${product.barcodeSvg || `<span style="font-family:monospace;font-size:9pt;">${product.barcode}</span>`}</div>`);
    } else if (key === "barcode-text" && ts.tagShowBarcode !== false) {
      blocks.push(`<div class="barcode-text">${product.barcode}</div>`);
    } else if (key === "item-info") {
      const color = ts.tagShowColor !== false ? (product.clothColor?.name || "") : "";
      const label = [cap(product.itemType.name), color ? cap(color) : ""].filter(Boolean).join(" · ");
      if (label) blocks.push(`<div class="name">${cap(product.itemType.name)}</div>${color ? `<div class="desc">${cap(color)}</div>` : ""}`);
    } else if (key === "size" && ts.tagShowSize !== false && product.size) {
      blocks.push(`<div class="desc">Size: ${cap(product.size)}</div>`);
    } else if (key === "age-group" && ts.tagShowAgeGroup !== false && product.ageGroup) {
      blocks.push(`<div class="desc">${cap(product.ageGroup)}</div>`);
    } else if (key === "price" && ts.tagShowPrice !== false) {
      blocks.push(`<div class="mrp-label">MRP : ₹${mrp}/-</div>`);
    } else if (key === "sku" && ts.tagShowSku !== false) {
      blocks.push(`<div class="sku">${product.sku}</div>`);
    } else if (key === "footer" && ts.tagFooterText) {
      blocks.push(`<div class="footer">${ts.tagFooterText}</div>`);
    }
  }

  win.document.write(`<!DOCTYPE html><html><head>
  <meta charset="UTF-8">
  <title>Tag — ${product.sku}</title>
  <style>
    @page { size: ${tagW} ${tagH}; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #fff; overflow: hidden; }
    .tag {
      position: fixed; top: 0; left: 0;
      width: ${tagW}; height: ${tagH};
      overflow: hidden;
      font-family: "Courier New", Courier, monospace;
      color: #000;
      display: flex; flex-direction: column; gap: 2mm;
      padding: 3mm 4mm;
      text-align: center;
    }
    .brand { font-size: ${brandPt}pt; font-weight: 900; color: #000; text-transform: uppercase; letter-spacing: 2px; }
    .tagline { font-size: 6pt; color: #555; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
    .name { font-size: 13pt; font-weight: 900; line-height: 1.15; color: #000; text-transform: uppercase; letter-spacing: 1px; }
    .desc { font-size: 9pt; font-weight: 700; color: #222; text-transform: uppercase; }
    .barcode-wrap { width: 100%; display: flex; justify-content: center; }
    .barcode-wrap svg { width: 100%; height: 22mm; }
    .barcode-text { font-size: 10pt; font-weight: 700; color: #000; letter-spacing: 2px; }
    .mrp-label { font-size: 12pt; font-weight: 900; color: #000; text-align: left; letter-spacing: 1px; }
    .sku { font-size: 8pt; color: #444; font-weight: 700; }
    .footer { font-size: 7pt; color: #555; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
  </style></head><body>
  <div class="tag">
  ${blocks.join("\n")}
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
              <Camera size={14} /> Scan Barcode
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
              <Download size={14} /> Export CSV
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
        <div onClick={() => setSelected(null)} style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--paper)", width: "min(460px, 100vw)", height: "100vh", overflowY: "auto", padding: 28, border: "1px solid var(--border)" }}>
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
                  ["Unit Price", formatMoney(selected.quantity > 1 ? selected.salePrice / selected.quantity : selected.salePrice)],
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
              <Printer size={14} /> Print Tag
            </Button>
            <BluetoothPrintButton
              label="Bluetooth Print"
              size="md"
              getData={() => buildTagEscPos({
                sku: selected.sku,
                itemName: selected.itemType.name,
                size: selected.size,
                ageGroup: selected.ageGroup || undefined,
                salePrice: selected.quantity > 1 ? selected.salePrice / selected.quantity : selected.salePrice,
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
            {!p.tagsPrinted && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#c07020", fontWeight: 600, background: "#fff3e0", borderRadius: 4, padding: "2px 7px" }}>Tag pending</div>
                <button
                  onClick={e => { e.stopPropagation(); printTag(p, systemSettings || {}); markPrinted(p.id); }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px solid #c07020", background: "transparent", color: "#c07020", fontWeight: 600, cursor: "pointer" }}>
                  Print Tag
                </button>
              </div>
            )}
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
