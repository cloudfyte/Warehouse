"use client";
import { useState } from "react";
import { Truck, PackageCheck, X } from "lucide-react";
import type { JobworkOrder, Karigar, ItemType, WarehouseLocation, Supplier } from "@/app/types";
import { formatDateShort, formatMoney } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Button from "@/app/components/atoms/Button";
import Modal from "@/app/components/atoms/Modal";
import Field from "@/app/components/molecules/Field";
import PageHeader from "@/app/components/molecules/PageHeader";
import PhotoPicker from "@/app/components/molecules/PhotoPicker";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import CustomerBill from "@/app/components/molecules/CustomerBill";

interface Props {
  orders: JobworkOrder[];
  karigars: Karigar[];
  itemTypes: ItemType[];
  warehouses: WarehouseLocation[];
  suppliers: Supplier[];
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

const BLANK = {
  karigarId: "", itemTypeId: "", warehouseId: "", supplierId: "",
  designNumber: "", clothMeters: "", clothCost: "", rate: "",
  jobType: "WHOLESALE", bill: "", dueDate: "",
  sentTransporter: "", sentLrNumber: "", sentVehicleNumber: "", sentPhotos: "",
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
  orders, karigars, itemTypes, warehouses, suppliers, canManage, onRefresh, onMutate,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [run, setRun] = useState<{ size: string; pieces: string }[]>([{ size: "", pieces: "" }]);
  const [receiving, setReceiving] = useState<JobworkOrder | null>(null);
  const [back, setBack] = useState<Record<string, string>>({});
  const [backPrice, setBackPrice] = useState("");
  const [backLeg, setBackLeg] = useState({ transporter: "", lr: "", vehicle: "", photos: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const runRows = run.filter(r => r.size.trim() && +r.pieces > 0)
    .map(r => ({ size: r.size.trim(), pieces: +r.pieces }));
  const runTotal = runRows.reduce((t, r) => t + r.pieces, 0);

  const owed = orders.reduce((t, o) => t + (o.amountDue || 0), 0);
  const out = orders.filter(o => o.status === "SENT" || o.status === "PARTIAL")
    .reduce((t, o) => t + (o.piecesExpected - o.piecesReceived), 0);

  async function create() {
    if (!runRows.length) { setErr("How many pieces of each size are you expecting back?"); return; }
    setBusy(true); setErr("");
    try {
      await onMutate(
        `mutation C($k:ID!,$it:ID!,$wh:ID!,$sizes:[JobworkSizeInput!]!,$sup:ID,$dn:String,`
        + `$m:Float,$cost:Float,$rate:Float,$kind:String,$bill:String,$due:Date,`
        + `$st:String,$slr:String,$sv:String,$sp:String){`
        + `createJobworkOrder(karigarId:$k,itemTypeId:$it,receiveWarehouseId:$wh,sizes:$sizes,`
        + `supplierId:$sup,designNumber:$dn,clothMeters:$m,clothCost:$cost,ratePerPiece:$rate,`
        + `jobType:$kind,customerBillNumber:$bill,dueDate:$due,`
        + `sentTransporter:$st,sentLrNumber:$slr,sentVehicleNumber:$sv,sentPhotos:$sp)`
        + `{order{id orderNumber}}}`,
        {
          k: form.karigarId, it: form.itemTypeId, wh: form.warehouseId, sizes: runRows,
          sup: form.supplierId || undefined, dn: form.designNumber || undefined,
          m: +form.clothMeters || 0, cost: +form.clothCost || 0,
          rate: form.rate === "" ? undefined : +form.rate,
          kind: form.jobType, bill: form.jobType === "READYMADE" ? form.bill : undefined,
          due: form.dueDate || undefined,
          st: form.sentTransporter || undefined, slr: form.sentLrNumber || undefined,
          sv: form.sentVehicleNumber || undefined, sp: form.sentPhotos || undefined,
        },
      );
      showToast("Outside job created.", "success");
      setShowForm(false); setForm({ ...BLANK }); setRun([{ size: "", pieces: "" }]);
      onRefresh?.();
    } catch (e: unknown) {
      const msg = friendlyError(e); setErr(msg); showToast(msg, "error");
    } finally { setBusy(false); }
  }

  function openReceive(o: JobworkOrder) {
    setBack(Object.fromEntries(o.sizes.map(z => [z.size, String(z.piecesReceived || "")])));
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
          sizes: receiving.sizes.map(z => ({ size: z.size, received: +(back[z.size] || 0) })),
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
        sub="Cloth sent straight to a unit that cuts and stitches it"
        actions={canManage && (
          <Button onClick={() => { setShowForm(true); setErr(""); }}>
            <Truck size={14} /> New Outside Job
          </Button>
        )}
      />

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 1,
        background: "var(--line)", border: "1px solid var(--line)", borderRadius: 12,
        overflow: "hidden", marginBottom: 14,
      }}>
        {([
          ["Open jobs", String(orders.filter(o => o.status === "SENT" || o.status === "PARTIAL").length), undefined],
          ["Pieces awaited", String(out), undefined],
          ["Owed to units", formatMoney(owed), owed > 0 ? "#e65100" : undefined],
        ] as const).map(([label, value, color]) => (
          <div key={label} style={{ background: "var(--paper)", padding: "12px 16px" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
        {orders.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            No outside jobs yet. This is for cloth that goes straight from the supplier to a unit
            that cuts and stitches it — everything else goes through Cutting and Stitching.
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

      {showForm && (
        <Modal title="New Outside Job"
          subtitle="Cloth goes straight to the unit. It never becomes stock here."
          width={620} onClose={() => setShowForm(false)} onSubmit={create}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <Button type="submit" style={{ flex: 1 }}
              disabled={busy || !form.karigarId || !form.itemTypeId || !form.warehouseId || !runRows.length
                || (form.jobType === "READYMADE" && !form.bill.trim())}>
              {busy ? "Creating…" : "Create"}
            </Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Unit" required hint="Who cuts and stitches it.">
              <Select value={form.karigarId} onChange={e => {
                const k = karigars.find(x => x.id === e.target.value);
                setForm(p => ({ ...p, karigarId: e.target.value, rate: k ? String(k.ratePerPiece ?? "") : "" }));
              }}>
                <option value="">Select…</option>
                {karigars.filter(k => k.active !== false).map(k => (
                  <option key={k.id} value={k.id}>{k.name}{k.city ? ` · ${k.city}` : ""}</option>
                ))}
              </Select>
            </Field>
            <Field label="Garment" required>
              <Select value={form.itemTypeId} onChange={e => setForm(p => ({ ...p, itemTypeId: e.target.value }))}>
                <option value="">Select…</option>
                {itemTypes.filter(t => t.active !== false).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Cloth supplier" hint="Where the cloth came from. It went straight to the unit.">
              <Select value={form.supplierId} onChange={e => setForm(p => ({ ...p, supplierId: e.target.value }))}>
                <option value="">—</option>
                {suppliers.filter(x => x.active !== false).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
            <Field label="Design number">
              <Input value={form.designNumber} placeholder="e.g. 4472"
                onChange={e => setForm(p => ({ ...p, designNumber: e.target.value }))} />
            </Field>
            <Field label="Cloth metres">
              <Input type="number" min="0" step="0.01" value={form.clothMeters}
                onChange={e => setForm(p => ({ ...p, clothMeters: e.target.value }))} />
            </Field>
            <Field label="Cloth cost" hint="What you paid for it, even though it never came here.">
              <Input type="number" min="0" step="0.01" value={form.clothCost}
                onChange={e => setForm(p => ({ ...p, clothCost: e.target.value }))} />
            </Field>
            <Field label="Rate per piece" hint="Covers cutting and stitching together.">
              <Input type="number" min="0" step="0.01" value={form.rate}
                onChange={e => setForm(p => ({ ...p, rate: e.target.value }))} />
            </Field>
            <Field label="Garments land at" required>
              <Select value={form.warehouseId} onChange={e => setForm(p => ({ ...p, warehouseId: e.target.value }))}>
                <option value="">Select…</option>
                {warehouses.filter(w => w.active !== false).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="What is this for?" required style={{ marginTop: 10 }}>
            <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
              {([["WHOLESALE", "Wholesale"], ["READYMADE", "Readymade"]] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setForm(p => ({ ...p, jobType: key }))}
                  style={{
                    padding: "7px 16px", fontSize: 13, border: "none", cursor: "pointer",
                    fontWeight: form.jobType === key ? 700 : 500,
                    background: form.jobType === key ? "var(--primary)" : "transparent",
                    color: form.jobType === key ? "#fff" : "var(--muted)",
                  }}>{label}</button>
              ))}
            </div>
          </Field>
          {form.jobType === "READYMADE" && (
            <Field label="Customer bill number" required hint="Carried onto the garments when they arrive.">
              <Input value={form.bill} placeholder="e.g. SW-1042"
                onChange={e => setForm(p => ({ ...p, bill: e.target.value }))} />
            </Field>
          )}

          <div style={{ border: "1px dashed var(--line)", borderRadius: 10, padding: "12px 14px", marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
              Expected back — by size
            </div>
            {run.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <Input placeholder="Size" value={r.size} style={{ flex: 1 }}
                  onChange={e => setRun(rs => rs.map((x, j) => j === i ? { ...x, size: e.target.value } : x))} />
                <Input type="number" min="1" placeholder="Pieces" value={r.pieces} style={{ width: 110 }}
                  onChange={e => setRun(rs => rs.map((x, j) => j === i ? { ...x, pieces: e.target.value } : x))} />
                <button type="button" aria-label={`Remove size ${i + 1}`}
                  onClick={() => setRun(rs => rs.filter((_, j) => j !== i))}
                  style={{ background: "none", border: "none", color: "var(--muted)", padding: 6, cursor: "pointer" }}>
                  <X size={15} />
                </button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm"
              onClick={() => setRun(rs => [...rs, { size: "", pieces: "" }])}>+ Add size</Button>
            {runTotal > 0 && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                <strong style={{ color: "var(--ink)" }}>{runTotal} pieces</strong> expected
                {form.rate && <> · making {formatMoney(runTotal * +form.rate)}</>}
              </div>
            )}
          </div>

          <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>
              Cloth going out
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <Field label="Transporter">
                <Input value={form.sentTransporter} onChange={e => setForm(p => ({ ...p, sentTransporter: e.target.value }))} />
              </Field>
              <Field label="LR number">
                <Input value={form.sentLrNumber} onChange={e => setForm(p => ({ ...p, sentLrNumber: e.target.value }))} />
              </Field>
              <Field label="Vehicle">
                <Input value={form.sentVehicleNumber} onChange={e => setForm(p => ({ ...p, sentVehicleNumber: e.target.value }))} />
              </Field>
            </div>
            <Field label="LR photo" style={{ marginTop: 10 }}>
              <PhotoPicker value={form.sentPhotos} onChange={v => setForm(p => ({ ...p, sentPhotos: v }))} max={3} />
            </Field>
          </div>
          {err && <ErrorBanner msg={err} />}
        </Modal>
      )}

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
              <span>Size</span><span>Sent out</span><span>Came back</span>
            </div>
            {receiving.sizes.map(z => (
              <div key={z.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", gap: 8, padding: "7px 12px", alignItems: "center", borderTop: "1px solid var(--line)" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{z.size}</span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>{z.piecesExpected}</span>
                <Input type="number" min="0" max={z.piecesExpected} value={back[z.size] ?? ""}
                  onChange={e => setBack(b => ({ ...b, [z.size]: e.target.value }))} />
              </div>
            ))}
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
