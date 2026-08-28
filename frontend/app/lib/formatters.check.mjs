/**
 * Self-check for the money formatter. There is no test runner in this project
 * and this file is not worth adding one for, so it compiles the module and
 * asserts against it directly, from frontend/:
 *
 *   npx tsc app/lib/formatters.ts --outDir /tmp/fmtout --module esnext \
 *       --target es2020 --moduleResolution bundler
 *   node app/lib/formatters.check.mjs
 *
 * Exits non-zero on the first mismatch.
 */
import { formatMoney, setCurrencySymbol } from "/tmp/fmtout/formatters.js";
const eq = (got, want, what) => {
  if (got !== want) { console.error(`FAIL ${what}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); process.exitCode = 1; }
  else console.log(`ok   ${what} -> ${got}`);
};
eq(formatMoney(1234.5), "₹1,234.50", "default 2dp");
eq(formatMoney(1234.5, { decimals: 0 }), "₹1,235", "0dp rounds");
eq(formatMoney(-2500), "-₹2,500.00", "negative keeps sign outside symbol");
eq(formatMoney(0), "₹0.00", "zero");
eq(formatMoney("999.99"), "₹999.99", "numeric string");
eq(formatMoney(undefined), "₹0.00", "undefined is not NaN");
eq(formatMoney(12345678, { compact: true }), "₹1.2Cr", "crore");
eq(formatMoney(250000, { compact: true }), "₹2.5L", "lakh");
eq(formatMoney(4500, { compact: true }), "₹5K", "thousand");
eq(formatMoney(750, { compact: true }), "₹750", "under 1k");
setCurrencySymbol("$");
eq(formatMoney(1234.5), "$1,234.50", "symbol follows Settings");
eq(formatMoney(12345678, { compact: true }), "$1.2Cr", "compact follows Settings");
setCurrencySymbol("   ");
eq(formatMoney(10), "₹10.00", "blank symbol falls back to rupee");
setCurrencySymbol(null);
eq(formatMoney(10), "₹10.00", "null falls back to rupee");
