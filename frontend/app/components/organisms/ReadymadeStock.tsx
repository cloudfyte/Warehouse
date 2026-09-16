"use client";
import { useMemo, useState } from "react";
import { nameToColorHex } from "@/app/lib/colorUtils";
import { formatMoney } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Modal from "@/app/components/atoms/Modal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StockItem = Record<string, any>;

interface Props {
  items: StockItem[];
  canAddStock: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>;
}

/** One selected stock row, with what it will become. */
interface Line { item: StockItem; qty: string; salePrice: string }

const label = (s: StockItem) =>
  [s.itemType?.name, s.clothColor?.name, s.size].filter(Boolean).join(" · ");

const inputStyle: React.CSSProperties = {
  padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line)",
  background: "var(--input-bg)", color: "var(--ink)", fontSize: 13, outline: "none", width: "100%",
};

/** One labelled fact, so the eye can jump to the party or the rate. */
function Cell({ label: heading, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {heading}
      </div>
      <div style={{ fontSize: 14, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value || "—"}
      </div>
    </div>
  );
}

export default function ReadymadeStock({ items, canAddStock, onMutate }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [fillPrice, setFillPrice] = useState("");
  const [asSet, setAsSet] = useState(false);
  const [setName, setSetName] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  const [itemFilter, setItemFilter] = useState("");

  const itemTypes = useMemo(
    () => [...new Set(items.map(s => s.itemType?.name).filter(Boolean))].sort() as string[],
    [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(s =>
      (!itemFilter || s.itemType?.name === itemFilter)
      && (!q
          || s.itemType?.name?.toLowerCase().includes(q)
          || s.supplier?.name?.toLowerCase().includes(q)
          || s.clothCategory?.name?.toLowerCase().includes(q)
          || s.clothColor?.name?.toLowerCase().includes(q)
          || s.size?.toLowerCase().includes(q)
          || s.warehouse?.name?.toLowerCase().includes(q)));
  }, [items, search, itemFilter]);

  /**
   * A delivery is one style in many sizes, and it was being shown as one row
   * per size — so eight rows that are really one thing. Gathering them back
   * together is what makes "how many of this have we got" answerable.
   */
  const groups = useMemo(() => {
    const map = new Map<string, {
      key: string; itemName: string; colorName?: string; colorHex?: string;
      category?: string; supplier?: string; warehouse?: string; cost: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows: any[]; available: number; received: number;
    }>();
    for (const s of filtered) {
      const key = [s.itemType?.id, s.clothColor?.id ?? "-", s.warehouse?.id].join("|");
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          itemName: s.itemType?.name ?? "—",
          colorName: s.clothColor?.name,
          colorHex: s.clothColor?.hexCode,
          category: s.clothCategory?.name,
          supplier: s.supplier?.name,
          warehouse: s.warehouse?.name,
          cost: Number(s.costPrice ?? 0),
          rows: [], available: 0, received: 0,
        };
        map.set(key, g);
      }
      g.rows.push(s);
      g.available += Number(s.quantityAvailable ?? 0);
      g.received += Number(s.quantityReceived ?? 0);
    }
    const out = [...map.values()];
    for (const g of out) {
      // "38" before "40" before "42" — a plain sort puts 10 ahead of 2.
      g.rows.sort((a, b) => String(a.size || "").localeCompare(String(b.size || ""), undefined, { numeric: true }));
    }
    return out.sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [filtered]);

  const totals = useMemo(() => filtered.reduce((a, s) => ({
    available: a.available + Number(s.quantityAvailable ?? 0),
    received: a.received + Number(s.quantityReceived ?? 0),
    value: a.value + Number(s.quantityAvailable ?? 0) * Number(s.costPrice ?? 0),
  }), { available: 0, received: 0, value: 0 }), [filtered]);

  const narrowed = !!(search.trim() || itemFilter);

  function toggle(id: string) {
    setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }

  /**
   * A delivery arrives as one stock row per size, so tagging it is a job on the
   * whole run, not on one row — open every selected row in one sheet and set
   * the prices there.
   */
  function openFor(ids: string[]) {
    const rows = items.filter(s => ids.includes(s.id) && s.quantityAvailable > 0);
    if (!rows.length) return;
    setLines(rows.map(item => ({ item, qty: String(item.quantityAvailable), salePrice: "" })));
    setFillPrice(""); setAsSet(false); setSetName(""); setErr("");
  }

  function patch(i: number, p: Partial<Line>) {
    setLines(ls => ls ? ls.map((l, j) => j === i ? { ...l, ...p } : l) : ls);
  }

  async function submit() {
    if (!lines) return;
    const bad = lines.find(l => !(parseFloat(l.salePrice) > 0) || !(parseInt(l.qty) > 0));
    if (bad) { setErr(`Give ${label(bad.item)} a quantity and a sale price.`); return; }
    if (lines.some(l => parseInt(l.qty) > l.item.quantityAvailable)) {
      setErr("One of the rows asks for more pieces than are available."); return;
    }
    if (asSet) {
      if (!setName.trim()) { setErr("Give the set a name, or turn the set off."); return; }
      const one = lines[0].item;
      if (lines.some(l => l.item.itemType?.id !== one.itemType?.id || l.item.warehouse?.id !== one.warehouse?.id)) {
        setErr("A set has to be one item type in one warehouse. Deselect the odd rows, or turn the set off.");
        return;
      }
    }

    setAdding(true); setErr("");
    // Each row is its own atomic move of stock into finished goods. A failure
    // partway leaves the rows before it correctly converted rather than rolling
    // the lot back, so the count says exactly how far it got.
    const ids: string[] = [];
    try {
      for (const l of lines) {
        const res = await onMutate(
          `mutation A($rsId:ID!,$itId:ID!,$wId:ID!,$qty:Int!,$cp:Float!,$sp:Float!,$cat:ID,$col:ID,$sz:String){createFinishedProducts(readymadeStockId:$rsId,itemTypeId:$itId,warehouseId:$wId,quantity:$qty,costPrice:$cp,salePrice:$sp,clothCategoryId:$cat,clothColorId:$col,size:$sz){finishedProduct{id sku}}}`,
          {
            rsId: l.item.id, itId: l.item.itemType?.id, wId: l.item.warehouse?.id,
            qty: parseInt(l.qty), cp: parseFloat(l.item.costPrice), sp: parseFloat(l.salePrice),
            cat: l.item.clothCategory?.id || undefined,
            col: l.item.clothColor?.id || undefined,
            sz: l.item.size || undefined,
          }
        );
        const id = res?.createFinishedProducts?.finishedProduct?.id;
        if (id) ids.push(id);
      }

      if (asSet && ids.length) {
        await onMutate(
          `mutation S($n:String!,$it:ID!,$wh:ID!,$lines:[SetLineInput!]!){createProductSet(name:$n,itemTypeId:$it,warehouseId:$wh,lines:$lines){productSet{id setNumber}}}`,
          {
            n: setName.trim(),
            it: lines[0].item.itemType?.id,
            wh: lines[0].item.warehouse?.id,
            lines: ids.map(id => ({ finishedProductId: id, piecesPerSet: 1 })),
          }
        );
      }

      showToast(
        asSet
          ? `${ids.length} products tagged and bundled as "${setName.trim()}".`
          : `${ids.length} product${ids.length === 1 ? "" : "s"} added to finished goods.`,
        "success",
      );
      setLines(null); setSelected([]);
    } catch (e: unknown) {
      const msg = friendlyError(e);
      setErr(ids.length ? `${ids.length} of ${lines.length} added, then: ${msg}` : msg);
      showToast(msg, "error");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>Readymade Stock</h2>
        <div style={{ fontSize: 14, color: "var(--muted)" }}>
          What a supplier delivered, before it is priced and tagged. A style arrives as one row
          per size, so its sizes are kept together here.
        </div>
      </div>

      {/* The same question as raw cloth, in pieces: how many of this have we got. */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 1,
        background: "var(--line)", border: "1px solid var(--line)", borderRadius: 14,
        overflow: "hidden", marginBottom: 14,
      }}>
        {([
          ["Styles", String(groups.length), undefined],
          ["Available", `${totals.available} pcs`, "var(--primary)"],
          ["Received in total", `${totals.received} pcs`, undefined],
          ["Stock value", formatMoney(totals.value), undefined],
        ] as const).map(([label_, value, color]) => (
          <div key={label_} style={{ background: "var(--paper)", padding: "15px 18px" }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>
              {label_}
            </div>
            <div style={{ fontSize: 25, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 }}>
              {value}
            </div>
          </div>
        ))}
      </div>
      {narrowed && (
        <div style={{ fontSize: 12, color: "var(--muted)", margin: "-6px 0 12px" }}>
          Totals are for what you have filtered, not the whole godown.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <input
          placeholder="Item type, party, colour, size, godown…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 220, padding: "9px 14px", fontSize: 14 }}
        />
        <select value={itemFilter} onChange={e => setItemFilter(e.target.value)}
          style={{ ...inputStyle, width: 190, padding: "9px 12px" }}>
          <option value="">All item types</option>
          {itemTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {canAddStock && selected.length > 0 && (
          <button type="button" onClick={() => openFor(selected)}
            style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            Tag {selected.length} &rarr; Products
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {groups.length === 0 ? (
          <div style={{
            border: "1px dashed var(--line)", borderRadius: 12, padding: "44px 20px",
            textAlign: "center", color: "var(--muted)", fontSize: 13,
          }}>
            {items.length === 0
              ? "No readymade stock. Receive a purchase order, or record a supplier invoice."
              : "Nothing matches."}
          </div>
        ) : groups.map(g => {
          const swatch = g.colorName ? nameToColorHex(g.colorName, g.colorHex) : null;
          const mine = g.rows.filter(r => r.quantityAvailable > 0).map(r => r.id);
          const allOn = mine.length > 0 && mine.every(id => selected.includes(id));
          const low = g.available > 0 && g.available < 5;

          return (
            <div key={g.key} style={{
              border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px",
              background: "var(--paper)",
            }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "26px minmax(190px,1.4fr) minmax(130px,1fr) minmax(110px,0.8fr) 100px 170px",
                gap: 16, alignItems: "center",
              }}>
                {canAddStock && mine.length > 0 ? (
                  <input type="checkbox" checked={allOn}
                    aria-label={`Select every size of ${g.itemName}`}
                    onChange={() => setSelected(prev => allOn
                      ? prev.filter(id => !mine.includes(id))
                      : [...new Set([...prev, ...mine])])} />
                ) : <span />}

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>{g.itemName}</span>
                    {g.colorName && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "3px 11px 3px 4px", borderRadius: 99,
                        background: "var(--canvas)", border: "1px solid var(--line)", fontSize: 13,
                      }}>
                        <span style={{
                          width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                          background: swatch ?? "transparent", border: "1px solid rgba(0,0,0,.18)",
                        }} />
                        {g.colorName}
                      </span>
                    )}
                  </div>
                </div>

                <Cell label="Party" value={g.supplier} />
                <Cell label="Category" value={g.category} />
                <Cell label="Rate" value={`${formatMoney(g.cost)}/pc`} />

                <div style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5, justifyContent: "flex-end" }}>
                    <span style={{
                      fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                      color: low ? "#d32f2f" : "var(--ink)", letterSpacing: -0.5, lineHeight: 1.1,
                    }}>{g.available}</span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>of {g.received} pcs</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 5 }}>
                    {g.rows.length} size{g.rows.length === 1 ? "" : "s"} · {g.warehouse}
                  </div>
                </div>
              </div>

              {/* One chip per size — the shape a delivery actually arrives in.
                  Tapping one picks that size alone for tagging. */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, paddingLeft: 38 }}>
                {g.rows.map(r => {
                  const on = selected.includes(r.id);
                  const out = r.quantityAvailable <= 0;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={!canAddStock || out}
                      onClick={() => toggle(r.id)}
                      style={{
                        display: "inline-flex", alignItems: "baseline", gap: 5,
                        padding: "6px 12px", borderRadius: 8, fontSize: 13,
                        border: `1px solid ${on ? "var(--primary)" : "var(--line)"}`,
                        background: on ? "color-mix(in srgb,var(--primary) 12%,transparent)" : "var(--canvas)",
                        color: out ? "var(--muted)" : "var(--ink)",
                        cursor: canAddStock && !out ? "pointer" : "default",
                        opacity: out ? 0.55 : 1,
                        fontVariantNumeric: "tabular-nums",
                      }}>
                      <strong style={{ fontSize: 13.5 }}>{r.size || "one size"}</strong>
                      <span style={{ color: "var(--muted)", fontSize: 12.5 }}>{r.quantityAvailable}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {lines && (
        <Modal
          title={lines.length === 1 ? "Add to Finished Products" : `Tag ${lines.length} rows`}
          subtitle="Cost comes from what the supplier charged. Set what you will sell each one for."
          onClose={() => setLines(null)}
          width={lines.length === 1 ? 460 : 680}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" disabled={adding} onClick={submit}
                style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                {adding ? "Adding…" : `Add ${lines.length} to Products`}
              </button>
              <button type="button" onClick={() => setLines(null)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--ink)", cursor: "pointer", fontSize: 14 }}>Cancel</button>
            </div>
          }>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {lines.length > 1 && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Same MRP for every row</span>
                <input type="number" min="0" step="0.01" placeholder="0.00" value={fillPrice}
                  onChange={e => {
                    setFillPrice(e.target.value);
                    setLines(ls => ls ? ls.map(l => ({ ...l, salePrice: e.target.value })) : ls);
                  }}
                  style={{ ...inputStyle, width: 120 }} />
                <span style={{ fontSize: 11, color: "var(--muted)" }}>— override any row below.</span>
              </div>
            )}

            <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 78px 90px 90px", gap: 8, padding: "8px 12px", background: "var(--canvas)", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                <span>Stock</span><span>Qty</span><span>Cost</span><span>MRP *</span>
              </div>
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                {lines.map((l, i) => (
                  <div key={l.item.id} style={{ display: "grid", gridTemplateColumns: "1fr 78px 90px 90px", gap: 8, padding: "8px 12px", alignItems: "center", borderTop: "1px solid var(--line)" }}>
                    <span style={{ fontSize: 13 }}>
                      {label(l.item)}
                      <span style={{ color: "var(--muted)" }}> · {l.item.quantityAvailable} avail.</span>
                    </span>
                    <input type="number" min="1" max={l.item.quantityAvailable} value={l.qty}
                      onChange={e => patch(i, { qty: e.target.value })} style={inputStyle} aria-label={`Quantity for ${label(l.item)}`} />
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>₹{l.item.costPrice}</span>
                    <input type="number" min="0" step="0.01" placeholder="0.00" value={l.salePrice}
                      onChange={e => patch(i, { salePrice: e.target.value })} style={inputStyle} aria-label={`Sale price for ${label(l.item)}`} />
                  </div>
                ))}
              </div>
            </div>

            {lines.length > 1 && (
              <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                  <input type="checkbox" checked={asSet} onChange={e => setAsSet(e.target.checked)} />
                  These sizes are sold as one set
                </label>
                {asSet && (
                  <>
                    <input placeholder="Set name — e.g. Sherwani run 38–46" value={setName}
                      onChange={e => setSetName(e.target.value)} style={{ ...inputStyle, marginTop: 8 }} />
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
                      Defines a set holding one of each. It is not built yet — build it from the Sets tab
                      when you actually box one up.
                    </div>
                  </>
                )}
              </div>
            )}

            {err && (
              <div style={{ padding: "9px 12px", borderRadius: 8, background: "#f4433622", color: "#c0392b", fontSize: 13 }}>{err}</div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
