"use client";
import { useMemo, useState } from "react";
import { X, Grid3x3 } from "lucide-react";
import type { ItemType, WarehouseLocation } from "@/app/types";
import { showToast } from "@/app/lib/toast";
import { friendlyError } from "@/app/lib/errors";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Button from "@/app/components/atoms/Button";
import Modal from "@/app/components/atoms/Modal";
import Field from "@/app/components/molecules/Field";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";

interface Props {
  itemTypes: ItemType[];
  warehouses: WarehouseLocation[];
  onClose: () => void;
  onCreated: () => void;
  onMutate: (q: string, v: Record<string, unknown>) => Promise<unknown>;
}

interface Dimension { name: string; values: string }
interface Row {
  options: { name: string; value: string }[];
  quantity: string;
  costPrice: string;
  salePrice: string;
  /** Blank or zero means this product is never reported as low or out. */
  minStock: string;
}

/**
 * Build a size run — or any set of dimension combinations — in one action.
 *
 * Entering seven sizes of the same garment by hand is where the time goes and
 * where the typos come from. Name the dimensions, list their values, and every
 * combination is generated at once.
 *
 * Combinations are generated here rather than on the server so each one can
 * have its own quantity and prices before anything is saved: a size run is
 * rarely the same count in every size, and finding that out afterwards means
 * editing rows one at a time — the tedium this exists to remove.
 */
