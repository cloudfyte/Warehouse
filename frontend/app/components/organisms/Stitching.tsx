"use client";
import { useState } from "react";
import type { StitchingJob, CuttingAssignment, Employee } from "@/app/types";
import { STITCHING_STATUS_LABELS } from "@/app/lib/constants";
import { formatDateShort } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import Modal from "@/app/components/atoms/Modal";

interface Props {
  jobs: StitchingJob[]; assignments: CuttingAssignment[]; tailors: Employee[]
  isAdmin: boolean; isSuperAdmin: boolean; isManager: boolean; isTailor: boolean
  onMutate: (q: string, v: Record<string, unknown>) => Promise<void>
}

const I: React.CSSProperties = {
  padding: "10px 13px", borderRadius: 9, border: "1px solid var(--line)",
  background: "var(--input-bg)", color: "var(--ink)", fontSize: 14, width: "100%", outline: "none",
};
const BTN_PRI: React.CSSProperties = {
  flex: 1, padding: "11px 0", borderRadius: 9, border: "none",
  background: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14,
};
const BTN_SEC: React.CSSProperties = {
  flex: 1, padding: "11px 0", borderRadius: 9, border: "1px solid var(--line)",
  background: "transparent", color: "var(--ink)", cursor: "pointer", fontSize: 14,
};
const LBL: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 5,
  fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, textTransform: "uppercase",
};

// ── Status step trail ──────────────────────────────────────────────────────────

const STITCHING_STEPS = [
  { key: "RECEIVED",   label: "Received" },
  { key: "PROCESSING", label: "Processing" },
  { key: "QC_CHECK",   label: "QC Check" },
  { key: "READY",      label: "Ready" },
];

