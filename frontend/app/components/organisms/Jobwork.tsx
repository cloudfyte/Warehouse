"use client";
import { useState } from "react";
import { Truck, PackageCheck, X } from "lucide-react";
import type { JobworkOrder } from "@/app/types";
import { formatDateShort, formatMoney } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Input from "@/app/components/atoms/Input";
import Button from "@/app/components/atoms/Button";
import Modal from "@/app/components/atoms/Modal";
import Field from "@/app/components/molecules/Field";
import PageHeader from "@/app/components/molecules/PageHeader";
import PhotoPicker from "@/app/components/molecules/PhotoPicker";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import CustomerBill from "@/app/components/molecules/CustomerBill";

interface Props {
  orders: JobworkOrder[];
  canManage: boolean;
  onRefresh?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>;
}

const STATUS: Record<string, { bg: string; fg: string; label: string }> = {
  SENT:      { bg: "#fff3e0", fg: "#e65100", label: "Cloth sent" },
  PARTIAL:   { bg: "#e3f2fd", fg: "#1565c0", label: "Partly back" },
  RECEIVED:  { bg: "#e8f5e9", fg: "#2e7d32", label: "Received" },
  CANCELLED: { bg: "#f1f5f9", fg: "#64748b", label: "Cancelled" },
};

/**
 * Whole jobs given to an outside handler.
 *
 * The in-house path is cloth into the godown, an employed cutting master, then
 * a karigar. This is the other one: the supplier ships cloth straight to a unit
 * in another city that cuts and stitches it and sends garments back. The cloth
 * never touches a godown, so there is no batch and no cutting docket — one
 * order, and pieces that turn up at the end of it.
 */
