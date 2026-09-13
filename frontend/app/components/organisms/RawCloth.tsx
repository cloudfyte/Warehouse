"use client";
import { useState } from "react";
import { Pencil, ImageIcon } from "lucide-react";
import { nameToColorHex } from "@/app/lib/colorUtils";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import { RawClothBatch } from "@/app/types";
import Input from "@/app/components/atoms/Input";
import Button from "@/app/components/atoms/Button";
import Modal from "@/app/components/atoms/Modal";
import Textarea from "@/app/components/atoms/Textarea";
import Field from "@/app/components/molecules/Field";
import PhotoPicker from "@/app/components/molecules/PhotoPicker";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";

interface Props {
  batches: RawClothBatch[];
  canManage?: boolean;
  onRefresh?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate?: (q: string, v: Record<string, unknown>) => Promise<any>;
}

const cell: React.CSSProperties = { padding: "11px 14px" };
const HEADS = ["Batch #", "Design #", "Party", "Category", "Color",
               "Total m", "Available m", "Cost/m", "Bin", "Warehouse", "Received", ""];

/** First photo of a batch, for the thumbnail. */
const firstPhoto = (csv?: string) => (csv || "").split(",").map(s => s.trim()).filter(Boolean)[0];

export default function RawCloth({ batches, canManage = false, onRefresh, onMutate }: Props) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<RawClothBatch | null>(null);
  const [form, setForm] = useState({ designNumber: "", clothCode: "", binLocation: "", notes: "", photos: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const q = search.toLowerCase();
  const filtered = batches.filter(b =>
    !q ||
    b.batchNumber?.toLowerCase().includes(q) ||
    (b.designNumber || "").toLowerCase().includes(q) ||
    b.supplier?.name?.toLowerCase().includes(q) ||
    b.clothCategory?.name?.toLowerCase().includes(q) ||
    b.clothColor?.name?.toLowerCase().includes(q) ||
    b.warehouse?.name?.toLowerCase().includes(q)
  );

  function openEdit(b: RawClothBatch) {
    setForm({
      designNumber: b.designNumber || "",
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
        {
          id: editing.id, d: form.designNumber, c: form.clothCode,
          b: form.binLocation, n: form.notes, p: form.photos,
        },
      );
      showToast("Batch updated.", "success");
      setEditing(null);
      onRefresh?.();
    } catch (e: unknown) {
      const msg = friendlyError(e);
      setErr(msg); showToast(msg, "error");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: "0 0 6px" }}>
        Raw Cloth Batches{" "}
        <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 16 }}>({batches.length})</span>
      </h2>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
        Every lot of cloth in the building — who it came from, what design it is, and how much is left.
      </div>
      <input
        placeholder="Search batch, design number, party, category, color or warehouse…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--ink)", fontSize: 14, width: "100%", boxSizing: "border-box", marginBottom: 16 }}
      />
      <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--border)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
              {HEADS.map(h => (
                <th key={h} style={{ padding: "10px 14px", fontWeight: 600, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => {
              const photo = firstPhoto(b.photos);
              return (
                <tr key={b.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ ...cell, fontWeight: 600 }}>{b.batchNumber}</td>
                  <td style={cell}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt="" style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 5, border: "1px solid var(--line)", flexShrink: 0 }} />
                      ) : (
                        <span style={{ width: 30, height: 30, borderRadius: 5, border: "1px dashed var(--line)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <ImageIcon size={13} style={{ color: "var(--muted)" }} />
                        </span>
                      )}
                      <span style={{ fontWeight: 600 }}>{b.designNumber || <span style={{ color: "var(--muted)", fontWeight: 400 }}>—</span>}</span>
                    </div>
                  </td>
                  <td style={cell}>{b.supplier?.name || "—"}</td>
                  <td style={cell}>{b.clothCategory?.name}</td>
                  <td style={cell}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {b.clothColor && <span style={{ width: 12, height: 12, borderRadius: 3, background: nameToColorHex(b.clothColor.name, b.clothColor.hexCode), display: "inline-block", flexShrink: 0 }} />}
                      {b.clothColor?.name}
                    </div>
                  </td>
                  <td style={cell}>{b.totalMeters}m</td>
                  <td style={{ ...cell, fontWeight: 700, color: b.availableMeters < 5 ? "#f44336" : "inherit" }}>{b.availableMeters}m</td>
                  <td style={cell}>₹{b.costPerMeter}</td>
                  <td style={{ ...cell, fontSize: 12, color: "var(--muted)" }}>{b.binLocation || "—"}</td>
                  <td style={cell}>{b.warehouse?.name}</td>
                  <td style={{ ...cell, fontSize: 12 }}>{b.receivedDate ? new Date(b.receivedDate).toLocaleDateString("en-IN") : "—"}</td>
                  <td style={cell}>
                    {canManage && onMutate && (
                      <button type="button" onClick={() => openEdit(b)} aria-label={`Edit ${b.batchNumber}`}
                        style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4 }}>
                        <Pencil size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={HEADS.length} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                  {batches.length === 0
                    ? "No raw cloth batches. Receive a Purchase Order, or record a supplier invoice, to add cloth stock."
                    : "No batches match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal
          title={editing.batchNumber}
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
              hint="This cloth's one code — unique in this warehouse.">
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
          <Field label="Photos" hint="A picture of the shade. Far easier to match a roll against than a colour name.">
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