const STEP_COLORS: Record<string, string> = {
  RECEIVED: "#94a3b8", PROCESSING: "#f59e0b", QC_CHECK: "#6366f1", READY: "#10b981", REJECTED: "#ef4444",
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

export default function Stitching({ jobs, assignments, tailors, isAdmin, isSuperAdmin, isManager, isTailor, onMutate }: Props) {
  const [selected, setSelected] = useState<StitchingJob | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ assignmentId: "", tailorId: "", pieces: "", notes: "" });
  const [upd, setUpd] = useState({ status: "", piecesCompleted: 0, piecesRejected: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const canAssign = isSuperAdmin || isAdmin || isManager;
  const canUpdate = canAssign || isTailor;
  const q = search.toLowerCase();
  const filtered = jobs.filter(j =>
    (!statusFilter || j.status === statusFilter) &&
    (!q || j.tailor.username.toLowerCase().includes(q) || j.cuttingAssignment.itemType.name.toLowerCase().includes(q))
  );
  const readyAssignments = assignments.filter(a => a.status === "COMPLETED" && a.piecesCompleted > 0);

  async function createJob() {
    setLoading(true); setError("");
    try {
      await onMutate(
        `mutation C($a:ID!,$t:ID!,$p:Int!,$notes:String){createStitchingJob(cuttingAssignmentId:$a,tailorId:$t,piecesAssigned:$p,notes:$notes){job{id}}}`,
        { a: form.assignmentId, t: form.tailorId, p: +form.pieces, notes: form.notes }
      );
      setShowForm(false); setForm({ assignmentId: "", tailorId: "", pieces: "", notes: "" });
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setLoading(false); }
  }

  async function saveUpdate() {
    if (!selected) return;
    setLoading(true); setError("");
    try {
      await onMutate(
        `mutation U($id:ID!,$status:String,$pc:Int,$pr:Int){updateStitchingJob(id:$id,status:$status,piecesCompleted:$pc,piecesRejected:$pr){job{id status}}}`,
        { id: selected.id, status: upd.status || undefined, pc: Number.isFinite(Number(upd.piecesCompleted)) ? Number(upd.piecesCompleted) : undefined, pr: Number.isFinite(Number(upd.piecesRejected)) ? Number(upd.piecesRejected) : undefined }
      );
      setSelected(null);
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Stitching Jobs</h2>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>{jobs.length} total · {jobs.filter(j => j.status === "PROCESSING" || j.status === "QC_CHECK").length} active</p>
        </div>
        {canAssign && (
          <button onClick={() => { setShowForm(true); setError(""); }} className="primary-button">
            + New Job
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <input placeholder="Search tailor or item type…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...I, flex: 1, minWidth: 200, width: "auto" }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...I, width: "auto", minWidth: 180 }}>
          <option value="">All statuses</option>
          {Object.entries(STITCHING_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* New Job modal */}
      {showForm && (
        <Modal title="New Stitching Job" subtitle="Assign cut pieces to a tailor for stitching"
          onClose={() => { setShowForm(false); setError(""); }} width={480}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <button onClick={createJob} disabled={loading || !form.assignmentId || !form.tailorId} style={BTN_PRI}>{loading ? "Creating…" : "Create Job"}</button>
            <button onClick={() => { setShowForm(false); setError(""); }} style={BTN_SEC}>Cancel</button>
          </div>}>
          {error && <div style={{ background: "#fff0ef", border: "1px solid #f1cbc8", color: "#8d3e39", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={LBL}>Cutting Assignment *
              <select value={form.assignmentId} onChange={e => setForm(p => ({ ...p, assignmentId: e.target.value }))} style={I}>
                <option value="">Select…</option>
                {readyAssignments.map(a => <option key={a.id} value={a.id}>{a.assignmentNumber} — {a.itemType.name} ({a.piecesCompleted} pieces ready)</option>)}
              </select>
            </label>
            <label style={LBL}>Tailor *
              <select value={form.tailorId} onChange={e => setForm(p => ({ ...p, tailorId: e.target.value }))} style={I}>
                <option value="">Select…</option>
                {tailors.map(t => <option key={t.id} value={t.id}>{t.username}</option>)}
              </select>
            </label>
            <label style={LBL}>Pieces Assigned *
              <input type="number" value={form.pieces} placeholder="0" onChange={e => setForm(p => ({ ...p, pieces: e.target.value }))} style={I} />
            </label>
            <label style={LBL}>Notes
              <input value={form.notes} placeholder="Optional notes…" onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={I} />
            </label>
          </div>
        </Modal>
      )}

      {/* Update modal */}
      {selected && (
        <Modal title={`Update: ${selected.jobNumber}`}
          subtitle={`${selected.cuttingAssignment.itemType.name} · ${selected.piecesAssigned} pieces → ${selected.tailor.username}`}
          onClose={() => { setSelected(null); setError(""); }} width={440}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <button onClick={saveUpdate} disabled={loading} style={BTN_PRI}>{loading ? "Saving…" : "Save Update"}</button>
            <button onClick={() => { setSelected(null); setError(""); }} style={BTN_SEC}>Cancel</button>
          </div>}>
          {error && <div style={{ background: "#fff0ef", border: "1px solid #f1cbc8", color: "#8d3e39", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={LBL}>Status
              <select value={upd.status || selected.status} onChange={e => setUpd(p => ({ ...p, status: e.target.value }))} style={I}>
                {Object.entries(STITCHING_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {([["Pieces Completed", "piecesCompleted"], ["Pieces Rejected", "piecesRejected"]] as [string, string][]).map(([label, field]) => (
                <label key={field} style={LBL}>{label}
                  <input type="number" value={(upd as unknown as Record<string, number>)[field] || 0}
                    onChange={e => setUpd(p => ({ ...p, [field]: +e.target.value }))} style={I} />
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* ── Card grid ── */}
      {filtered.length === 0 ? (
        <div style={{ padding: "64px 0", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>No stitching jobs found</div>
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
                    {canUpdate && (
                      <button
                        onClick={() => { setSelected(j); setUpd({ status: j.status, piecesCompleted: Number(j.piecesCompleted) || 0, piecesRejected: Number(j.piecesRejected) || 0 }); setError(""); }}
                        style={{ padding: "4px 12px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--canvas)", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "var(--primary)" }}>
                        Update
                      </button>
                    )}
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
