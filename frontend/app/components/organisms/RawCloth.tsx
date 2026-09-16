"use client";
import { useMemo, useState } from "react";
import { Pencil, AlertTriangle } from "lucide-react";
import { nameToColorHex } from "@/app/lib/colorUtils";
import { formatMoney } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import { RawClothBatch } from "@/app/types";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Button from "@/app/components/atoms/Button";
import Modal from "@/app/components/atoms/Modal";
import Textarea from "@/app/components/atoms/Textarea";
import Field from "@/app/components/molecules/Field";
import PhotoPicker from "@/app/components/molecules/PhotoPicker";
import PhotoViewer from "@/app/components/molecules/PhotoViewer";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";

interface Props {
  batches: RawClothBatch[];
  canManage?: boolean;
  onRefresh?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate?: (q: string, v: Record<string, unknown>) => Promise<any>;
}

const num = (v: unknown) => Number(v ?? 0);

/** One labelled fact. Named rather than run into a sentence, so the eye can
 *  jump straight to the party or the rate without reading the whole line. */
function Cell({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value || "—"}
      </div>
    </div>
  );
}

/**
 * Raw cloth, read the way somebody on the floor asks about it.
 *
 * The question is almost never "tell me about batch RCB-202609-0011". It is
 * "how much daman design have we got", or "what is left of the cream", and the
 * answer is a total — so the totals sit at the top and follow whatever has
 * been filtered rather than making anyone add columns up by eye.
 *
 * Twelve columns in a sideways-scrolling table could not answer that, and hid
 * the warehouse off the right-hand edge while it failed to.
 */
