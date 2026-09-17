"use client";
import { useState, useEffect } from "react";
import type { StitchingJob, CuttingAssignment, Karigar } from "@/app/types";
import { STITCHING_STATUS_LABELS } from "@/app/lib/constants";
import { formatDateShort, formatMoney } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Modal from "@/app/components/atoms/Modal";
import Button from "@/app/components/atoms/Button";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Field from "@/app/components/molecules/Field";
import FormGrid from "@/app/components/molecules/FormGrid";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import PageHeader from "@/app/components/molecules/PageHeader";
import FilterBar from "@/app/components/molecules/FilterBar";
import PhotoPicker from "@/app/components/molecules/PhotoPicker";
import CustomerBill from "@/app/components/molecules/CustomerBill";
import Pagination from "@/app/components/atoms/Pagination";
import Cell from "@/app/components/molecules/Cell";
import TotalsBar from "@/app/components/molecules/TotalsBar";
import { nameToColorHex } from "@/app/lib/colorUtils";

interface Props {
  jobs: StitchingJob[]; assignments: CuttingAssignment[]
  /** Who actually stitches — paid per piece, and not necessarily staff. */
  karigars: Karigar[]
  warehouses: { id: string; name: string }[]
  isAdmin: boolean; isSuperAdmin: boolean; isManager: boolean; isTailor: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>
}

// ── Status step trail ──────────────────────────────────────────────────────────

const PER_PAGE = 20;

const STITCHING_STEPS = [
  { key: "RECEIVED",   label: "Received" },
  { key: "PROCESSING", label: "Processing" },
  { key: "QC_CHECK",   label: "QC Check" },
  { key: "READY",      label: "Ready" },
];

const STEP_COLORS: Record<string, string> = {
  RECEIVED: "#94a3b8", PROCESSING: "#f59e0b", QC_CHECK: "#6366f1", READY: "#10b981", REJECTED: "#ef4444", MOVED: "#10b981",
};

