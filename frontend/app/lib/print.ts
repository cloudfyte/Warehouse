import { formatMoney } from "@/app/lib/formatters";
/**
 * Opens a clean print window with the given HTML content.
 * Includes a Print button in the window itself plus auto-triggers print.
 */
export function printDoc(html: string, title: string): void {
  const w = window.open("", "_blank", "width=860,height=920");
  if (!w) {
    // Dynamically import to avoid circular deps — print.ts is a plain util
    import("@/app/lib/toast").then(({ showToast }) => showToast("Pop-up blocked. Allow pop-ups for this site to print.", "warn"));
    return;
  }

  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1a1a1a; background: #fff; padding: 40px 48px; font-size: 13px; line-height: 1.5; }
    h1 { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; }
    h2 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #666; margin: 24px 0 10px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 20px; }
    .header-left { display: flex; flex-direction: column; gap: 3px; }
    .header-right { text-align: right; font-size: 12px; color: #555; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; background: #f9f9f9; border: 1px solid #e8e8e8; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; }
    .meta-item label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #888; display: block; margin-bottom: 2px; }
    .meta-item span { font-size: 13px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead tr { border-bottom: 2px solid #111; }
    th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #666; padding: 8px 10px; text-align: left; }
    td { padding: 9px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
    .amount { text-align: right; font-weight: 600; }
    .totals { margin-left: auto; width: 260px; }
    .totals-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee; font-size: 13px; }
    .totals-row.grand { font-weight: 800; font-size: 15px; border-bottom: 2px solid #111; border-top: 2px solid #111; padding: 8px 0; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; background: #111; color: #fff; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 11px; color: #999; display: flex; justify-content: space-between; }
    .print-btn { display: flex; gap: 10px; margin-bottom: 24px; }
    .print-btn button { padding: 9px 22px; border-radius: 7px; border: none; background: #111; color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; }
    .print-btn .close-btn { background: none; border: 1px solid #ccc; color: #333; }
    @media print {
      .print-btn { display: none !important; }
      body { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="print-btn">
    <button onclick="window.print()">🖨 Print</button>
    <button class="close-btn" onclick="window.close()">Close</button>
  </div>
  ${html}
  <div class="footer">
    <span>GarmentFlow ERP</span>
    <span>Printed: ${new Date().toLocaleString("en-IN")}</span>
  </div>
</body>
</html>`);
  w.document.close();
}

/** Format a number as currency for print. Same symbol as the on-screen figures. */
export function fmtMoney(n: number): string {
  return formatMoney(n ?? 0);
}

/** Format ISO date string as DD MMM YYYY for print. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