export default function Jobwork({
  orders, canManage, onRefresh, onMutate,
}: Props) {
  const [receiving, setReceiving] = useState<JobworkOrder | null>(null);
  // A job born at the purchase has no size split yet — nobody knew it the day
  // the cloth was bought. It gets counted here, when the garments turn up.
  const [adhoc, setAdhoc] = useState<{ size: string; pieces: string }[]>([]);
  const [back, setBack] = useState<Record<string, string>>({});
  const [backPrice, setBackPrice] = useState("");
  const [backLeg, setBackLeg] = useState({ transporter: "", lr: "", vehicle: "", photos: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const owed = orders.reduce((t, o) => t + (o.amountDue || 0), 0);
  const out = orders.filter(o => o.status === "SENT" || o.status === "PARTIAL")
    .reduce((t, o) => t + (o.piecesExpected - o.piecesReceived), 0);

  function openReceive(o: JobworkOrder) {
    setBack(Object.fromEntries(o.sizes.map(z => [z.size, String(z.piecesReceived || "")])));
    setAdhoc(o.sizes.length ? [] : [{ size: "", pieces: "" }]);
    setBackPrice(""); setBackLeg({ transporter: "", lr: "", vehicle: "", photos: "" });
    setErr(""); setReceiving(o);
  }

  async function receive() {
    if (!receiving) return;
    setBusy(true); setErr("");
    try {
      await onMutate(
        `mutation R($id:ID!,$sizes:[JobworkSizeInput!]!,$price:Float,$t:String,$lr:String,$v:String,$p:String){`
        + `receiveJobwork(id:$id,sizes:$sizes,salePrice:$price,returnTransporter:$t,`
        + `returnLrNumber:$lr,returnVehicleNumber:$v,returnPhotos:$p){order{id status}}}`,
        {
          id: receiving.id,
          sizes: receiving.sizes.length
            ? receiving.sizes.map(z => ({ size: z.size, received: +(back[z.size] || 0) }))
            : adhoc.filter(r => r.size.trim() && +r.pieces > 0)
                   .map(r => ({ size: r.size.trim(), received: +r.pieces })),
          price: backPrice === "" ? undefined : +backPrice,
          t: backLeg.transporter || undefined, lr: backLeg.lr || undefined,
          v: backLeg.vehicle || undefined, p: backLeg.photos || undefined,
        },
      );
      showToast(backPrice ? "Received and put into stock." : "Received.", "success");
      setReceiving(null); onRefresh?.();
    } catch (e: unknown) {
      const msg = friendlyError(e); setErr(msg); showToast(msg, "error");
    } finally { setBusy(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Outside Jobs"
        sub="Cloth railed straight from the supplier to a unit that cuts and stitches it"
      />

      <div style={{
        display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline",
        padding: "10px 14px", border: "1px solid var(--line)", borderRadius: 10,
        marginBottom: 14, fontSize: 13,
      }}>
        <span><strong style={{ fontSize: 16 }}>{orders.filter(o => o.status === "SENT" || o.status === "PARTIAL").length}</strong> open</span>
        <span><strong style={{ fontSize: 16 }}>{out}</strong> pieces awaited</span>
        {owed > 0 && <span style={{ color: "#e65100" }}><strong style={{ fontSize: 16 }}>{formatMoney(owed)}</strong> owed to units</span>}
        <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12 }}>
          <Truck size={12} style={{ verticalAlign: -1 }} /> A job starts on the purchase bill — mark the cloth as going to a unit.
        </span>
      </div>

      <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
        {orders.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            No outside jobs yet. On a purchase bill, set a cloth line to go to a stitching
            unit instead of the godown and the job opens itself here.
          </div>
        ) : orders.map(o => {
          const st = STATUS[o.status] ?? STATUS.SENT;
          return (
            <div key={o.id} style={{ borderTop: "1px solid var(--line)", padding: "12px 16px" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{o.orderNumber}</span>
                <span style={{ fontSize: 13 }}>{o.karigar.name}</span>
                {o.karigar.city && <span style={{ fontSize: 12, color: "var(--muted)" }}>{o.karigar.city}</span>}
                {o.designNumber && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "var(--canvas)" }}>
                    Design {o.designNumber}
                  </span>
                )}
                {o.jobType === "READYMADE" && (
                  <CustomerBill order={o.customerOrder} billNumber={o.customerBillNumber} compact />
                )}
                <span style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: st.bg, color: st.fg }}>
                  {st.label}
                </span>
              </div>

              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                {o.itemType.name} · {o.piecesReceived}/{o.piecesExpected} back · sent {formatDateShort(o.sentDate)}
                {o.sentLrNumber ? ` · out on ${o.sentLrNumber}` : ""}
                {o.returnLrNumber ? ` · back on ${o.returnLrNumber}` : ""}
                {" → "}{o.receiveWarehouse.name}
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                {o.sizes.map(z => (
                  <span key={z.id} style={{
                    fontSize: 11, padding: "3px 9px", borderRadius: 7,
                    border: "1px solid var(--line)", background: "var(--canvas)", fontVariantNumeric: "tabular-nums",
                  }}>
                    <strong>{z.size}</strong> {z.piecesReceived}/{z.piecesExpected}
                  </span>
                ))}
              </div>

              <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 8, fontSize: 12, flexWrap: "wrap" }}>
                <span style={{ color: "var(--muted)" }}>
                  {formatMoney(o.ratePerPiece)}/pc · cloth {formatMoney(o.clothCost)}
                </span>
                {o.amountEarned > 0 && (
                  <span>
                    Earned <strong>{formatMoney(o.amountEarned)}</strong>
                    {o.amountDue > 0
                      ? <span style={{ color: "#e65100" }}> · {formatMoney(o.amountDue)} to pay</span>
                      : <span style={{ color: "#2e7d32" }}> · settled</span>}
                  </span>
                )}
                {canManage && o.status !== "RECEIVED" && o.status !== "CANCELLED" && (
                  <Button size="sm" variant="secondary" onClick={() => openReceive(o)}>
                    <PackageCheck size={13} /> Receive
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {receiving && (
        <Modal title={`Receive ${receiving.orderNumber}`}
          subtitle={`${receiving.karigar.name} · ${receiving.itemType.name}`}
          width={560} onClose={() => setReceiving(null)} onSubmit={receive}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <Button type="submit" disabled={busy} style={{ flex: 1 }}>
              {busy ? "Receiving…" : "Receive"}
            </Button>
            <Button variant="secondary" onClick={() => setReceiving(null)}>Cancel</Button>
          </div>}>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12 }}>
            Count what actually came back. The unit is paid for what it sent, so a short
            delivery is a short delivery.
          </div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", gap: 8, padding: "8px 12px", background: "var(--canvas)", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
              <span>Size</span><span>{receiving.sizes.length ? "Sent out" : ""}</span><span>Came back</span>
            </div>
            {receiving.sizes.map(z => (
              <div key={z.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", gap: 8, padding: "7px 12px", alignItems: "center", borderTop: "1px solid var(--line)" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{z.size}</span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>{z.piecesExpected}</span>
                <Input type="number" min="0" max={z.piecesExpected} value={back[z.size] ?? ""}
                  onChange={e => setBack(b => ({ ...b, [z.size]: e.target.value }))} />
              </div>
            ))}
            {receiving.sizes.length === 0 && (
              <div style={{ padding: "8px 12px", borderTop: "1px solid var(--line)" }}>
                {adhoc.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <Input placeholder="Size" value={r.size} style={{ flex: 1 }}
                      onChange={e => setAdhoc(rs => rs.map((x, j) => j === i ? { ...x, size: e.target.value } : x))} />
                    <Input type="number" min="0" placeholder="Pieces" value={r.pieces} style={{ width: 110 }}
                      onChange={e => setAdhoc(rs => rs.map((x, j) => j === i ? { ...x, pieces: e.target.value } : x))} />
                    <button type="button" aria-label={`Remove size ${i + 1}`}
                      onClick={() => setAdhoc(rs => rs.filter((_, j) => j !== i))}
                      style={{ background: "none", border: "none", color: "var(--muted)", padding: 6, cursor: "pointer" }}>
                      <X size={15} />
                    </button>
                  </div>
                ))}
                <Button type="button" variant="secondary" size="sm"
                  onClick={() => setAdhoc(rs => [...rs, { size: "", pieces: "" }])}>+ Add size</Button>
              </div>
            )}
          </div>

          <Field label="Sale price per piece"
            hint="Give one and the garments go straight into stock, costed at the cloth plus the making.">
            <Input type="number" min="0" step="0.01" value={backPrice} placeholder="Leave blank to book them later"
              onChange={e => setBackPrice(e.target.value)} />
          </Field>

          <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>
              Garments coming back
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <Field label="Transporter">
                <Input value={backLeg.transporter} onChange={e => setBackLeg(l => ({ ...l, transporter: e.target.value }))} />
              </Field>
              <Field label="LR number">
                <Input value={backLeg.lr} onChange={e => setBackLeg(l => ({ ...l, lr: e.target.value }))} />
              </Field>
              <Field label="Vehicle">
                <Input value={backLeg.vehicle} onChange={e => setBackLeg(l => ({ ...l, vehicle: e.target.value }))} />
              </Field>
            </div>
            <Field label="LR photo" style={{ marginTop: 10 }}>
              <PhotoPicker value={backLeg.photos} onChange={v => setBackLeg(l => ({ ...l, photos: v }))} max={3} />
            </Field>
          </div>
          {err && <ErrorBanner msg={err} />}
        </Modal>
      )}
    </div>
  );
}