export default function Stitching({ jobs, assignments, karigars, warehouses, isAdmin, isSuperAdmin, isManager, isTailor, onMutate }: Props) {
  const [selected, setSelected] = useState<StitchingJob | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ assignmentId: "", karigarId: "", pieces: "", notes: "", jobType: "WHOLESALE", customerBillNumber: "", photos: "", rate: "" });
  const [upd, setUpd] = useState({ status: "", piecesCompleted: 0, piecesRejected: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Move to Finished Goods ────────────────────────────────────────────────
  const [fgJob, setFgJob] = useState<StitchingJob | null>(null);
  const [fgForm, setFgForm] = useState({ qty: "", warehouseId: "", costPrice: "", salePrice: "" });
  const [fgLoading, setFgLoading] = useState(false);
  const [fgError, setFgError] = useState("");

  function openFG(j: StitchingJob) {
    const net = (j.piecesCompleted || 0) - (j.piecesRejected || 0);
    const ca = j.cuttingAssignment;
    const defaultWh = ca?.rawClothBatch?.warehouse?.id || (warehouses[0]?.id ?? "");
    setFgJob(j);
    setFgForm({ qty: String(Math.max(0, net)), warehouseId: defaultWh, costPrice: String(ca?.costPerPiece || ""), salePrice: "" });
    setFgError("");
  }

  async function saveToFinishedGoods() {
    if (!fgJob) return;
    const netPieces = (fgJob.piecesCompleted || 0) - (fgJob.piecesRejected || 0);
    if (!fgForm.qty || +fgForm.qty < 1) { setFgError("Enter quantity (at least 1)."); return; }
    if (+fgForm.qty > netPieces) { setFgError(`Quantity cannot exceed net pieces (${netPieces}).`); return; }
    if (!fgForm.warehouseId) { setFgError("Select a warehouse."); return; }
    if (!fgForm.salePrice || +fgForm.salePrice <= 0) { setFgError("Enter sale price per piece."); return; }
    setFgLoading(true); setFgError("");
    try {
      await onMutate(
        `mutation M($sjId:ID!,$qty:Int!,$wh:ID!,$cp:Float!,$sp:Float!){createFinishedProducts(stitchingJobId:$sjId,quantity:$qty,warehouseId:$wh,costPrice:$cp,salePrice:$sp){finishedProduct{id sku}}}`,
        { sjId: fgJob.id, qty: +fgForm.qty, wh: fgForm.warehouseId, cp: +(fgForm.costPrice || 0), sp: +fgForm.salePrice }
      );
      setFgJob(null);
      showToast("Finished products added to inventory.", "success");
    } catch (e: unknown) { setFgError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setFgLoading(false); }
  }

  // Local tailor list (grows when user creates new ones inline)
  // A karigar can be added without leaving the form — an outside unit turns
  // up mid-job often enough that sending someone to another tab to record it
  // is the kind of detour this app is meant to remove.
  // The cutting docket is a size run, so the stitching that follows it is too.
  const [run, setRun] = useState<{ size: string; pieces: string }[]>([]);
  const runRows = run.filter(r => r.size.trim() && +r.pieces > 0)
    .map(r => ({ size: r.size.trim(), pieces: +r.pieces }));
  const runTotal = runRows.reduce((t, r) => t + r.pieces, 0);

  const [newKarigar, setNewKarigar] = useState({ name: "", rate: "", city: "" });
  const [addingKarigar, setAddingKarigar] = useState(false);
  const [karigarCreating, setKarigarCreating] = useState(false);

  async function createKarigarInline() {
    if (!newKarigar.name.trim()) return;
    setKarigarCreating(true);
    try {
      const r = await onMutate(
        `mutation C($n:String!,$rate:Float,$city:String){createKarigar(name:$n,ratePerPiece:$rate,city:$city){karigar{id name ratePerPiece}}}`,
        { n: newKarigar.name.trim(), rate: +newKarigar.rate || 0, city: newKarigar.city.trim() },
      );
      const made = r?.createKarigar?.karigar;
      if (made) {
        setForm(p => ({ ...p, karigarId: made.id, rate: String(made.ratePerPiece ?? "") }));
        setNewKarigar({ name: "", rate: "", city: "" });
        setAddingKarigar(false);
        showToast(`${made.name} added.`, "success");
      }
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setKarigarCreating(false); }
  }
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const canAssign = isSuperAdmin || isAdmin || isManager;
  const canUpdate = canAssign || isTailor;
  const q = search.toLowerCase();
  const filtered = jobs.filter(j =>
    (!statusFilter || j.status === statusFilter) &&
    (!q || j.tailor.username.toLowerCase().includes(q) || j.cuttingAssignment.itemType.name.toLowerCase().includes(q))
  );
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  // Follows the filter. The one number a stitching desk is asked for daily is
  // how much is owed to the people who did the work.
  const totals = filtered.reduce((t, j) => ({
    done: t.done + (Number(j.piecesCompleted) || 0),
    assigned: t.assigned + (Number(j.piecesAssigned) || 0),
    rejected: t.rejected + (Number(j.piecesRejected) || 0),
    due: t.due + (Number(j.amountDue) || 0),
  }), { done: 0, assigned: 0, rejected: 0, due: 0 });
  const readyAssignments = assignments.filter(a => a.piecesCompleted > 0 && a.status !== "PENDING");

  // A lorry took the cut pieces out and another brought garments back. The LR
  // is usually a photograph of a paper docket rather than anything typed.
  const [transit, setTransit] = useState<StitchingJob | null>(null);
  const [leg, setLeg] = useState({
    issueTransporter: "", issueLrNumber: "", issueVehicleNumber: "", issuePhotos: "",
    returnTransporter: "", returnLrNumber: "", returnVehicleNumber: "", returnPhotos: "",
    returnWarehouseId: "",
  });
  const [transitBusy, setTransitBusy] = useState(false);

  function openTransit(j: StitchingJob) {
    setLeg({
      issueTransporter: j.issueTransporter || "", issueLrNumber: j.issueLrNumber || "",
      issueVehicleNumber: j.issueVehicleNumber || "", issuePhotos: j.issuePhotos || "",
      returnTransporter: j.returnTransporter || "", returnLrNumber: j.returnLrNumber || "",
      returnVehicleNumber: j.returnVehicleNumber || "", returnPhotos: j.returnPhotos || "",
      returnWarehouseId: j.returnWarehouse?.id || "",
    });
    setTransit(j);
  }

  async function saveTransit() {
    if (!transit) return;
    setTransitBusy(true);
    try {
      await onMutate(
        `mutation T($id:ID!,$it:String,$ilr:String,$iv:String,$ip:String,`
        + `$rt:String,$rlr:String,$rv:String,$rp:String,$rw:ID){`
        + `updateStitchingJob(id:$id,issueTransporter:$it,issueLrNumber:$ilr,issueVehicleNumber:$iv,issuePhotos:$ip,`
        + `returnTransporter:$rt,returnLrNumber:$rlr,returnVehicleNumber:$rv,returnPhotos:$rp,returnWarehouseId:$rw)`
        + `{job{id}}}`,
        {
          id: transit.id,
          it: leg.issueTransporter, ilr: leg.issueLrNumber, iv: leg.issueVehicleNumber, ip: leg.issuePhotos,
          rt: leg.returnTransporter, rlr: leg.returnLrNumber, rv: leg.returnVehicleNumber, rp: leg.returnPhotos,
          rw: leg.returnWarehouseId || undefined,
        },
      );
      showToast("Transit details saved.", "success");
      setTransit(null);
    } catch (e: unknown) { showToast(friendlyError(e), "error"); }
    finally { setTransitBusy(false); }
  }

  const [paying, setPaying] = useState<StitchingJob | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  async function payJob() {
    if (!paying) return;
    setPayBusy(true);
    try {
      await onMutate(
        `mutation P($id:ID!,$amt:Float!){payKarigar(stitchingJobId:$id,amount:$amt){job{id amountPaid amountDue}}}`,
        { id: paying.id, amt: +payAmount },
      );
      showToast("Payment recorded.", "success");
      setPaying(null); setPayAmount("");
    } catch (e: unknown) { showToast(friendlyError(e), "error"); }
    finally { setPayBusy(false); }
  }

  async function createJob() {
    setLoading(true); setError("");
    try {
      await onMutate(
        `mutation C($a:ID!,$k:ID!,$p:Int,$notes:String,$kind:String,$bill:String,$photos:String,$rate:Float,$sizes:[CuttingSizeInput!]){`
        + `createStitchingJob(cuttingAssignmentId:$a,karigarId:$k,piecesAssigned:$p,notes:$notes,`
        + `jobType:$kind,customerBillNumber:$bill,photos:$photos,ratePerPiece:$rate,sizes:$sizes){job{id}}}`,
        {
          a: form.assignmentId, k: form.karigarId,
          p: runTotal > 0 ? undefined : +form.pieces,
          sizes: runRows.length ? runRows : undefined,
          notes: form.notes,
          rate: form.rate === "" ? undefined : +form.rate,
          kind: form.jobType,
          bill: form.jobType === "READYMADE" ? form.customerBillNumber : undefined,
          photos: form.photos || undefined,
        }
      );
      setShowForm(false); setForm({ assignmentId: "", karigarId: "", pieces: "", notes: "", jobType: "WHOLESALE", customerBillNumber: "", photos: "", rate: "" });
      showToast("Stitching job created.", "success");
    } catch (e: unknown) { setError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  async function saveUpdate() {
    if (!selected) return;
    const pc = Number(upd.piecesCompleted);
    const pr = Number(upd.piecesRejected);
    if (pc < 0 || pr < 0) {
      const msg = "Pieces cannot be negative.";
      setError(msg); showToast(msg, "error"); return;
    }
    if (pc + pr > selected.piecesAssigned) {
      const msg = `Completed (${pc}) + Rejected (${pr}) = ${pc + pr} exceeds assigned (${selected.piecesAssigned}).`;
      setError(msg); showToast(msg, "error"); return;
    }
    setLoading(true); setError("");
    try {
      await onMutate(
        `mutation U($id:ID!,$status:String,$pc:Int,$pr:Int){updateStitchingJob(id:$id,status:$status,piecesCompleted:$pc,piecesRejected:$pr){job{id status}}}`,
        { id: selected.id, status: upd.status || undefined, pc: Number.isFinite(pc) ? pc : undefined, pr: Number.isFinite(pr) ? pr : undefined }
      );
      setSelected(null);
      showToast("Stitching job updated.", "success");
    } catch (e: unknown) { setError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Stitching"
        sub="Who is stitching what, how far it has got, and what they are owed"
        actions={canAssign && <Button onClick={() => { setShowForm(true); setError(""); }}>+ New Job</Button>}
      />

      <TotalsBar
        narrowed={filtered.length !== jobs.length}
        note="Totals are for what you have filtered, not every job."
        totals={[
          { label: "Jobs", value: String(filtered.length) },
          { label: "Pieces stitched", value: `${totals.done} of ${totals.assigned}`, color: "var(--primary)" },
          { label: "Rejected", value: String(totals.rejected), color: totals.rejected > 0 ? "#d32f2f" : undefined },
          { label: "Owed to stitchers", value: formatMoney(totals.due), color: totals.due > 0 ? "#e65100" : undefined },
        ]}
      />

      <FilterBar style={{ marginBottom: 20 }}>
        <Input placeholder="Search tailor or item type…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: "auto", minWidth: 180 }}>
          <option value="">All statuses</option>
          {Object.entries(STITCHING_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </FilterBar>

      {/* New Job modal */}
      {transit && (
        <Modal
          title="Transit"
          subtitle={`${transit.jobNumber} · ${transit.karigar?.name ?? ""}`}
          width={560}
          onClose={() => setTransit(null)}
          onSubmit={saveTransit}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <Button type="submit" disabled={transitBusy} style={{ flex: 1 }}>
              {transitBusy ? "Saving…" : "Save"}
            </Button>
            <Button variant="secondary" onClick={() => setTransit(null)} style={{ flex: 1 }}>Cancel</Button>
          </div>}>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 14 }}>
            The LR is usually a photograph of a paper docket. Photograph it rather than
            typing it out if that is quicker.
          </div>

          {([
            ["Cut pieces going out", "issue"],
            ["Garments coming back", "return"],
          ] as const).map(([title, key]) => (
            <div key={key} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>
                {title}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Transporter">
                  <Input value={leg[`${key}Transporter` as const]}
                    onChange={e => setLeg(l => ({ ...l, [`${key}Transporter`]: e.target.value }))} />
                </Field>
                <Field label="LR number">
                  <Input value={leg[`${key}LrNumber` as const]}
                    onChange={e => setLeg(l => ({ ...l, [`${key}LrNumber`]: e.target.value }))} />
                </Field>
                <Field label="Vehicle">
                  <Input value={leg[`${key}VehicleNumber` as const]}
                    onChange={e => setLeg(l => ({ ...l, [`${key}VehicleNumber`]: e.target.value }))} />
                </Field>
                {key === "return" && (
                  <Field label="Lands at" hint="Blank means back where the cloth came from.">
                    <Select value={leg.returnWarehouseId}
                      onChange={e => setLeg(l => ({ ...l, returnWarehouseId: e.target.value }))}>
                      <option value="">Same warehouse</option>
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </Select>
                  </Field>
                )}
              </div>
              <Field label="LR photo" style={{ marginTop: 10 }}>
                <PhotoPicker value={leg[`${key}Photos` as const]}
                  onChange={v => setLeg(l => ({ ...l, [`${key}Photos`]: v }))} max={3} />
              </Field>
            </div>
          ))}
        </Modal>
      )}

      {paying && (
        <Modal
          title="Pay karigar"
          subtitle={`${paying.jobNumber} · ${paying.karigar?.name ?? paying.tailor?.username ?? ""}`}
          width={400}
          onClose={() => setPaying(null)}
          onSubmit={payJob}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <Button type="submit" disabled={payBusy || !(+payAmount > 0)} style={{ flex: 1 }}>
              {payBusy ? "Recording…" : "Record payment"}
            </Button>
            <Button variant="secondary" onClick={() => setPaying(null)} style={{ flex: 1 }}>Cancel</Button>
          </div>}>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12 }}>
            {paying.piecesCompleted} finished pieces at {formatMoney(paying.ratePerPiece ?? 0)} —{" "}
            <strong style={{ color: "var(--ink)" }}>{formatMoney(paying.amountEarned ?? 0)}</strong> earned,{" "}
            {formatMoney(paying.amountPaid ?? 0)} already paid. Rejected pieces are not earned.
          </div>
          <Field label="Amount">
            <Input type="number" min="0" step="0.01" value={payAmount} autoFocus
              onChange={e => setPayAmount(e.target.value)} />
          </Field>
        </Modal>
      )}

      {showForm && (
        <Modal title="New Stitching Job" subtitle="Assign cut pieces to a tailor for stitching"
          onClose={() => { setShowForm(false); setError(""); setForm({ assignmentId: "", karigarId: "", pieces: "", notes: "", jobType: "WHOLESALE", customerBillNumber: "", photos: "", rate: "" }); }} width={480}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <Button onClick={createJob} disabled={loading || !form.assignmentId || !form.karigarId || (runTotal === 0 && !form.pieces)
              || (form.jobType === "READYMADE" && !form.customerBillNumber.trim())} style={{ flex: 1 }}>{loading ? "Creating…" : "Create Job"}</Button>
            <Button variant="secondary" onClick={() => { setShowForm(false); setError(""); setForm({ assignmentId: "", karigarId: "", pieces: "", notes: "", jobType: "WHOLESALE", customerBillNumber: "", photos: "", rate: "" }); }} style={{ flex: 1 }}>Cancel</Button>
          </div>}>
          <ErrorBanner msg={error} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Cutting Assignment" required>
              <Select value={form.assignmentId} onChange={e => setForm(p => ({ ...p, assignmentId: e.target.value }))}>
                <option value="">Select…</option>
                {readyAssignments.map(a => <option key={a.id} value={a.id}>{a.assignmentNumber} — {a.itemType.name} ({a.piecesCompleted} pieces ready)</option>)}
              </Select>
            </Field>
            <Field label="Karigar" required hint="Who is stitching this. Paid by the piece.">
              <Select value={form.karigarId} onChange={e => {
                const picked = karigars.find(k => k.id === e.target.value);
                // Their usual rate fills in, and stays editable — a heavy
                // garment is worth more than a plain one.
                setForm(p => ({ ...p, karigarId: e.target.value,
                                rate: picked ? String(picked.ratePerPiece ?? "") : "" }));
              }}>
                <option value="">Select…</option>
                {karigars.filter(k => k.active !== false).map(k => (
                  <option key={k.id} value={k.id}>
                    {k.name}{k.city ? ` · ${k.city}` : ""} — {formatMoney(k.ratePerPiece)}/pc
                  </option>
                ))}
              </Select>
              {!addingKarigar
                ? <button type="button" onClick={() => setAddingKarigar(true)} style={{ fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, fontWeight: 600 }}>+ Add a karigar</button>
                : <div style={{ background: "var(--canvas)", borderRadius: 8, padding: 12, border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
                    <Input placeholder="Name — e.g. Mumbai Unit A" value={newKarigar.name} autoFocus
                      onChange={e => setNewKarigar(k => ({ ...k, name: e.target.value }))} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <Input placeholder="City" value={newKarigar.city}
                        onChange={e => setNewKarigar(k => ({ ...k, city: e.target.value }))} />
                      <Input type="number" min="0" step="0.01" placeholder="Rate / piece" value={newKarigar.rate}
                        onChange={e => setNewKarigar(k => ({ ...k, rate: e.target.value }))} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button type="button" onClick={createKarigarInline} disabled={karigarCreating || !newKarigar.name.trim()} size="sm">{karigarCreating ? "Adding…" : "Add"}</Button>
                      <Button type="button" variant="secondary" onClick={() => { setAddingKarigar(false); setNewKarigar({ name: "", rate: "", city: "" }); }} size="sm">Cancel</Button>
                    </div>
                  </div>
              }
            </Field>
            {/* Wholesale or readymade was decided when the cloth was cut, and
                the bill number with it. Asking again here is a second place for
                the same fact to be wrong. */}
            {(() => {
              const ca = assignments.find(a => a.id === form.assignmentId);
              if (!ca || ca.jobType !== "READYMADE") return null;
              return (
                <div style={{ padding: "9px 12px", borderRadius: 9, background: "#f5f3ff", fontSize: 12, lineHeight: 1.6 }}>
                  <div style={{ marginBottom: 6 }}>
                    Readymade — it follows these pieces onto the finished garment.
                  </div>
                  <CustomerBill order={ca.customerOrder} billNumber={ca.customerBillNumber} />
                </div>
              );
            })()}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Pieces Assigned" required
                hint={runTotal > 0 ? "Comes from the size run." : undefined}>
                <Input type="number" value={runTotal > 0 ? String(runTotal) : form.pieces}
                  disabled={runTotal > 0} placeholder="0"
                  onChange={e => setForm(p => ({ ...p, pieces: e.target.value }))} />
              </Field>
              <Field label="Rate per piece" hint="Frozen at handover — a later rate change will not move this job.">
                <Input type="number" min="0" step="0.01" value={form.rate} placeholder="0.00"
                  onChange={e => setForm(p => ({ ...p, rate: e.target.value }))} />
              </Field>
            </div>
            <div style={{ border: "1px dashed var(--line)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
                Size run <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— optional</span>
              </div>
              {run.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <Input placeholder="Size — e.g. 40" value={r.size} style={{ flex: 1 }}
                    onChange={e => setRun(rs => rs.map((x, j) => j === i ? { ...x, size: e.target.value } : x))} />
                  <Input type="number" min="1" placeholder="Pieces" value={r.pieces} style={{ width: 110 }}
                    onChange={e => setRun(rs => rs.map((x, j) => j === i ? { ...x, pieces: e.target.value } : x))} />
                  <button type="button" aria-label={`Remove size ${i + 1}`}
                    onClick={() => setRun(rs => rs.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", color: "var(--muted)", padding: 6, cursor: "pointer" }}>×</button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm"
                onClick={() => setRun(rs => [...rs, { size: "", pieces: "" }])}>+ Add size</Button>
            </div>

            {(runTotal > 0 || form.pieces) && form.rate && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -6 }}>
                {runTotal || +form.pieces} pieces at {formatMoney(+form.rate)} —{" "}
                <strong style={{ color: "var(--ink)" }}>{formatMoney((runTotal || +form.pieces) * (+form.rate))}</strong>{" "}
                if every piece comes back good.
              </div>
            )}
            <Field label="Notes">
              <Input value={form.notes} placeholder="Optional notes…" onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </Field>
          </div>
        </Modal>
      )}

      {/* Update modal */}
      {selected && (() => {
        const isReady = selected.status === "READY";
        return (
          <Modal title={`Update: ${selected.jobNumber}`}
            subtitle={`${selected.cuttingAssignment.itemType.name} · ${selected.piecesAssigned} pieces → ${selected.tailor.username}`}
            onClose={() => { setSelected(null); setError(""); }} width={440}
            footer={<div style={{ display: "flex", gap: 10 }}>
              {isReady ? (
                <Button onClick={() => { openFG(selected); setSelected(null); }} style={{ flex: 1, background: "#10b981", border: "none" }}>
                  → Move to Finished Goods
                </Button>
              ) : (
                <Button onClick={saveUpdate} disabled={loading} style={{ flex: 1 }}>{loading ? "Saving…" : "Save Update"}</Button>
              )}
              <Button variant="secondary" onClick={() => { setSelected(null); setError(""); }} style={{ flex: 1 }}>Cancel</Button>
            </div>}>
            <ErrorBanner msg={error} />
            {isReady && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#15803d", marginBottom: 14 }}>
                ✓ Job is <strong>Ready</strong> — status and pieces cannot be edited. Use Move to Finished Goods.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Status">
                <Select value={upd.status || selected.status} onChange={e => setUpd(p => ({ ...p, status: e.target.value }))} disabled={isReady}>
                  {Object.entries(STITCHING_STATUS_LABELS).filter(([k]) => k !== "MOVED").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              {!isReady && (
                <div style={{ fontSize: 12, color: "var(--muted)", background: "var(--canvas)", borderRadius: 7, padding: "7px 12px" }}>
                  Assigned: <strong style={{ color: "var(--ink)" }}>{selected.piecesAssigned}</strong> pieces — completed + rejected must not exceed this.
                </div>
              )}
              <FormGrid>
                {([["Pieces Completed", "piecesCompleted"], ["Pieces Rejected", "piecesRejected"]] as [string, string][]).map(([label, field]) => (
                  <Field key={field} label={label}>
                    <Input type="number" min="0" max={selected.piecesAssigned}
                      value={(upd as unknown as Record<string, number>)[field] ?? 0}
                      onChange={e => { setError(""); setUpd(p => ({ ...p, [field]: Math.max(0, +e.target.value || 0) })); }}
                      disabled={isReady} />
                  </Field>
                ))}
              </FormGrid>
            </div>
          </Modal>
        );
      })()}

      {/* Move to Finished Goods modal */}
      {fgJob && (
        <Modal title="Move to Finished Goods"
          subtitle={`${fgJob.cuttingAssignment.itemType.name} · ${fgJob.jobNumber}`}
          onClose={() => setFgJob(null)} width={420}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <Button onClick={saveToFinishedGoods} disabled={fgLoading} style={{ flex: 1 }}>{fgLoading ? "Moving…" : "Add to Finished Goods"}</Button>
            <Button variant="secondary" onClick={() => setFgJob(null)} style={{ flex: 1 }}>Cancel</Button>
          </div>}>
          <ErrorBanner msg={fgError} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "var(--canvas)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--muted)" }}>
              Completed: <strong style={{ color: "var(--ink)" }}>{fgJob.piecesCompleted}</strong> pcs &nbsp;·&nbsp;
              Rejected: <strong style={{ color: "#ef4444" }}>{fgJob.piecesRejected || 0}</strong> pcs &nbsp;·&nbsp;
              Net: <strong style={{ color: "#10b981" }}>{(fgJob.piecesCompleted || 0) - (fgJob.piecesRejected || 0)}</strong> pcs
            </div>
            <Field label="Quantity to add to Finished Goods" required>
              <Input type="number" min="1" value={fgForm.qty} onChange={e => setFgForm(p => ({ ...p, qty: e.target.value }))} placeholder="0" autoFocus />
            </Field>
            <Field label="Warehouse" required>
              <Select value={fgForm.warehouseId} onChange={e => setFgForm(p => ({ ...p, warehouseId: e.target.value }))}>
                <option value="">Select warehouse…</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
            <FormGrid>
              <Field label="Cost / pc ₹">
                <Input type="number" min="0" value={fgForm.costPrice} onChange={e => setFgForm(p => ({ ...p, costPrice: e.target.value }))} placeholder="0" />
              </Field>
              <Field label="Sale Price / pc ₹" required>
                <Input type="number" min="0" value={fgForm.salePrice} onChange={e => setFgForm(p => ({ ...p, salePrice: e.target.value }))} placeholder="0" />
              </Field>
            </FormGrid>
          </div>
        </Modal>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "72px 24px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>No stitching jobs found</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>A job is handed out from a cutting docket once its pieces are cut.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {paged.map(j => {
            const batch = j.cuttingAssignment.rawClothBatch;
            const swatch = nameToColorHex(batch?.clothColor?.name || "");
            const done = Number(j.piecesCompleted) || 0;
            const assigned = Number(j.piecesAssigned) || 0;
            const pct = assigned > 0 ? Math.max(0, Math.min(100, (done / assigned) * 100)) : 0;
            const st = STEP_COLORS[j.status] || "#94a3b8";
            const rejected = Number(j.piecesRejected) || 0;
            return (
              <div key={j.id} style={{
                display: "grid",
                // ~930px of minimums — fits a 1280 laptop with the sidebar open.
                gridTemplateColumns: "minmax(150px,1.2fr) minmax(120px,1fr) minmax(130px,1.1fr) minmax(140px,1.1fr) 150px minmax(120px,0.9fr) 108px",
                gap: 16, alignItems: "center",
                border: "1px solid var(--line)", borderLeft: `3px solid ${st}`,
                borderRadius: 12, padding: "14px 16px", background: "var(--paper)",
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.2 }}>
                    {batch?.designNumber || batch?.batchNumber || j.jobNumber}
                  </div>
                  {batch?.clothColor && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 7, marginTop: 6,
                      padding: "3px 11px 3px 4px", borderRadius: 99,
                      background: "var(--canvas)", border: "1px solid var(--line)", fontSize: 13,
                    }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                        background: swatch ?? "transparent", border: "1px solid rgba(0,0,0,.18)",
                      }} />
                      {batch.clothColor.name}
                    </span>
                  )}
                  {j.jobType === "READYMADE" && (
                    <div style={{ marginTop: 6 }}>
                      <CustomerBill order={j.customerOrder} billNumber={j.customerBillNumber} compact />
                    </div>
                  )}
                </div>

                <Cell label="Making" value={j.cuttingAssignment.itemType.name} />

                <div style={{ minWidth: 0 }}>
                  <Cell label="Stitcher"
                    value={`${j.karigar?.name ?? j.tailor?.username ?? "—"}${j.karigar?.city ? ` · ${j.karigar.city}` : ""}`} />
                  {(j.ratePerPiece ?? 0) > 0 && (
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
                      {formatMoney(j.ratePerPiece!)}/pc
                    </div>
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Sizes
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4 }}>
                    {(j.sizes?.length ?? 0) > 0 ? j.sizes!.map(z => (
                      <span key={z.id} style={{
                        fontSize: 12.5, padding: "2px 8px", borderRadius: 7,
                        border: "1px solid var(--line)", background: "var(--canvas)",
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        <strong>{z.size}</strong> {z.piecesCompleted}/{z.piecesAssigned}
                      </span>
                    )) : <span style={{ fontSize: 14 }}>—</span>}
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, justifyContent: "flex-end" }}>
                    <span style={{
                      fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                      color: pct === 100 ? "#2e7d32" : j.status === "REJECTED" ? "#d32f2f" : "var(--ink)",
                      letterSpacing: -0.5, lineHeight: 1.1,
                    }}>{done}</span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>of {assigned} done</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 99, background: "var(--line)", marginTop: 7, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: pct === 100 ? "#2e7d32" : "var(--primary)" }} />
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 5, textAlign: "right" }}>
                    {j.status === "MOVED" ? "In finished goods" : (STITCHING_STEPS.find(x => x.key === j.status)?.label ?? j.status)}
                    {rejected > 0 && <span style={{ color: "#d32f2f" }}> · {rejected} rejected</span>}
                    {" · "}{formatDateShort(j.assignedDate)}
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  {(j.amountEarned ?? 0) > 0 ? (
                    <>
                      <Cell label="Earned" value={formatMoney(j.amountEarned!)} />
                      <div style={{ fontSize: 12, marginTop: 3 }}>
                        {(j.amountDue ?? 0) > 0 ? (
                          <>
                            <span style={{ color: "#e65100" }}>{formatMoney(j.amountDue!)} to pay</span>
                            {canAssign && (
                              <button type="button"
                                onClick={() => { setPaying(j); setPayAmount(String(j.amountDue ?? "")); }}
                                style={{ marginLeft: 8, background: "none", border: "none", color: "var(--primary)", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}>
                                Pay
                              </button>
                            )}
                          </>
                        ) : <span style={{ color: "#2e7d32" }}>settled</span>}
                      </div>
                    </>
                  ) : <Cell label="Earned" value={null} />}
                  {canAssign && (j.issueLrNumber || j.returnLrNumber) && (
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
                      {j.issueLrNumber ? `out ${j.issueLrNumber}` : ""}
                      {j.returnLrNumber ? `${j.issueLrNumber ? " · " : ""}back ${j.returnLrNumber}` : ""}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {canUpdate && j.status !== "MOVED" && (
                    <Button size="sm" variant="secondary"
                      onClick={() => { setSelected(j); setUpd({ status: j.status, piecesCompleted: Number(j.piecesCompleted) || 0, piecesRejected: Number(j.piecesRejected) || 0 }); setError(""); }}>
                      Update
                    </Button>
                  )}
                  {j.status === "READY" && canAssign && done > rejected && (
                    <Button size="sm" onClick={() => openFG(j)}>→ Stock</Button>
                  )}
                  {canAssign && j.status !== "MOVED" && (
                    <button type="button" onClick={() => openTransit(j)}
                      style={{ background: "none", border: "none", color: "var(--primary)", fontWeight: 600, fontSize: 12, cursor: "pointer", padding: 0 }}>
                      Transit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
    </div>
  );
}
