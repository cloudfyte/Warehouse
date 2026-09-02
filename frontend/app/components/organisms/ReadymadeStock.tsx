"use client";
import { useState } from "react";
import { nameToColorHex } from "@/app/lib/colorUtils";
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

const cell: React.CSSProperties = { padding: "11px 14px" };
const inputStyle: React.CSSProperties = {
  padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line)",
  background: "var(--input-bg)", color: "var(--ink)", fontSize: 13, outline: "none", width: "100%",
};

export default function ReadymadeStock({ items, canAddStock, onMutate }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [fillPrice, setFillPrice] = useState("");
  const [asSet, setAsSet] = useState(false);
  const [setName, setSetName] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  const q = search.toLowerCase();
  const filtered = items.filter(s =>
    !q ||
    s.itemType?.name?.toLowerCase().includes(q) ||
    s.clothCategory?.name?.toLowerCase().includes(q) ||
    s.clothColor?.name?.toLowerCase().includes(q) ||
    s.size?.toLowerCase().includes(q) ||
    s.warehouse?.name?.toLowerCase().includes(q)
  );
  const selectable = filtered.filter(s => s.quantityAvailable > 0);
  const allSelected = selectable.length > 0 && selectable.every(s => selected.includes(s.id));

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
      <h2 style={{ margin: "0 0 6px" }}>
        Readymade Stock{" "}
        <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 16 }}>({items.length})</span>
      </h2>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
        Everything a supplier delivered, before it is priced and tagged. Tag a whole size run at once
        by ticking its rows.
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder="Search item type, fabric, color, size or warehouse…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--ink)", fontSize: 14, flex: 1, minWidth: 220 }}
        />
        {canAddStock && selected.length > 0 && (
          <button type="button" onClick={() => openFor(selected)}
            style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            → Add {selected.length} to Products
          </button>
        )}
      </div>

      <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--border)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
              <th style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", width: 34 }}>
                {canAddStock && selectable.length > 0 && (
                  <input type="checkbox" checked={allSelected} aria-label="Select all rows with stock"
                    onChange={() => setSelected(allSelected ? [] : selectable.map(s => s.id))} />
                )}
              </th>
              {["Item Type", "Fabric", "Color", "Size", "Received", "Available", "Cost/pc", "Warehouse", "Date", ""].map(h => (
                <th key={h} style={{ padding: "10px 14px", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} style={{ borderBottom: "1px solid var(--border)", background: selected.includes(s.id) ? "var(--canvas)" : undefined }}>
                <td style={cell}>
                  {canAddStock && s.quantityAvailable > 0 && (
                    <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)}
                      aria-label={`Select ${label(s)}`} />
                  )}
                </td>
                <td style={{ ...cell, fontWeight: 600 }}>{s.itemType?.name}</td>
                <td style={{ ...cell, fontSize: 12, color: "var(--muted)" }}>{s.clothCategory?.name || "—"}</td>
                <td style={cell}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {s.clothColor && <span style={{ width: 12, height: 12, borderRadius: 3, background: nameToColorHex(s.clothColor.name, s.clothColor.hexCode), display: "inline-block", flexShrink: 0 }} />}
                    {s.clothColor?.name || "—"}
                  </div>
                </td>
                <td style={cell}>{s.size || "—"}</td>
                <td style={cell}>{s.quantityReceived} pcs</td>
                <td style={{ ...cell, fontWeight: 700, color: s.quantityAvailable < 5 ? "#f44336" : "inherit" }}>{s.quantityAvailable} pcs</td>
                <td style={cell}>₹{s.costPrice}</td>
                <td style={cell}>{s.warehouse?.name}</td>
                <td style={{ ...cell, fontSize: 12 }}>{s.receivedDate ? new Date(s.receivedDate).toLocaleDateString("en-IN") : "—"}</td>
                <td style={cell}>
                  {canAddStock && s.quantityAvailable > 0 && (
                    <button type="button" onClick={() => openFor([s.id])}
                      style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid var(--primary)", background: "transparent", color: "var(--primary)", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                      → Add to Products
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                  {items.length === 0
                    ? "No readymade stock. Receive a Purchase Order, or record a supplier invoice, to add readymade items."
                    : "No items match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
