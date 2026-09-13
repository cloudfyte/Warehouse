"use client";
import { useState } from "react";
import { Pencil, Scissors } from "lucide-react";
import type { Karigar } from "@/app/types";
import { formatMoney } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Button from "@/app/components/atoms/Button";
import Modal from "@/app/components/atoms/Modal";
import Textarea from "@/app/components/atoms/Textarea";
import Field from "@/app/components/molecules/Field";
import PageHeader from "@/app/components/molecules/PageHeader";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";

interface Props {
  karigars: Karigar[];
  canManage: boolean;
  onRefresh?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>;
}

const BLANK = { name: "", kind: "OUTSIDE", ratePerPiece: "", phone: "", whatsapp: "", city: "", address: "", notes: "" };
const cell: React.CSSProperties = { padding: "11px 14px" };

/**
 * The people and units that stitch, paid by the piece.
 *
 * Not staff. An outside unit has no login here, charges per garment, and may
 * be in another city entirely — cloth bought in Surat can be stitched in
 * Mumbai and arrive at the godown only as finished garments.
 */
export default function Karigars({ karigars, canManage, onRefresh, onMutate }: Props) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Karigar | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const q = search.toLowerCase();
  const shown = karigars.filter(k =>
    !q || k.name.toLowerCase().includes(q) || (k.city || "").toLowerCase().includes(q));

  function open(k: Karigar | null) {
    setForm(k
      ? { name: k.name, kind: k.kind, ratePerPiece: String(k.ratePerPiece ?? ""), phone: k.phone || "",
          whatsapp: k.whatsapp || "", city: k.city || "", address: k.address || "", notes: "" }
      : { ...BLANK });
    setEditing(k); setCreating(!k); setErr("");
  }

  async function save() {
    setSaving(true); setErr("");
    const vars = {
      id: editing?.id,
      name: form.name.trim(), kind: form.kind,
      rate: form.ratePerPiece === "" ? 0 : +form.ratePerPiece,
      phone: form.phone, whatsapp: form.whatsapp, city: form.city, address: form.address,
    };
    try {
      await onMutate(
        editing
          ? `mutation U($id:ID!,$name:String,$kind:String,$rate:Float,$phone:String,$whatsapp:String,$city:String,$address:String){`
            + `updateKarigar(id:$id,name:$name,kind:$kind,ratePerPiece:$rate,phone:$phone,whatsapp:$whatsapp,city:$city,address:$address){karigar{id}}}`
          : `mutation C($name:String!,$kind:String,$rate:Float,$phone:String,$whatsapp:String,$city:String,$address:String){`
            + `createKarigar(name:$name,kind:$kind,ratePerPiece:$rate,phone:$phone,whatsapp:$whatsapp,city:$city,address:$address){karigar{id}}}`,
        vars,
      );
      showToast(editing ? "Karigar updated." : "Karigar added.", "success");
      setEditing(null); setCreating(false);
      onRefresh?.();
    } catch (e: unknown) {
      const msg = friendlyError(e);
      setErr(msg); showToast(msg, "error");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Karigars"
        sub="Who stitches, and what they charge a piece"
        actions={canManage && <Button onClick={() => open(null)}><Scissors size={14} /> Add Karigar</Button>}
      />
      <Input placeholder="Search name or city…" value={search}
        onChange={e => setSearch(e.target.value)} style={{ marginBottom: 14 }} />

      <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--border)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
              {["Name", "Kind", "Where", "Rate / piece", "Phone", ""].map(h => (
                <th key={h} style={{ padding: "10px 14px", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(k => (
              <tr key={k.id} style={{ borderBottom: "1px solid var(--border)", opacity: k.active === false ? 0.5 : 1 }}>
                <td style={{ ...cell, fontWeight: 600 }}>{k.name}</td>
                <td style={cell}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                    background: k.kind === "IN_HOUSE" ? "#e8f5e9" : "#ede9fe",
                    color: k.kind === "IN_HOUSE" ? "#2e7d32" : "#6d28d9",
                  }}>
                    {k.kind === "IN_HOUSE" ? "In-house" : "Outside"}
                  </span>
                </td>
                <td style={cell}>{k.city || "—"}</td>
                <td style={{ ...cell, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatMoney(k.ratePerPiece)}</td>
                <td style={{ ...cell, fontSize: 13 }}>{k.phone || "—"}</td>
                <td style={cell}>
                  {canManage && (
                    <button type="button" onClick={() => open(k)} aria-label={`Edit ${k.name}`}
                      style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4 }}>
                      <Pencil size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                {karigars.length === 0 ? "No karigars yet." : "None match that search."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <Modal
          title={editing ? editing.name : "Add Karigar"}
          subtitle="Paid by the piece. An outside unit needs no login here."
          width={520}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSubmit={save}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <Button type="submit" disabled={saving || !form.name.trim()} style={{ flex: 1 }}>
              {saving ? "Saving…" : editing ? "Save" : "Add"}
            </Button>
            <Button variant="secondary" onClick={() => { setEditing(null); setCreating(false); }}>Cancel</Button>
          </div>}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Name" required>
              <Input value={form.name} autoFocus placeholder="e.g. Mumbai Unit A"
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Kind">
              <Select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}>
                <option value="OUTSIDE">Outside unit</option>
                <option value="IN_HOUSE">In-house</option>
              </Select>
            </Field>
            <Field label="Rate per piece" hint="The usual rate. A job can still agree its own.">
              <Input type="number" min="0" step="0.01" value={form.ratePerPiece} placeholder="0.00"
                onChange={e => setForm(f => ({ ...f, ratePerPiece: e.target.value }))} />
            </Field>
            <Field label="City" hint="Where the work is done.">
              <Input value={form.city} placeholder="e.g. Mumbai"
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </Field>
            <Field label="WhatsApp">
              <Input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} />
            </Field>
          </div>
          <Field label="Address">
            <Textarea value={form.address} rows={2}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </Field>
          {editing && (
            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.55 }}>
              Changing the rate sets what the next job costs. Jobs already handed out keep
              the rate they were agreed at.
            </div>
          )}
          {err && <ErrorBanner msg={err} />}
        </Modal>
      )}
    </div>
  );
}
