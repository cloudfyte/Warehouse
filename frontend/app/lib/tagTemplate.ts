/**
 * The product tag layout — the single source of truth for both the printed
 * tag (FinishedProducts) and the live preview in Settings.
 *
 * These two used to carry separate copies of the layout and drifted apart,
 * which is how the preview and the printout ended up disagreeing about
 * component order. Anything about how a tag looks belongs here.
 */

export interface TagSettings {
  tagBrandName?: string; tagTagline?: string; tagShowBarcode?: boolean; tagShowSku?: boolean
  tagShowColor?: boolean; tagShowAgeGroup?: boolean; tagFooterText?: string; tagPrinterWidth?: string
  tagShowPrice?: boolean; tagShowSize?: boolean; tagBrandFontSize?: number; tagLogoSize?: number
  tagLogoData?: string; tagComponentOrder?: string[]; tagHeightMm?: number; tagWidthMm?: number
  companyName?: string
  tagAlign?: string; tagVerticalAlign?: string
  tagPadTop?: number; tagPadRight?: number; tagPadBottom?: number; tagPadLeft?: number
  tagGapMm?: number; tagBarcodeHeightMm?: number
  tagBarcodeTextFontSize?: number; tagNameFontSize?: number
  tagDescFontSize?: number; tagPriceFontSize?: number; tagSkuFontSize?: number
}

/** The minimum a tag needs to identify a product. */
export interface TagProduct {
  sku: string
  barcode: string
  barcodeSvg?: string
  size?: string
  ageGroup?: string
  quantity: number
  salePrice: number | string
  itemType?: { name: string } | null
  clothColor?: { name: string } | null
}

// Age group and the FP number came off the tag: nobody on the shop floor reads
// "MEN" off a garment they can see, and the FP number is what the barcode is
// for. Brand takes the line the FP number used to have. All of it is still
// available in Settings for anyone who wants it back.
export const DEFAULT_TAG_ORDER = [
  "brand", "barcode", "barcode-text", "item-info", "size", "price",
];

/** Every component that can appear on a tag, in the order Settings lists them. */
export const TAG_COMPONENTS: { key: string; label: string }[] = [
  { key: "logo", label: "Logo" },
  { key: "brand", label: "Brand name" },
  { key: "barcode", label: "Barcode" },
  { key: "barcode-text", label: "Barcode number" },
  { key: "item-info", label: "Item name & colour" },
  { key: "size", label: "Size" },
  { key: "age-group", label: "Age group" },
  { key: "price", label: "MRP" },
  { key: "sku", label: "SKU" },
  { key: "footer", label: "Footer text" },
];

/**
 * A Django JSONField can arrive as a JSON string ("[]") rather than an array.
 * Iterating a string yields characters, which silently produces an empty tag.
 */
export function normaliseOrder(raw: unknown): string[] {
  let v = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  return Array.isArray(v) && v.length ? (v as string[]) : DEFAULT_TAG_ORDER;
}

const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

/** "pista green" -> "Pista Green". A colour is a name, so every word is capitalised. */
const titleCase = (s?: string) =>
  (s || "").split(/\s+/).filter(Boolean).map(cap).join(" ");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The price to print on one garment's tag.
 *
 * This used to divide by quantity, on the belief that salePrice held a batch
 * total. It does not — the move-to-finished-goods form asks for "sale price
 * per piece" and the service stores that number untouched. So the division was
 * printing a fraction of the real price onto physical tags: a Rs.1,200 shirt
 * in a batch of 50 came out as Rs.24.
 */
export function unitPrice(p: TagProduct): number {
  return Number(p.salePrice);
}

/**
 * python-barcode emits a standalone SVG document with no viewBox, a white
 * background rect and its own <text> label. Strip the wrapper, the white rect
 * and the label (the number is rendered as its own row), so it embeds and
 * crops cleanly. Do not scale it — with no viewBox its mm coords are absolute.
 */
export function cleanBarcodeSvg(svg?: string): string {
  return (svg || "")
    .replace(/<\?xml[^?]*\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/g, "")
    .replace(/<rect[^>]*fill:white[^>]*\/>/g, "")
    .replace(/<text[\s\S]*?<\/text>/g, "")
    .trim();
}

const JUSTIFY: Record<string, string> = { top: "flex-start", center: "center", bottom: "flex-end" };
const ALIGN_ITEMS: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };
// The barcode wrapper spans the full column, so the SVG needs its own margin to
// follow the alignment — text-align does not move a block-level <svg>.
const SVG_MARGIN: Record<string, string> = { left: "0", center: "0 auto", right: "0 0 0 auto" };