export default function ProductMatrixBuilder({ itemTypes, warehouses, onClose, onCreated, onMutate }: Props) {
  const [itemTypeId, setItemTypeId] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [source, setSource] = useState("IMPORTED");
  const [dimensions, setDimensions] = useState<Dimension[]>([
    { name: "Size", values: "" },
    { name: "Colour", values: "" },
  ]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [defaults, setDefaults] = useState({ quantity: "1", costPrice: "", salePrice: "", minStock: "" });
  // A size run is the usual reason to generate a matrix and the usual thing to
  // sell as a set, so it can be bundled in the same action.
  const [asSet, setAsSet] = useState(false);
  const [setName, setSetName] = useState("");
  const [setQuantity, setSetQuantity] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /** The cartesian product of every dimension that has both a name and values. */
  const combinations = useMemo(() => {
    const active = dimensions
      .map(d => ({ name: d.name.trim(), values: d.values.split(",").map(v => v.trim()).filter(Boolean) }))
      .filter(d => d.name && d.values.length);

    return active.reduce<{ name: string; value: string }[][]>((acc, d) => {
      if (!acc.length) return d.values.map(v => [{ name: d.name, value: v }]);
      return acc.flatMap(combo => d.values.map(v => [...combo, { name: d.name, value: v }]));
    }, []);
  }, [dimensions]);

  function generate() {
    setRows(combinations.map(options => ({
      options,
      quantity: defaults.quantity || "1",
      costPrice: defaults.costPrice,
      salePrice: defaults.salePrice,
      minStock: defaults.minStock,
    })));
    setError("");
  }

  function patchRow(i: number, patch: Partial<Row>) {
    setRows(rs => rs ? rs.map((r, j) => j === i ? { ...r, ...patch } : r) : rs);
  }

  async function save() {
    if (!itemTypeId) { setError("Pick the item type these belong to."); return; }
    if (!warehouseId) { setError("Pick a warehouse."); return; }
    const payload = (rows || []).filter(r => r.options.length);
    if (!payload.length) { setError("Generate the combinations first."); return; }
    if (asSet && !setName.trim()) { setError("Give the set a name, or turn the set off."); return; }

    setSaving(true); setError("");
    try {
      await onMutate(
        `mutation M($it:ID!,$wh:ID!,$src:String,$rows:[VariantRowInput!]!,$setName:String,$setQty:Int){`
        + `createProductMatrix(itemTypeId:$it,warehouseId:$wh,source:$src,rows:$rows,setName:$setName,setQuantity:$setQty)`
        + `{finishedProducts{id sku barcode} productSet{id setNumber}}}`,
        {
          it: itemTypeId, wh: warehouseId, src: source,
          setName: asSet ? setName.trim() : undefined,
          setQty: asSet ? (parseInt(setQuantity, 10) || 0) : undefined,
          rows: payload.map(r => ({
            options: r.options,
            quantity: parseInt(r.quantity, 10) || 0,
            costPrice: r.costPrice === "" ? 0 : +r.costPrice,
            salePrice: r.salePrice === "" ? 0 : +r.salePrice,
            minStock: r.minStock === "" ? 0 : parseInt(r.minStock, 10) || 0,
          })),
        },
      );
      showToast(
        asSet
          ? `${payload.length} products created and bundled as "${setName.trim()}".`
          : `${payload.length} product${payload.length === 1 ? "" : "s"} created.`,
        "success",
      );
      onCreated();
      onClose();
    } catch (e: unknown) {
      const msg = friendlyError(e);
      setError(msg); showToast(msg, "error");
    } finally { setSaving(false); }
  }

  const totalPieces = (rows || []).reduce((n, r) => n + (parseInt(r.quantity, 10) || 0), 0);

  return (
    <Modal
      title="Add Products"
      subtitle="Name the dimensions, list their values, and every combination is created at once."
      width={720}
      zIndex={300}
      onClose={onClose}
      onSubmit={save}
      footer={
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Button variant="primary" type="submit" disabled={saving || !rows?.length} style={{ flex: 1 }}>
            {saving ? "Creating…" : `Create ${rows?.length ?? 0} product${rows?.length === 1 ? "" : "s"}`}
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field label="Item Type *">
          <Select value={itemTypeId} onChange={e => setItemTypeId(e.target.value)}>
            <option value="">Select…</option>
            {itemTypes.filter(t => t.active !== false).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Warehouse *">
          <Select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
            <option value="">Select…</option>
            {warehouses.filter(w => w.active !== false).map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Source">
          <Select value={source} onChange={e => setSource(e.target.value)}>
            <option value="IMPORTED">Imported (Readymade)</option>
            <option value="IN_HOUSE">In-house (Stitched)</option>
          </Select>
        </Field>
      </div>

      {/* ── Dimensions ── */}
      <div style={{
        border: "1px solid var(--line)", borderRadius: 12,
        padding: "12px 14px", margin: "6px 0 14px",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Dimensions
        </div>
        {dimensions.map((dim, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <Input
              placeholder="Size"
              value={dim.name}
              onChange={e => setDimensions(d => d.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
              style={{ width: 130, flex: "none" }}
            />
            <span style={{ color: "var(--muted)" }}>:</span>
            <Input
              placeholder="34, 36, 38, 40, 42, 44, 46"
              value={dim.values}
              onChange={e => setDimensions(d => d.map((x, j) => j === i ? { ...x, values: e.target.value } : x))}
            />
            <button
              type="button"
              aria-label={`Remove dimension ${dim.name || i + 1}`}
              onClick={() => setDimensions(d => d.filter((_, j) => j !== i))}
              style={{ background: "none", border: "none", color: "var(--muted)", flex: "none", padding: 6 }}
            >
              <X size={15} />
            </button>
          </div>
        ))}

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => setDimensions(d => [...d, { name: "", values: "" }])}
            style={{ fontSize: 12, padding: "5px 10px" }}>
            + Add dimension
          </Button>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 240 }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Defaults</span>
            <Input type="number" min="0" placeholder="Qty" value={defaults.quantity}
              onChange={e => setDefaults(d => ({ ...d, quantity: e.target.value }))} style={{ width: 64 }} />
            <Input type="number" min="0" placeholder="Cost" value={defaults.costPrice}
              onChange={e => setDefaults(d => ({ ...d, costPrice: e.target.value }))} style={{ width: 80 }} />
            <Input type="number" min="0" placeholder="MRP" value={defaults.salePrice}
              onChange={e => setDefaults(d => ({ ...d, salePrice: e.target.value }))} style={{ width: 80 }} />
            <Input type="number" min="0" placeholder="Min" value={defaults.minStock}
              onChange={e => setDefaults(d => ({ ...d, minStock: e.target.value }))} style={{ width: 64 }} />
          </div>
          <Button variant="primary" onClick={generate} disabled={!combinations.length}
            style={{ fontSize: 12, padding: "6px 12px" }}>
            <Grid3x3 size={13} /> Generate {combinations.length || ""} combination{combinations.length === 1 ? "" : "s"}
          </Button>
        </div>
        {!combinations.length && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
            Give a dimension a name and some comma-separated values.
          </div>
        )}
      </div>

      {/* ── Bundle the run as a set ── */}
      {rows && rows.length > 0 && (
        <div style={{
          border: "1px solid var(--line)", borderRadius: 12,
          padding: "12px 14px", marginBottom: 12,
        }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={asSet} onChange={e => setAsSet(e.target.checked)} />
            Also bundle these as a set
          </label>
          {asSet && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12, marginTop: 10 }}>
                <Field label="Set name *">
                  <Input value={setName} placeholder="e.g. Sherwani set 34-46"
                    onChange={e => setSetName(e.target.value)} />
                </Field>
                <Field label="Build how many" hint="0 defines it without building.">
                  <Input type="number" min="0" value={setQuantity}
                    onChange={e => setSetQuantity(e.target.value)} />
                </Field>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
                The set holds one of each combination above. Building takes those pieces out of
                individual stock — you can break a set open later to get them back.
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Generated rows ── */}
      {rows && rows.length > 0 && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 72px 88px 88px 72px 32px", gap: 8,
            padding: "8px 12px", background: "var(--canvas)",
            fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5,
          }}>
            <span>Combination</span><span>Qty</span><span>Cost</span><span>MRP</span><span>Min</span><span />
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {rows.map((row, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1fr 72px 88px 88px 72px 32px", gap: 8,
                padding: "8px 12px", alignItems: "center", borderTop: "1px solid var(--line)",
              }}>
                <span style={{ fontSize: 13 }}>
                  {row.options.map(o => `${o.name}: ${o.value}`).join(" · ")}
                </span>
                <Input type="number" min="0" value={row.quantity}
                  onChange={e => patchRow(i, { quantity: e.target.value })} />
                <Input type="number" min="0" step="0.01" value={row.costPrice}
                  onChange={e => patchRow(i, { costPrice: e.target.value })} />
                <Input type="number" min="0" step="0.01" value={row.salePrice}
                  onChange={e => patchRow(i, { salePrice: e.target.value })} />
                <Input type="number" min="0" value={row.minStock} placeholder="—"
                  onChange={e => patchRow(i, { minStock: e.target.value })} />
                <button
                  type="button"
                  aria-label={`Remove combination ${i + 1}`}
                  onClick={() => setRows(rs => rs ? rs.filter((_, j) => j !== i) : rs)}
                  style={{ background: "none", border: "none", color: "var(--muted)", padding: 4 }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <div style={{
            padding: "8px 12px", borderTop: "1px solid var(--line)",
            fontSize: 12, color: "var(--muted)", background: "var(--canvas)",
          }}>
            {rows.length} product{rows.length === 1 ? "" : "s"} · {totalPieces} piece{totalPieces === 1 ? "" : "s"} total.
            Each gets its own barcode. <strong>Min</strong> is the stock level below which you want to be
            warned — leave it blank and this product is never reported as low or out.
          </div>
        </div>
      )}

      {error && <ErrorBanner msg={error} />}
    </Modal>
  );
}