export default function RawCloth({ batches, canManage = false, onRefresh, onMutate }: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [editing, setEditing] = useState<RawClothBatch | null>(null);
  const [form, setForm] = useState({ designNumber: "", clothCode: "", binLocation: "", notes: "", photos: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const categories = useMemo(
    () => [...new Set(batches.map(b => b.clothCategory?.name).filter(Boolean))].sort() as string[],
    [batches]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return batches.filter(b =>
      (!category || b.clothCategory?.name === category)
      && (!onlyLow || num(b.availableMeters) < 10)
      && (!q
          || (b.designNumber || "").toLowerCase().includes(q)
          || b.batchNumber?.toLowerCase().includes(q)
          || b.supplier?.name?.toLowerCase().includes(q)
          || b.clothCategory?.name?.toLowerCase().includes(q)
          || b.clothColor?.name?.toLowerCase().includes(q)
          || b.warehouse?.name?.toLowerCase().includes(q)));
  }, [batches, search, category, onlyLow]);

  const totals = useMemo(() => shown.reduce((a, b) => ({
    total: a.total + num(b.totalMeters),
    available: a.available + num(b.availableMeters),
    value: a.value + num(b.availableMeters) * num(b.costPerMeter),
  }), { total: 0, available: 0, value: 0 }), [shown]);

  const needNumbers = batches.filter(b => b.designNumberProvisional).length;
  const metres = (v: number) => `${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}m`;

  function openEdit(b: RawClothBatch) {
    setForm({
      // A placeholder starts the box empty. Pre-filling it invites editing
      // around the system's guess instead of typing the mill's real number.
      designNumber: b.designNumberProvisional ? "" : (b.designNumber || ""),
      clothCode: b.clothCode || "",
      binLocation: b.binLocation || "",
      notes: b.notes || "",
      photos: b.photos || "",
    });
    setErr(""); setEditing(b);
  }

  async function save() {
    if (!editing || !onMutate) return;
    setSaving(true); setErr("");
    try {
      await onMutate(
        `mutation U($id:ID!,$d:String,$c:String,$b:String,$n:String,$p:String){`
        + `updateRawClothBatch(id:$id,designNumber:$d,clothCode:$c,binLocation:$b,notes:$n,photos:$p)`
        + `{batch{id designNumber clothCode binLocation notes photos}}}`,
        { id: editing.id, d: form.designNumber, c: form.clothCode,
          b: form.binLocation, n: form.notes, p: form.photos },
      );
      showToast("Batch updated.", "success");
      setEditing(null); onRefresh?.();
    } catch (e: unknown) {
      const msg = friendlyError(e); setErr(msg); showToast(msg, "error");
    } finally { setSaving(false); }
  }

  const narrowed = !!(search.trim() || category || onlyLow);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>Raw Cloth</h2>
        <div style={{ fontSize: 14, color: "var(--muted)" }}>
          Every lot in the building — what design it is, whose it was, and how much is left.
        </div>
      </div>

      {/* The answer to "how much have we got", following whatever is filtered. */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 1,
        background: "var(--line)", border: "1px solid var(--line)", borderRadius: 14,
        overflow: "hidden", marginBottom: 14,
      }}>
        {([
          ["Lots", String(shown.length), undefined],
          ["Available", metres(totals.available), "var(--primary)"],
          ["Received in total", metres(totals.total), undefined],
          ["Stock value", formatMoney(totals.value), undefined],
        ] as const).map(([label, value, color]) => (
          <div key={label} style={{ background: "var(--paper)", padding: "15px 18px" }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>
              {label}
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
        <Input placeholder="Design number, party, colour, category…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        <Select value={category} onChange={e => setCategory(e.target.value)} style={{ width: 190 }}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <button type="button" onClick={() => setOnlyLow(v => !v)}
          style={{
            padding: "0 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${onlyLow ? "#e65100" : "var(--line)"}`,
            background: onlyLow ? "#fff3e0" : "var(--canvas)",
            color: onlyLow ? "#e65100" : "var(--muted)",
          }}>
          Running out
        </button>
      </div>

      {needNumbers > 0 && (
        <div style={{
          display: "flex", gap: 9, alignItems: "center", padding: "9px 12px",
          borderRadius: 10, background: "#f59e0b12", border: "1px solid #f59e0b40",
          fontSize: 12, marginBottom: 14, color: "var(--ink)",
        }}>
          <AlertTriangle size={14} style={{ flex: "none", color: "#b45309" }} />
          <span>
            <strong>{needNumbers}</strong> lot{needNumbers === 1 ? "" : "s"} recorded before design
            numbers existed. Open one to enter the mill&apos;s real number.
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {shown.length === 0 ? (
          <div style={{
            border: "1px dashed var(--line)", borderRadius: 12, padding: "44px 20px",
            textAlign: "center", color: "var(--muted)", fontSize: 13,
          }}>
            {batches.length === 0
              ? "No cloth yet. Receive a purchase order, or record a supplier invoice."
              : "Nothing matches."}
          </div>
        ) : shown.map(b => {
          const swatch = b.clothColor ? nameToColorHex(b.clothColor.name, b.clothColor.hexCode) : null;
          const available = num(b.availableMeters);
          const total = num(b.totalMeters);
          const pct = total > 0 ? Math.max(0, Math.min(100, (available / total) * 100)) : 0;
          const low = available < 10;

          return (
            <div key={b.id} style={{
              display: "grid",
              // The facts get columns of their own rather than being crushed
              // into one muted line that truncates while the row sits half empty.
              // Minimums sum to ~830 with the gaps, so it still fits a 1280
              // laptop with the sidebar open rather than scrolling sideways again.
              gridTemplateColumns: "64px minmax(160px,1.4fr) minmax(115px,1fr) minmax(95px,0.8fr) 90px 175px 36px",
              gap: 16, alignItems: "center",
              border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px",
              background: "var(--paper)",
            }}>
              <PhotoViewer value={b.photos} size={64} tint={swatch} alt={b.designNumber || b.batchNumber} />

              <div style={{ minWidth: 0 }}>
                {b.designNumberProvisional ? (
                  <span style={{ fontSize: 12.5, fontWeight: 700, padding: "3px 10px", borderRadius: 7, background: "#fff3e0", color: "#b45309" }}>
                    no design number
                  </span>
                ) : (
                  <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.2 }}>
                    {b.designNumber}
                  </div>
                )}
                {b.clothColor && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 7, marginTop: 6,
                    padding: "3px 11px 3px 4px", borderRadius: 99,
                    background: "var(--canvas)", border: "1px solid var(--line)", fontSize: 13,
                  }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                      background: swatch ?? "transparent", border: "1px solid rgba(0,0,0,.18)",
                    }} />
                    {b.clothColor.name}
                  </span>
                )}
              </div>

              <Cell label="Party" value={b.supplier?.name} />
              <Cell label="Category" value={b.clothCategory?.name} />
              <Cell label="Rate" value={`${formatMoney(b.costPerMeter)}/m`} />

              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, justifyContent: "flex-end" }}>
                  <span style={{
                    fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                    color: low ? "#d32f2f" : "var(--ink)", letterSpacing: -0.5, lineHeight: 1.1,
                  }}>
                    {metres(available)}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>of {metres(total)}</span>
                </div>
                {/* How much of this lot is still on the shelf, at a glance. */}
                <div style={{ height: 5, borderRadius: 99, background: "var(--line)", marginTop: 7, overflow: "hidden" }}>
                  <div style={{
                    width: `${pct}%`, height: "100%", borderRadius: 99,
                    background: low ? "#d32f2f" : "var(--primary)",
                  }} />
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 5, textAlign: "right" }}>
                  {b.binLocation ? `bin ${b.binLocation} · ` : ""}{b.warehouse?.name}
                  <span style={{ fontFamily: "monospace", opacity: 0.7 }}> · {b.batchNumber}</span>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                {canManage && onMutate && (
                  <button type="button" onClick={() => openEdit(b)} aria-label={`Edit ${b.designNumber || b.batchNumber}`}
                    style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 8 }}>
                    <Pencil size={17} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <Modal
          title={editing.designNumberProvisional
            ? "Give this cloth its design number"
            : (editing.designNumber || editing.batchNumber)}
          subtitle={[editing.supplier?.name, editing.clothCategory?.name, editing.clothColor?.name]
            .filter(Boolean).join(" · ")}
          width={520}
          onClose={() => setEditing(null)}
          onSubmit={save}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="primary" type="submit" disabled={saving || !form.designNumber.trim()} style={{ flex: 1 }}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Design number" required
              hint={editing.designNumberProvisional
                ? "The mill's number. What was here is a placeholder the system put in."
                : "This cloth's one code — unique in this warehouse."}>
              <Input value={form.designNumber} placeholder="e.g. 4472" autoFocus
                onChange={e => setForm(f => ({ ...f, designNumber: e.target.value }))} />
            </Field>
            <Field label="Fabric code" hint="Typed by hand — nothing is generated for you.">
              <Input value={form.clothCode} placeholder="e.g. K7200"
                onChange={e => setForm(f => ({ ...f, clothCode: e.target.value }))} />
            </Field>
          </div>
          <Field label="Bin / shelf">
            <Input value={form.binLocation} placeholder="e.g. A-3"
              onChange={e => setForm(f => ({ ...f, binLocation: e.target.value }))} />
          </Field>
          <Field label="Photos" hint="A picture of the shade — far easier to match a roll against than a colour name.">
            <PhotoPicker value={form.photos} onChange={v => setForm(f => ({ ...f, photos: v }))} max={4} />
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} rows={2}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
          {err && <ErrorBanner msg={err} />}
        </Modal>
      )}
    </div>
  );
}
