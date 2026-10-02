"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StockMovement } from "@/app/types";
import { productName } from "@/app/lib/formatters";
import { nameToColorHex } from "@/app/lib/colorUtils";
import { downloadCsv } from "@/app/lib/csv";
import { STOCK_MOVEMENTS_QUERY } from "@/app/lib/graphql";
import { friendlyError } from "@/app/lib/errors";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Button from "@/app/components/atoms/Button";
import Pagination from "@/app/components/atoms/Pagination";
import PageHeader from "@/app/components/molecules/PageHeader";
import FilterBar from "@/app/components/molecules/FilterBar";
import TotalsBar from "@/app/components/molecules/TotalsBar";
import Cell from "@/app/components/molecules/Cell";

interface Props {
  gql: (q: string, v?: Record<string, unknown>) => Promise<unknown>
}

const PER_PAGE = 25;

const KIND: Record<string, { said: string; tone: string; arrow: string }> = {
  TO_SHOP:         { said: "to the shop",      tone: "#6d28d9", arrow: "→" },
  BACK_FROM_SHOP:  { said: "back from the shop", tone: "#e65100", arrow: "←" },
  BETWEEN_GODOWNS: { said: "between godowns",  tone: "#1565c0", arrow: "→" },
};

function when(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN",
    { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Every piece that left a godown, or came back to one.
 *
 * "which product we moved on which date and quantity and whom did that" is one
 * question, and the answer used to mean opening a consignment, then a transfer,
 * then the returns. It is read off those same records — not written to a
 * register of its own, because a second copy of a movement is a second thing
 * that can disagree with the stock.
 */
export default function StockMovements({ gql }: Props) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [days, setDays] = useState("90");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [person, setPerson] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async (window_: string) => {
    setLoading(true); setErr("");
    try {
      const res = await gql(STOCK_MOVEMENTS_QUERY,
        { days: window_ ? Number(window_) : null, limit: 1000 }) as
        { stockMovements?: StockMovement[] };
      setMovements(res?.stockMovements ?? []);
    } catch (e: unknown) {
      setErr(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [gql]);

  useEffect(() => { load(days); }, [load, days]);

  const people = useMemo(
    () => Array.from(new Set(movements.map(m => m.person).filter(Boolean))).sort(),
    [movements]);

  const q = search.trim().toLowerCase();
  const shown = movements.filter(m => {
    if (kind && m.kind !== kind) return false;
    if (person && m.person !== person) return false;
    if (!q) return true;
    return [productName(m.product), m.product?.sku, m.product?.barcode, m.reference,
            m.fromName, m.toName, m.person, m.lrNumber]
      .some(v => (v || "").toLowerCase().includes(q));
  });

  const lastPage = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const shownPage = Math.min(page, lastPage);
  const paged = shown.slice((shownPage - 1) * PER_PAGE, shownPage * PER_PAGE);

  const out = shown.filter(m => m.kind !== "BACK_FROM_SHOP")
    .reduce((t, m) => t + (m.quantity || 0), 0);
  const back = shown.filter(m => m.kind === "BACK_FROM_SHOP")
    .reduce((t, m) => t + (m.quantity || 0), 0);

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="What moved"
        sub="Every piece that left a godown or came back — when, how many, and whose hand"
        actions={
          <Button variant="secondary" onClick={() => downloadCsv(
            `what-moved-${new Date().toISOString().slice(0, 10)}.csv`,
            shown.map(m => ({
              When: when(m.when),
              Product: productName(m.product),
              SKU: m.product?.sku ?? "",
              Barcode: m.product?.barcode ?? "",
              Size: m.product?.size ?? "",
              Pieces: m.quantity,
              Movement: KIND[m.kind]?.said ?? m.kind,
              From: m.fromName, To: m.toName,
              By: m.person || "—",
              Reference: m.reference,
              LR: m.lrNumber || "",
              Status: m.status,
            }))
          )}>
            ↓ Export CSV
          </Button>
        }
      />

      <TotalsBar
        narrowed={shown.length !== movements.length}
        note="Totals are for what you have filtered, not every movement."
        totals={[
          { label: "Movements", value: String(shown.length) },
          { label: "Pieces out", value: String(out), color: "var(--primary)" },
          { label: "Pieces back", value: String(back), color: back > 0 ? "#e65100" : undefined },
        ]}
      />

      <FilterBar>
        <Select value={days} onChange={e => { setDays(e.target.value); setPage(1); }}
          style={{ width: "auto", minWidth: 150 }}>
          <option value="30">Last 30 days</option>
          <option value="90">Last 3 months</option>
          <option value="365">Last year</option>
          <option value="">Everything</option>
        </Select>
        <Input placeholder="Search a garment, a barcode, a consignment…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ flex: 1, minWidth: 220, width: "auto" }} />
        <Select value={kind} onChange={e => { setKind(e.target.value); setPage(1); }}
          style={{ width: "auto", minWidth: 170 }}>
          <option value="">Everywhere</option>
          <option value="TO_SHOP">To the shop</option>
          <option value="BACK_FROM_SHOP">Back from the shop</option>
          <option value="BETWEEN_GODOWNS">Between godowns</option>
        </Select>
        <Select value={person} onChange={e => { setPerson(e.target.value); setPage(1); }}
          style={{ width: "auto", minWidth: 150 }}>
          <option value="">Anybody</option>
          {people.map(p => <option key={p} value={p}>{p}</option>)}
        </Select>
      </FilterBar>

      {err && (
        <div style={{ fontSize: 13, color: "#d32f2f", marginBottom: 12 }}>{err}</div>
      )}

      {loading ? (
        <div style={{ padding: "64px 0", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
          Reading the register…
        </div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
            {movements.length === 0 ? "Nothing has moved yet" : "Nothing matches that"}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {movements.length === 0
              ? "A consignment to the shop or a transfer between godowns turns up here by itself."
              : "Try another person, or clear the search."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {paged.map(m => {
            const k = KIND[m.kind] ?? { said: m.kind, tone: "#94a3b8", arrow: "→" };
            const swatch = nameToColorHex(m.product?.clothColor?.name || "");
            return (
              <div key={m.id} style={{
                display: "grid",
                // ~870px of minimums — fits a 1280 laptop with the sidebar open.
                gridTemplateColumns: "minmax(170px,1.4fr) 90px minmax(170px,1.3fr) minmax(130px,1fr) minmax(150px,1.1fr)",
                gap: 16, alignItems: "center",
                border: "1px solid var(--line)", borderLeft: `3px solid ${k.tone}`,
                borderRadius: 12, padding: "14px 16px", background: "var(--paper)",
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {productName(m.product)}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                    {m.product?.clothColor && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5 }}>
                        <span style={{
                          width: 13, height: 13, borderRadius: "50%", flexShrink: 0,
                          background: swatch ?? "transparent", border: "1px solid rgba(0,0,0,.18)",
                        }} />
                        {m.product.clothColor.name}
                      </span>
                    )}
                    {m.product?.size && (
                      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>size {m.product.size}</span>
                    )}
                  </div>
                  {/* The code that scans the same here and at their counter. */}
                  {m.product?.barcode && (
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3, fontFamily: "monospace" }}>
                      {m.product.barcode}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
                    {m.quantity}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>pcs</div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Where
                  </div>
                  <div style={{ fontSize: 14, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.fromName} <span style={{ color: k.tone, fontWeight: 700 }}>{k.arrow}</span> {m.toName}
                  </div>
                  <div style={{ fontSize: 11.5, color: k.tone, marginTop: 3 }}>{k.said}</div>
                </div>

                <Cell label="Who" value={m.person || "—"} />

                <div style={{ minWidth: 0 }}>
                  <Cell label="When" value={when(m.when)} />
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
                    {m.reference}{m.lrNumber ? ` · LR ${m.lrNumber}` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pagination page={shownPage} total={shown.length} perPage={PER_PAGE} onChange={setPage} />
    </div>
  );
}
