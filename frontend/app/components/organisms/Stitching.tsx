"use client";
import { useState } from "react";
import type { StitchingJob, CuttingAssignment, Employee } from "@/app/types";
import { STITCHING_STATUS_LABELS } from "@/app/lib/constants";
import { formatDateShort } from "@/app/lib/formatters";
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

interface Props {
  jobs: StitchingJob[]; assignments: CuttingAssignment[]; tailors: Employee[]
  warehouses: { id: string; name: string }[]
  isAdmin: boolean; isSuperAdmin: boolean; isManager: boolean; isTailor: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>
}

// ── Status step trail ──────────────────────────────────────────────────────────

const STITCHING_STEPS = [
  { key: "RECEIVED",   label: "Received" },
  { key: "PROCESSING", label: "Processing" },
  { key: "QC_CHECK",   label: "QC Check" },
  { key: "READY",      label: "Ready" },
];

const STEP_COLORS: Record<string, string> = {
  RECEIVED: "#94a3b8", PROCESSING: "#f59e0b", QC_CHECK: "#6366f1", READY: "#10b981", REJECTED: "#ef4444", MOVED: "#10b981",
};

function StepTrail({ status }: { status: string }) {
  const isRejected = status === "REJECTED";
  const currentIdx = isRejected ? -1 : STITCHING_STEPS.findIndex(s => s.key === status);

  return (
    <div>
      {isRejected && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", letterSpacing: 0.2 }}>Rejected / Rework</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {STITCHING_STEPS.map((step, i) => {
          const done = currentIdx > i;
          const active = currentIdx === i;
          const color = isRejected
            ? "#ef444444"
            : done || active ? STEP_COLORS[step.key] : "var(--line)";
          const textColor = isRejected ? "var(--muted)" : done || active ? STEP_COLORS[step.key] : "var(--muted)";
          return (
            <div key={step.key} style={{ display: "flex", alignItems: "center", flex: i < STITCHING_STEPS.length - 1 ? 1 : undefined }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: active ? 14 : 10, height: active ? 14 : 10,
                  borderRadius: "50%",
                  background: done || active ? (isRejected ? "#ef444422" : color) : "var(--canvas)",
                  border: `2px solid ${color}`,
                  boxShadow: active && !isRejected ? `0 0 0 3px ${color}28` : "none",
                  transition: "all .2s",
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, color: textColor, whiteSpace: "nowrap", letterSpacing: 0.2 }}>
                  {step.label}
                </span>
              </div>
              {i < STITCHING_STEPS.length - 1 && (
                <div style={{ flex: 1, height: 2, background: done && !isRejected ? STEP_COLORS[STITCHING_STEPS[i + 1].key] : "var(--line)", margin: "0 2px", marginBottom: 14, transition: "background .3s" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressBar({ value, max, rejected = 0 }: { value: number; max: number; rejected?: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const rejPct = max > 0 ? Math.min(100 - pct, (rejected / max) * 100) : 0;
  return (
    <div style={{ position: "relative", height: 8, background: "var(--line)", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: `${pct}%`, height: "100%", borderRadius: 99, background: pct === 100 ? "#10b981" : pct > 60 ? "#6366f1" : pct > 30 ? "#f59e0b" : "var(--primary)", transition: "width .4s ease" }} />
      {rejected > 0 && <div style={{ position: "absolute", left: `${pct}%`, top: 0, width: `${rejPct}%`, height: "100%", background: "#ef4444cc" }} />}
    </div>
  );
}

export default function Stitching({ jobs, assignments, tailors, warehouses, isAdmin, isSuperAdmin, isManager, isTailor, onMutate }: Props) {
  const [selected, setSelected] = useState<StitchingJob | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ assignmentId: "", tailorId: "", pieces: "", notes: "" });
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ca = j.cuttingAssignment as any;
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
  const [localTailors, setLocalTailors] = useState<Employee[]>(tailors);
  const [newTailorName, setNewTailorName] = useState("");
  const [newTailorPass, setNewTailorPass] = useState("");
  const [addingTailor, setAddingTailor] = useState(false);
  const [tailorCreating, setTailorCreating] = useState(false);

  async function createTailorInline() {
    if (!newTailorName.trim() || !newTailorPass.trim()) return;
    setTailorCreating(true);
    try {
      const r = await onMutate(
        `mutation C($u:String!,$p:String!){createEmployee(username:$u,password:$p,role:"TAILOR"){employee{id username}}}`,
        { u: newTailorName.trim(), p: newTailorPass.trim() }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;
      const created = r?.createEmployee?.employee;
      if (created) {
        setLocalTailors(p => [...p, created]);
        setForm(p => ({ ...p, tailorId: created.id }));
        setNewTailorName(""); setNewTailorPass(""); setAddingTailor(false);
      }
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setTailorCreating(false); }
  }
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const canAssign = isSuperAdmin || isAdmin || isManager;
  const canUpdate = canAssign || isTailor;
  const q = search.toLowerCase();
  const filtered = jobs.filter(j =>
    (!statusFilter || j.status === statusFilter) &&
    (!q || j.tailor.username.toLowerCase().includes(q) || j.cuttingAssignment.itemType.name.toLowerCase().includes(q))
  );
  const readyAssignments = assignments.filter(a => a.piecesCompleted > 0 && a.status !== "PENDING");

  async function createJob() {
    setLoading(true); setError("");
    try {
      await onMutate(
        `mutation C($a:ID!,$t:ID!,$p:Int!,$notes:String){createStitchingJob(cuttingAssignmentId:$a,tailorId:$t,piecesAssigned:$p,notes:$notes){job{id}}}`,
        { a: form.assignmentId, t: form.tailorId, p: +form.pieces, notes: form.notes }
      );
      setShowForm(false); setForm({ assignmentId: "", tailorId: "", pieces: "", notes: "" });
      showToast("Stitching job created.", "success");
    } catch (e: unknown) { setError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  async function saveUpdate() {
    if (!selected) return;
    const pc = Number(upd.piecesCompleted);
    const pr = Number(upd.piecesRejected);
    if (pc + pr > selected.piecesAssigned) {
      const msg = `Completed (${pc}) + Rejected (${pr}) = ${pc + pr} exceeds assigned pieces (${selected.piecesAssigned}).`;
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
        title="Stitching Jobs"
        sub={`${jobs.length} total · ${jobs.filter(j => j.status === "PROCESSING" || j.status === "QC_CHECK").length} active`}
        actions={canAssign && <Button onClick={() => { setShowForm(true); setError(""); }}>+ New Job</Button>}
      />

      <FilterBar style={{ marginBottom: 20 }}>
        <Input placeholder="Search tailor or item type…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: "auto", minWidth: 180 }}>
          <option value="">All statuses</option>
          {Object.entries(STITCHING_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </FilterBar>

      {/* New Job modal */}
      {showForm && (
        <Modal title="New Stitching Job" subtitle="Assign cut pieces to a tailor for stitching"
          onClose={() => { setShowForm(false); setError(""); setForm({ assignmentId: "", tailorId: "", pieces: "", notes: "" }); }} width={480}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <Button onClick={createJob} disabled={loading || !form.assignmentId || !form.tailorId || !form.pieces} style={{ flex: 1 }}>{loading ? "Creating…" : "Create Job"}</Button>
            <Button variant="secondary" onClick={() => { setShowForm(false); setError(""); setForm({ assignmentId: "", tailorId: "", pieces: "", notes: "" }); }} style={{ flex: 1 }}>Cancel</Button>
          </div>}>
          <ErrorBanner msg={error} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Cutting Assignment" required>
              <Select value={form.assignmentId} onChange={e => setForm(p => ({ ...p, assignmentId: e.target.value }))}>
                <option value="">Select…</option>
                {readyAssignments.map(a => <option key={a.id} value={a.id}>{a.assignmentNumber} — {a.itemType.name} ({a.piecesCompleted} pieces ready)</option>)}
              </Select>
            </Field>
            <Field label="Tailor" required>
              <Select value={form.tailorId} onChange={e => setForm(p => ({ ...p, tailorId: e.target.value }))}>
                <option value="">Select…</option>
                {localTailors.map(t => <option key={t.id} value={t.id}>{t.username}</option>)}
              </Select>
              {!addingTailor
                ? <button type="button" onClick={() => setAddingTailor(true)} style={{ fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, fontWeight: 600 }}>+ Create new tailor</button>
                : <div style={{ background: "var(--canvas)", borderRadius: 8, padding: 12, border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
                    <Input placeholder="Username" value={newTailorName} onChange={e => setNewTailorName(e.target.value)} autoFocus />
                    <Input placeholder="Password" type="password" value={newTailorPass} onChange={e => setNewTailorPass(e.target.value)} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button type="button" onClick={createTailorInline} disabled={tailorCreating || !newTailorName.trim() || !newTailorPass.trim()} size="sm">{tailorCreating ? "Creating…" : "Create"}</Button>
                      <Button type="button" variant="secondary" onClick={() => { setAddingTailor(false); setNewTailorName(""); setNewTailorPass(""); }} size="sm">Cancel</Button>
                    </div>
                  </div>
              }
            </Field>
            <Field label="Pieces Assigned" required>
              <Input type="number" value={form.pieces} placeholder="0" onChange={e => setForm(p => ({ ...p, pieces: e.target.value }))} />
            </Field>
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
              <FormGrid>
                {([["Pieces Completed", "piecesCompleted"], ["Pieces Rejected", "piecesRejected"]] as [string, string][]).map(([label, field]) => (
                  <Field key={field} label={label}>
                    <Input type="number" value={(upd as unknown as Record<string, number>)[field] || 0}
                      onChange={e => setUpd(p => ({ ...p, [field]: +e.target.value }))} disabled={isReady} />
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

      {/* ── Card grid ── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "72px 24px" }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>🧵</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>No stitching jobs found</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Jobs are created from Finished Goods after cutting assignments are complete</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
          {filtered.map(j => {
            const pct = j.piecesAssigned > 0 ? Math.min(100, (j.piecesCompleted / j.piecesAssigned) * 100) : 0;
            const isRejected = j.status === "REJECTED";
            const borderColor = STEP_COLORS[j.status] || "#94a3b8";
            return (
              <div key={j.id} style={{
                background: "var(--paper)", borderRadius: 14, border: "1px solid var(--line)",
                padding: 18, boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                borderLeft: `3px solid ${borderColor}`,
              }}>
                {/* Card header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.3 }}>{j.jobNumber}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginTop: 1 }}>{j.cuttingAssignment.itemType.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      🧵 {j.tailor.username} &nbsp;·&nbsp; from {j.cuttingAssignment.assignmentNumber}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{formatDateShort(j.assignedDate)}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {canUpdate && j.status !== "MOVED" && (
                        <Button size="sm" variant="secondary"
                          onClick={() => { setSelected(j); setUpd({ status: j.status, piecesCompleted: Number(j.piecesCompleted) || 0, piecesRejected: Number(j.piecesRejected) || 0 }); setError(""); }}
                          style={{ background: "var(--canvas)", color: "var(--primary)" }}>
                          Update
                        </Button>
                      )}
                      {j.status === "READY" && canAssign && (j.piecesCompleted || 0) > (j.piecesRejected || 0) && (
                        <Button size="sm" onClick={() => openFG(j)} style={{ background: "#10b981", border: "none" }}>
                          → Finished Goods
                        </Button>
                      )}
                      {j.status === "MOVED" && (
                        <span style={{ padding: "4px 10px", borderRadius: 7, background: "color-mix(in srgb, #10b981 15%, transparent)", color: "#10b981", fontSize: 11, fontWeight: 700 }}>
                          ✓ Moved to Finished Goods
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Step trail */}
                <StepTrail status={j.status} />

                {/* Pieces progress */}
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Pieces stitched</span>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>
                        <span style={{ color: pct === 100 ? "#10b981" : isRejected ? "#ef4444" : "var(--ink)" }}>{j.piecesCompleted}</span>
                        <span style={{ color: "var(--muted)", fontWeight: 400 }}> / {j.piecesAssigned}</span>
                        <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 11 }}> ({Math.round(pct)}%)</span>
                      </span>
                      {j.piecesRejected > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", background: "#ef444415", padding: "2px 8px", borderRadius: 99 }}>
                          ✗ {j.piecesRejected} rejected
                        </span>
                      )}
                    </div>
                  </div>
                  <ProgressBar value={j.piecesCompleted} max={j.piecesAssigned} rejected={j.piecesRejected} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