/** The tag's CSS, driven entirely by settings. */
export function tagCss(ts: TagSettings): string {
  const align = (ts.tagAlign || "left").toLowerCase();
  const vAlign = (ts.tagVerticalAlign || "center").toLowerCase();
  const brandPt = ts.tagBrandFontSize ?? 7;
  return `
    .tag {
      height: 100%;
      padding: ${ts.tagPadTop ?? 3}mm ${ts.tagPadRight ?? 1.5}mm ${ts.tagPadBottom ?? 3}mm ${ts.tagPadLeft ?? 13}mm;
      display: flex; flex-direction: column;
      justify-content: ${JUSTIFY[vAlign] ?? "center"};
      align-items: ${ALIGN_ITEMS[align] ?? "flex-start"};
      gap: ${ts.tagGapMm ?? 1.2}mm;
      text-align: ${align};
      font-family: "Courier New", Courier, monospace; color: #000;
    }
    .tag > * { max-width: 100%; }
    .brand { font-size: ${brandPt}pt; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; }
    .tagline { font-size: 6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
    .barcode-wrap { width: 100%; overflow: hidden; }
    .barcode-wrap svg { height: ${ts.tagBarcodeHeightMm ?? 18}mm; display: block; margin: ${SVG_MARGIN[align] ?? "0"}; }
    .barcode-text { font-size: ${ts.tagBarcodeTextFontSize ?? 8.5}pt; font-weight: 700; letter-spacing: 1.5px; }
    .name { font-size: ${ts.tagNameFontSize ?? 12}pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; line-height: 1.15; }
    .desc { font-size: ${ts.tagDescFontSize ?? 8}pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .mrp { font-size: ${ts.tagPriceFontSize ?? 12}pt; font-weight: 900; margin-top: 0.8mm; white-space: nowrap; }
    .sku { font-size: ${ts.tagSkuFontSize ?? 6.5}pt; font-weight: 700; letter-spacing: 0.5px; }
    .footer { font-size: 6pt; font-weight: 700; text-transform: uppercase; }`;
}

/** The rows of the tag, in the configured order. */
export function tagInnerHtml(product: TagProduct, ts: TagSettings): string {
  const order = normaliseOrder(ts.tagComponentOrder);
  const barcodeSvg = cleanBarcodeSvg(product.barcodeSvg);
  const mrp = unitPrice(product).toLocaleString("en-IN", {
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  });
  const blocks: string[] = [];

  for (const key of order) {
    if (key === "logo" && ts.tagLogoData) {
      blocks.push(`<img src="${esc(ts.tagLogoData)}" style="height:${ts.tagLogoSize ?? 30}px;display:block;" />`);
    } else if (key === "brand" && ts.tagBrandName) {
      // Deliberately not falling back to companyName: that is the registered
      // legal name ("... Garment Business") and it does not fit a 54mm tag.
      // The brand row appears once someone sets a short brand name.
      blocks.push(`<div class="brand">${esc(ts.tagBrandName)}</div>`);
      if (ts.tagTagline) blocks.push(`<div class="tagline">${esc(ts.tagTagline)}</div>`);
    } else if (key === "barcode" && ts.tagShowBarcode !== false) {
      // With no SVG this row can only repeat the number the barcode-text row
      // prints, so fall back to text only when that row is absent.
      if (barcodeSvg) blocks.push(`<div class="barcode-wrap">${barcodeSvg}</div>`);
      else if (!order.includes("barcode-text")) blocks.push(`<div class="barcode-text">${esc(product.barcode)}</div>`);
    } else if (key === "barcode-text" && ts.tagShowBarcode !== false) {
      blocks.push(`<div class="barcode-text">${esc(product.barcode)}</div>`);
    } else if (key === "item-info" && product.itemType?.name) {
      const colour = ts.tagShowColor !== false ? (product.clothColor?.name || "") : "";
      blocks.push(
        `<div class="name">${esc(cap(product.itemType.name))}</div>` +
        (colour ? `<div class="desc">Color: ${esc(titleCase(colour))}</div>` : "")
      );
    } else if (key === "size" && ts.tagShowSize !== false && product.size) {
      blocks.push(`<div class="desc">Size: ${esc(cap(product.size))}</div>`);
    } else if (key === "age-group" && ts.tagShowAgeGroup !== false && product.ageGroup) {
      blocks.push(`<div class="desc">${esc(cap(product.ageGroup))}</div>`);
    } else if (key === "price" && ts.tagShowPrice !== false) {
      blocks.push(`<div class="mrp">MRP &#8377;${mrp}/-</div>`);
    } else if (key === "sku" && ts.tagShowSku !== false) {
      blocks.push(`<div class="sku">${esc(product.sku)}</div>`);
    } else if (key === "footer" && ts.tagFooterText) {
      blocks.push(`<div class="footer">${esc(ts.tagFooterText)}</div>`);
    }
  }

  // Never print an empty tag.
  if (!blocks.length) {
    blocks.push(`<div class="barcode-text">${esc(product.barcode)}</div>`);
    blocks.push(`<div class="sku">${esc(product.sku)}</div>`);
  }
  return `<div class="tag">${blocks.join("\n")}</div>`;
}

