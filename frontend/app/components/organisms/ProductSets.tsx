"use client";
import { useState } from "react";
import { Layers, Plus, Package, Split, X } from "lucide-react";
import type { FinishedProduct, ItemType, WarehouseLocation } from "@/app/types";
import { formatMoney, productName } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Button from "@/app/components/atoms/Button";
import Badge from "@/app/components/atoms/Badge";
import Modal from "@/app/components/atoms/Modal";
import Field from "@/app/components/molecules/Field";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import PageHeader from "@/app/components/molecules/PageHeader";

export interface ProductSet {
  id: string; setNumber: string; name: string; quantity: number;
  costPrice: number; salePrice: number; barcode: string; active: boolean;
  itemType: { id: string; name: string };
  warehouse: { id: string; name: string };
  items: { id: string; piecesPerSet: number; finishedProduct: { id: string; sku: string; size?: string; itemType: { name: string } } }[];
}

interface Props {
  sets: ProductSet[];
  products: FinishedProduct[];
  itemTypes: ItemType[];
  warehouses: WarehouseLocation[];
  canManage: boolean;
  onMutate: (q: string, v: Record<string, unknown>) => Promise<unknown>;
  onRefresh?: () => void;
}

interface DraftLine { productId: string; piecesPerSet: string }

/**
 * Sets of garments — built from pieces, and breakable back into them.
 *
 * A built set holds its pieces: they left the individual counts when it was
 * assembled, so nothing is ever counted twice. Breaking one open puts them
 * back. Every build and break moves pieces between those two levels and never
 * creates or destroys any.
 */
