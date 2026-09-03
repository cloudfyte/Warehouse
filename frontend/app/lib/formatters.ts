/**
 * Display formatting for money and dates.
 *
 * Money lived in six places — a local `fmt` in Quotations, Ledger and Reports,
 * a `fmtK` in Analytics, inline template strings in the chart tooltips, and
 * this file — and every one of them hardcoded the rupee sign. The symbol is a
 * Settings field, so changing it updated two print templates and nothing else.
 * Everything now goes through formatMoney, which reads the configured symbol.
 */

let currencySymbol = "₹";

/**
 * Point the formatters at the symbol from Settings.
 *
 * Called during render rather than from an effect: formatMoney is read while
 * the tree renders, and an effect would land a paint too late, leaving the
 * previous symbol on screen until something unrelated re-rendered.
 */
export function setCurrencySymbol(symbol?: string | null) {
  currencySymbol = symbol?.trim() || "₹";
}

export function getCurrencySymbol() {
  return currencySymbol;
}

interface MoneyOptions {
  /** Fraction digits; 0 for the whole-rupee figures on dashboards. */
  decimals?: number;
  /** Indian short scale — 1.2Cr, 3.4L, 56K — for axis ticks and tiles. */
  compact?: boolean;
}

export function formatMoney(value: number | string, options: MoneyOptions = {}) {
  const { decimals = 2, compact = false } = options;
  const n = Number(value);
  const amount = Number.isFinite(n) ? n : 0;
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);

  if (compact) {
    if (abs >= 10000000) return `${sign}${currencySymbol}${(abs / 10000000).toFixed(1)}Cr`;
    if (abs >= 100000) return `${sign}${currencySymbol}${(abs / 100000).toFixed(1)}L`;
    if (abs >= 1000) return `${sign}${currencySymbol}${(abs / 1000).toFixed(0)}K`;
    return `${sign}${currencySymbol}${abs.toFixed(0)}`;
  }

  return `${sign}${currencySymbol}${abs.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function _parts(value: string) {
  const d = new Date(value);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  const hh = String(h % 12 || 12);
  const ampm = h >= 12 ? "PM" : "AM";
  return { dd, mm, yyyy, hh, min, ampm };
}

export function formatDate(value: string) {
  const { dd, mm, yyyy, hh, min, ampm } = _parts(value);
  return `${dd}/${mm}/${yyyy}, ${hh}:${min} ${ampm}`;
}

export function formatDateShort(value: string) {
  const { dd, mm, yyyy } = _parts(value);
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * What to call one product.
 *
 * The item type is the classification — "Kurtha" covers every kurtha in the
 * warehouse. A product may need its own name on the tag and in the lists
 * ("Pintex Kurtha Daman") without renaming every kurtha ever bought, which is
 * what editing the item type would do.
 */
export function productName(
  p?: { name?: string | null; itemType?: { name?: string } | null } | null,
): string {
  return (p?.name || "").trim() || p?.itemType?.name || "";
}