/** The complete tag document, sized to the label. */
function renderDocument(product: TagProduct, ts: TagSettings, autoPrint: boolean): string {
  const w = ts.tagWidthMm ?? 54;
  const h = ts.tagHeightMm ?? 65;
  // afterprint must be registered BEFORE print(): print() blocks until the
  // dialog is dismissed, so registering the handler after it returns means the
  // event has already fired and the tab is left open on the user's screen. The
  // timeout is a fallback for browsers that do not fire afterprint at all.
  const script = autoPrint
    ? `<script>
         window.onafterprint = function () { window.close(); };
         window.onload = function () {
           window.print();
           setTimeout(function () { window.close(); }, 500);
         };
       <\/script>`
    : "";
  return `<!DOCTYPE html><html><head>
  <meta charset="UTF-8"><title>Tag</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${w}mm; height: ${h}mm; overflow: hidden; }
    body { background: #fff; color: #000; }
    ${tagCss(ts)}
    @page { size: ${w}mm ${h}mm; margin: 0; }
  </style></head><body>
  ${tagInnerHtml(product, ts)}
  ${script}
  </body></html>`;
}

/**
 * Many tags in one print job — the barcode generator's output.
 *
 * Each tag is its own physical label on the roll, so each gets its own page at
 * the tag's own size. Rendering goes through the same tagInnerHtml and tagCss
 * as the single-tag print, so a sheet can never drift from what a one-off tag
 * looks like.
 */
export function tagSheetDocument(
  entries: { product: TagProduct; copies: number }[],
  ts: TagSettings,
): string {
  const w = ts.tagWidthMm ?? 54;
  const h = ts.tagHeightMm ?? 65;

  const pages = entries.flatMap(({ product, copies }) =>
    Array.from({ length: Math.max(0, Math.floor(copies)) },
      () => `<div class="sheet-page">${tagInnerHtml(product, ts)}</div>`)
  );

  return `<!DOCTYPE html><html><head>
  <meta charset="UTF-8"><title>Tags</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #fff; color: #000; }
    .sheet-page { width: ${w}mm; height: ${h}mm; overflow: hidden; page-break-after: always; }
    .sheet-page:last-child { page-break-after: auto; }
    ${tagCss(ts)}
    @page { size: ${w}mm ${h}mm; margin: 0; }
  </style></head><body>
  ${pages.join("\n")}
  <script>
    window.onafterprint = function () { window.close(); };
    window.onload = function () {
      window.print();
      setTimeout(function () { window.close(); }, 500);
    };
  <\/script>
  </body></html>`;
}

/** The print document — opens the print dialog on load. */
export function tagDocument(product: TagProduct, ts: TagSettings): string {
  return renderDocument(product, ts, true);
}

/** The same document without auto-print, for the Settings preview iframe. */
export function tagPreviewDocument(product: TagProduct, ts: TagSettings): string {
  return renderDocument(product, ts, false);
}

/**
 * A stand-in barcode for the preview, built the same way python-barcode does:
 * absolute mm coordinates, no viewBox, 33mm wide. Using the same shape means
 * the preview crops and positions it exactly as the real one will.
 */
function sampleBarcodeSvg(code: string): string {
  // Code128 spends about 11 modules per character plus start, checksum and a
  // wider stop pattern, so width scales with the length of the code. The old
  // sample was fixed at 33mm — the width of a 15-character GRM number — which
  // made the preview show a barcode almost twice as wide as the short codes
  // now printed, and every layout tuned against it came out wrong.
  const widthMm = 2 * QUIET_ZONE_MM + MODULE_MM * 11 * (code.length + 3);
  const bars: string[] = [];
  let x = QUIET_ZONE_MM;
  // Deterministic widths, so the preview does not flicker between renders.
  const widths = [0.4, 0.2, 0.6, 0.2, 0.4, 0.8, 0.2, 0.6, 0.4, 0.2];
  for (let i = 0; x < widthMm - QUIET_ZONE_MM; i++) {
    const w = widths[i % widths.length];
    bars.push(`<rect x="${x.toFixed(3)}mm" y="1.000mm" width="${w.toFixed(3)}mm" height="15.000mm" style="fill:black;"/>`);
    x += w + (i % 3 === 0 ? 0.6 : 0.4);
  }
  return `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="${widthMm.toFixed(3)}mm" height="23.411mm">`
    + `<g>${bars.join("")}</g></svg>`;
}

const MODULE_MM = 0.2;      // python-barcode's default module width
const QUIET_ZONE_MM = 2;

/** A representative product, so the preview shows realistic proportions. */
export const SAMPLE_TAG_PRODUCT: TagProduct = {
  sku: "FP-202608-0008",
  // Same shape a real product now carries: random digits, the price, random
  // digits. A sample from the old GRM scheme was twice as long, so the preview
  // was tuned against a barcode the printer will never produce.
  barcode: "2042499123",
  size: "38",
  ageGroup: "Adult",
  quantity: 1,
  salePrice: 2499,
  itemType: { name: "Indowestern" },
  clothColor: { name: "Pista Green" },
  barcodeSvg: sampleBarcodeSvg("2042499123"),
};