export default function ProductSets({ sets, products, itemTypes, warehouses, canManage, onMutate, onRefresh }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", itemTypeId: "", warehouseId: "", quantity: "0" });
  const [lines, setLines] = useState<DraftLine[]>([{ productId: "", piecesPerSet: "1" }]);
  const [saving, setSaving] = useState(false);

  const [moveFor, setMoveFor] = useState<{ set: ProductSet; mode: "build" | "break" } | null>(null);
  const [moveCount, setMoveCount] = useState("1");

  async function run(label: string, q: string, v: Record<string, unknown>, id?: string) {
    setBusyId(id ?? label); setError("");
    try {
      await onMutate(q, v);
      onRefresh?.();
      showToast(label, "success");
      return true;
    } catch (e: unknown) {
      const msg = friendlyError(e);
      setError(msg); showToast(msg, "error");
      return false;
    } finally { setBusyId(null); }
  }

  async function createSet() {
    const chosen = lines.filter(l => l.productId);
    if (!form.name.trim()) { setError("Give the set a name."); return; }
    if (!form.itemTypeId || !form.warehouseId) { setError("Pick the item type and warehouse."); return; }
    if (!chosen.length) { setError("Add at least one product to the set."); return; }

    setSaving(true);
    const ok = await run(
      "Set created.",
      `mutation C($name:String!,$it:ID!,$wh:ID!,$lines:[SetLineInput!]!,$qty:Int){`
      + `createProductSet(name:$name,itemTypeId:$it,warehouseId:$wh,lines:$lines,quantity:$qty)`
      + `{productSet{id setNumber}}}`,
      {
        name: form.name, it: form.itemTypeId, wh: form.warehouseId,
        qty: parseInt(form.quantity, 10) || 0,
        lines: chosen.map(l => ({
          finishedProductId: l.productId,
          piecesPerSet: parseInt(l.piecesPerSet, 10) || 1,
        })),
      },
    );
    setSaving(false);
    if (ok) {
      setShowNew(false);
      setForm({ name: "", itemTypeId: "", warehouseId: "", quantity: "0" });
      setLines([{ productId: "", piecesPerSet: "1" }]);
    }
  }

  async function confirmMove() {
    if (!moveFor) return;
    const { set, mode } = moveFor;
    const count = parseInt(moveCount, 10) || 0;
    const ok = await run(
      mode === "build" ? `${count} set(s) built.` : `${count} set(s) broken back into pieces.`,
      mode === "build"
        ? `mutation B($id:ID!,$c:Int!){buildProductSets(id:$id,count:$c){productSet{id quantity}}}`
        : `mutation B($id:ID!,$c:Int!){breakProductSets(id:$id,count:$c){productSet{id quantity}}}`,
      { id: set.id, c: count },
      set.id,
    );
    if (ok) setMoveFor(null);
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Sets"
        sub={`${sets.length} set${sets.length === 1 ? "" : "s"} · ${sets.reduce((n, s) => n + s.quantity, 0)} in stock`}
        actions={canManage && (
          <Button variant="primary" onClick={() => { setError(""); setShowNew(true); }}>
            <Plus size={14} /> New Set
          </Button>
        )}
      />

      {error && <ErrorBanner msg={error} />}

      {sets.length === 0 ? (
        <div style={{
          border: "1px dashed var(--line)", borderRadius: 12, padding: "40px 20px",
          textAlign: "center", color: "var(--muted)", fontSize: 13,
        }}>
          <Layers size={22} style={{ opacity: 0.5 }} />
          <div style={{ marginTop: 8 }}>
            No sets yet. A set bundles pieces — one of each size, say — and sells as one item.
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {sets.map(s => (
            <div key={s.id} style={{
              background: "var(--paper)", border: "1px solid var(--line)",
              borderRadius: 12, padding: "14px 16px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace", marginTop: 2 }}>
                    {s.setNumber} · {s.barcode} · {s.warehouse.name}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>In stock</div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{s.quantity}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>Set price</div>
                    <div style={{ fontWeight: 700 }}>{formatMoney(s.salePrice)}</div>
                  </div>
                  <Badge color={s.active ? "#059669" : "#6b7280"} label={s.active ? "Active" : "Inactive"} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0" }}>
                {s.items.map(it => (
                  <span key={it.id} style={{
                    fontSize: 12, padding: "3px 9px", borderRadius: 99,
                    background: "var(--canvas)", color: "var(--muted)",
                  }}>
                    {it.finishedProduct.size || productName(it.finishedProduct)}
                    {it.piecesPerSet > 1 && <strong style={{ color: "var(--ink)" }}> ×{it.piecesPerSet}</strong>}
                  </span>
                ))}
              </div>

              {canManage && (
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="secondary" disabled={busyId === s.id}
                    onClick={() => { setMoveCount("1"); setError(""); setMoveFor({ set: s, mode: "build" }); }}
                    style={{ fontSize: 12, padding: "6px 12px" }}>
                    <Package size={13} /> Build
                  </Button>
                  <Button variant="secondary" disabled={busyId === s.id || s.quantity === 0}
                    onClick={() => { setMoveCount("1"); setError(""); setMoveFor({ set: s, mode: "break" }); }}
                    style={{ fontSize: 12, padding: "6px 12px" }}>
                    <Split size={13} /> Break Open
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Build / break */}
      {moveFor && (
        <Modal
          title={moveFor.mode === "build" ? "Build Sets" : "Break Sets Open"}
          subtitle={moveFor.mode === "build"
            ? `${moveFor.set.name} — takes the pieces out of individual stock.`
            : `${moveFor.set.name} — returns every piece to individual stock.`}
          width={400}
          zIndex={300}
          onClose={() => setMoveFor(null)}
          onSubmit={confirmMove}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="primary" type="submit" disabled={busyId === moveFor.set.id} style={{ flex: 1 }}>
                {busyId === moveFor.set.id ? "Working…" : moveFor.mode === "build" ? "Build" : "Break Open"}
              </Button>
              <Button variant="secondary" onClick={() => setMoveFor(null)}>Cancel</Button>
            </div>
          }
        >
          <Field label="How many sets">
            <Input type="number" min="1" value={moveCount} onChange={e => setMoveCount(e.target.value)} />
          </Field>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            {moveFor.set.items.map(it => (
              <div key={it.id}>
                {it.piecesPerSet * (parseInt(moveCount, 10) || 0)} × {it.finishedProduct.sku}
                {it.finishedProduct.size ? ` (${it.finishedProduct.size})` : ""}
                {moveFor.mode === "build" ? " will be taken" : " will come back"}
              </div>
            ))}
          </div>
          {error && <ErrorBanner msg={error} />}
        </Modal>
      )}

      {/* New set */}
      {showNew && (
        <Modal
          title="New Set"
          subtitle="Pick the pieces a set holds. Build now, or leave the count at zero and build later."
          width={620}
          zIndex={300}
          onClose={() => setShowNew(false)}
          onSubmit={createSet}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="primary" type="submit" disabled={saving} style={{ flex: 1 }}>
                {saving ? "Creating…" : "Create Set"}
              </Button>
              <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            </div>
          }
        >
          <Field label="Name *">
            <Input value={form.name} placeholder="e.g. Sherwani set 34-46"
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Item Type *">
              <Select value={form.itemTypeId} onChange={e => setForm(f => ({ ...f, itemTypeId: e.target.value }))}>
                <option value="">Select…</option>
                {itemTypes.filter(t => t.active !== false).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Warehouse *">
              <Select value={form.warehouseId} onChange={e => setForm(f => ({ ...f, warehouseId: e.target.value }))}>
                <option value="">Select…</option>
                {warehouses.filter(w => w.active !== false).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
            <Field label="Build now" hint="Leave 0 to define it only.">
              <Input type="number" min="0" value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            </Field>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", margin: "8px 0", textTransform: "uppercase", letterSpacing: 0.5 }}>
            What the set holds
          </div>
          {lines.map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <Select value={line.productId}
                onChange={e => setLines(ls => ls.map((l, j) => j === i ? { ...l, productId: e.target.value } : l))}>
                <option value="">Select a product…</option>
                {products
                  .filter(p => !form.warehouseId || p.warehouse.id === form.warehouseId)
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {productName(p)}{p.size ? ` · ${p.size}` : ""} — {p.quantity} in stock
                    </option>
                  ))}
              </Select>
              <Input type="number" min="1" value={line.piecesPerSet} title="Pieces per set"
                onChange={e => setLines(ls => ls.map((l, j) => j === i ? { ...l, piecesPerSet: e.target.value } : l))}
                style={{ width: 80, flex: "none" }} />
              <button type="button" aria-label={`Remove line ${i + 1}`}
                onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", color: "var(--muted)", flex: "none", padding: 6 }}>
                <X size={15} />
              </button>
            </div>
          ))}
          <Button variant="secondary" onClick={() => setLines(ls => [...ls, { productId: "", piecesPerSet: "1" }])}
            style={{ fontSize: 12, padding: "5px 10px" }}>
            + Add product
          </Button>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
            The number beside each product is how many of it one set holds — not always one.
          </div>

          {error && <ErrorBanner msg={error} />}
        </Modal>
      )}
    </div>
  );
}
