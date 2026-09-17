"use client";
import { useMemo, useState } from "react";
import { ChevronRight, Pencil } from "lucide-react";
import type { CustomerBillStatus, FinishedProduct } from "@/app/types";
import { formatDateShort, formatMoney, productName } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Input from "@/app/components/atoms/Input";
import Button from "@/app/components/atoms/Button";
import Modal from "@/app/components/atoms/Modal";
import Textarea from "@/app/components/atoms/Textarea";
import Field from "@/app/components/molecules/Field";
import PageHeader from "@/app/components/molecules/PageHeader";
import PhotoPicker from "@/app/components/molecules/PhotoPicker";
import CustomerBill from "@/app/components/molecules/CustomerBill";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";

interface Props {
  bills: CustomerBillStatus[];
  /** Made, tagged, and waiting for the person whose bill it is. */
  ready: FinishedProduct[];
  canManage: boolean;
  onRefresh?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>;
}

const STAGE: Record<string, { bg: string; fg: string; label: string; says: string }> = {
  NOT_STARTED: { bg: "#f1f5f9", fg: "#64748b", label: "Not started", says: "Nothing has been cut for this yet." },
  CUTTING:     { bg: "#fff3e0", fg: "#e65100", label: "Being cut",   says: "The cloth is with the cutting master." },
  STITCHING:   { bg: "#ede9fe", fg: "#6d28d9", label: "Stitching",   says: "The pieces are with the karigar." },
  READY:       { bg: "#e8f5e9", fg: "#2e7d32", label: "Ready",       says: "Made and waiting to be collected." },
  COLLECTED:   { bg: "#e3f2fd", fg: "#1565c0", label: "Collected",   says: "The customer has it." },
};

const ORDER = ["NOT_STARTED", "CUTTING", "STITCHING", "READY", "COLLECTED"];

/**
 * Every written bill, and where its garment has actually got to.
 *
 * "Is my order ready?" is what somebody rings up and asks. Answering it used
 * to mean going through cutting, then stitching, then finished goods — so this
 * is that walk, done once, with the answer at the front.
 */
export default function CustomerBills({ bills, ready, canManage, onRefresh, onMutate }: Props) {
  // Handing the garment over is the last step of this bill, not a screen of
  // its own — the customer is standing here asking about this bill.
  const [handing, setHanding] = useState<FinishedProduct | null>(null);
  const [hand, setHand] = useState({ to: "", quantity: "" });
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<CustomerBillStatus | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", photos: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const readyByBill = useMemo(() => {
    const map = new Map<string, FinishedProduct[]>();
    for (const p of ready) {
      const key = (p.customerBillNumber || p.customerOrder?.billNumber || "").trim().toLowerCase();
      if (!key) continue;
      map.set(key, [...(map.get(key) || []), p]);
    }
    return map;
  }, [ready]);

  async function handOver() {
    if (!handing) return;
    setBusy(true); setErr("");
    try {
      await onMutate(
        `mutation H($id:ID!,$to:String,$qty:Int){handOverReadymade(id:$id,handedOverTo:$to,quantity:$qty){finishedProduct{id}}}`,
        { id: handing.id, to: hand.to || undefined, qty: hand.quantity === "" ? undefined : +hand.quantity },
      );
      showToast("Handed over.", "success");
      setHanding(null); setHand({ to: "", quantity: "" });
      onRefresh?.();
    } catch (e: unknown) {
      const msg = friendlyError(e); setErr(msg); showToast(msg, "error");
    } finally { setBusy(false); }
  }

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bills.filter(b =>
      (!stageFilter || b.stage === stageFilter)
      && (!q
          || b.order.billNumber.toLowerCase().includes(q)
          || (b.order.customerName || "").toLowerCase().includes(q)
          || (b.order.customerPhone || "").includes(q)));
  }, [bills, search, stageFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of bills) c[b.stage] = (c[b.stage] ?? 0) + 1;
    return c;
  }, [bills]);

  async function save() {
    if (!editing) return;
    setBusy(true); setErr("");
    try {
      await onMutate(
        `mutation U($id:ID!,$n:String,$p:String,$photos:String,$notes:String){`
        + `updateCustomerOrder(id:$id,customerName:$n,customerPhone:$p,billPhotos:$photos,notes:$notes)`
        + `{order{id}}}`,
        { id: editing.order.id, n: form.name, p: form.phone, photos: form.photos, notes: form.notes },
      );
      showToast("Bill updated.", "success");
      setEditing(null); onRefresh?.();
    } catch (e: unknown) {
      const msg = friendlyError(e); setErr(msg); showToast(msg, "error");
    } finally { setBusy(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Customer Orders" sub="Made-to-measure work, and where each bill has got to" />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {ORDER.filter(k => counts[k]).map(k => {
          const st = STAGE[k];
          const on = stageFilter === k;
          return (
            <button key={k} type="button"
              onClick={() => setStageFilter(on ? "" : k)}
              style={{
                padding: "7px 14px", borderRadius: 99, fontSize: 12, fontWeight: 700,
                border: on ? `1px solid ${st.fg}` : "1px solid transparent",
                background: st.bg, color: st.fg, cursor: "pointer",
              }}>
              {st.label} · {counts[k]}
            </button>
          );
        })}
      </div>

      <Input placeholder="Search bill number, customer or phone…" value={search}
        onChange={e => setSearch(e.target.value)} style={{ marginBottom: 14 }} />

      <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
        {shown.length === 0 ? (
          <div style={{ padding: "44px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13, lineHeight: 1.7 }}>
            {bills.length === 0
              ? <>No made-to-measure orders yet. A bill appears here the moment cloth is cut
                  against it — wholesale work never does, because nobody is waiting for it.</>
              : "Nothing matches."}
          </div>
        ) : shown.map(b => {
          const st = STAGE[b.stage] ?? STAGE.NOT_STARTED;
          const isOpen = open.has(b.order.id);
          return (
            <div key={b.order.id} style={{ borderTop: "1px solid var(--line)" }}>
              <button type="button"
                onClick={() => setOpen(o => {
                  const next = new Set(o);
                  if (next.has(b.order.id)) next.delete(b.order.id); else next.add(b.order.id);
                  return next;
                })}
                style={{
                  display: "grid", width: "100%",
                  gridTemplateColumns: "minmax(200px,2fr) minmax(140px,1fr) 110px 22px",
                  gap: 12, alignItems: "center", padding: "12px 16px",
                  background: isOpen ? "var(--canvas)" : "transparent",
                  border: "none", textAlign: "left", color: "var(--ink)", cursor: "pointer",
                }}>
                <span style={{ minWidth: 0 }}>
                  <CustomerBill order={b.order} />
                </span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {b.piecesReady > 0 && <><strong style={{ color: "#2e7d32" }}>{b.piecesReady}</strong> ready </>}
                  {b.piecesCollected > 0 && <>· {b.piecesCollected} collected</>}
                </span>
                <span style={{
                  padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: st.bg, color: st.fg, textAlign: "center", whiteSpace: "nowrap",
                }}>{st.label}</span>
                <ChevronRight size={14} style={{
                  color: "var(--muted)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .12s",
                }} />
              </button>

              {isOpen && (
                <div style={{ padding: "0 16px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {st.says}
                    {b.order.createdAt && <> Booked {formatDateShort(b.order.createdAt)}.</>}
                  </div>

                  {b.cuttingAssignments.map(c => (
                    <div key={c.id} style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "9px 12px", fontSize: 12 }}>
                      <strong>Cutting {c.assignmentNumber}</strong> · {c.itemType.name}
                      {c.cuttingMaster ? ` · ${c.cuttingMaster.username}` : ""}
                      {" · "}{c.piecesCompleted}/{c.targetPieces} pieces
                      {c.status === "COMPLETED" ? " · done" : ""}
                    </div>
                  ))}
                  {b.stitchingJobs.map(j => (
                    <div key={j.id} style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "9px 12px", fontSize: 12 }}>
                      <strong>Stitching {j.jobNumber}</strong>
                      {j.karigar ? ` · ${j.karigar.name}${j.karigar.city ? ` (${j.karigar.city})` : ""}` : ""}
                      {" · "}{j.piecesCompleted}/{j.piecesAssigned} pieces
                    </div>
                  ))}
                  {b.jobworkOrders.map(o => (
                    <div key={o.id} style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "9px 12px", fontSize: 12 }}>
                      <strong>Outside job {o.orderNumber}</strong> · {o.itemType.name} · {o.karigar.name}
                      {o.karigar.city ? ` (${o.karigar.city})` : ""}
                      {" · "}{o.piecesReceived}/{o.piecesExpected} back
                    </div>
                  ))}

                  {(readyByBill.get(b.order.billNumber.trim().toLowerCase()) || []).map(p => (
                    <div key={p.id} style={{
                      border: "1px solid #c8e6c9", background: "#f1f8f2", borderRadius: 9,
                      padding: "10px 12px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
                    }}>
                      <strong style={{ fontSize: 14 }}>{productName(p)}</strong>
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>
                        {p.size ? `size ${p.size} · ` : ""}{p.quantity} ready · {formatMoney(p.salePrice)}
                      </span>
                      {canManage && (
                        <Button size="sm" style={{ marginLeft: "auto" }}
                          onClick={() => { setHand({ to: b.order.customerName || "", quantity: String(p.quantity) }); setErr(""); setHanding(p); }}>
                          Hand over
                        </Button>
                      )}
                    </div>
                  ))}

                  {b.order.notes && (
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{b.order.notes}</div>
                  )}
                  {canManage && (
                    <div>
                      <Button size="sm" variant="secondary"
                        onClick={() => {
                          setForm({
                            name: b.order.customerName || "", phone: b.order.customerPhone || "",
                            photos: b.order.billPhotos || "", notes: b.order.notes || "",
                          });
                          setErr(""); setEditing(b);
                        }}>
                        <Pencil size={13} /> Edit bill
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <Modal
          title={editing.order.billNumber}
          subtitle="Correct a misheard name, or add a page photographed later."
          width={480}
          onClose={() => setEditing(null)}
          onSubmit={save}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <Button type="submit" disabled={busy} style={{ flex: 1 }}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          </div>}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Customer name">
              <Input value={form.name} autoFocus
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </Field>
          </div>
          <Field label="Photo of the written bill"
            hint="Replaces what is here — keep the existing pages if you are adding one.">
            <PhotoPicker value={form.photos} onChange={v => setForm(f => ({ ...f, photos: v }))} max={6} />
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} rows={2}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
          {err && <ErrorBanner msg={err} />}
        </Modal>
      )}
    {handing && (
        <Modal title="Hand over" subtitle={productName(handing)}
          width={420} onClose={() => setHanding(null)} onSubmit={handOver}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <Button type="submit" disabled={busy} style={{ flex: 1 }}>{busy ? "Saving…" : "Handed over"}</Button>
            <Button variant="secondary" onClick={() => setHanding(null)}>Cancel</Button>
          </div>}>
          <Field label="Given to" hint="Who actually collected it.">
            <Input value={hand.to} onChange={e => setHand(h => ({ ...h, to: e.target.value }))} />
          </Field>
          <Field label="How many pieces" style={{ marginTop: 10 }}>
            <Input type="number" min="1" max={handing.quantity} value={hand.quantity}
              onChange={e => setHand(h => ({ ...h, quantity: e.target.value }))} />
          </Field>
          {err && <ErrorBanner msg={err} />}
        </Modal>
      )}
    </div>
  );
}
