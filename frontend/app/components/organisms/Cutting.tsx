"use client";
import { useState } from "react";
import type { CuttingAssignment, Employee, RawClothBatch, ItemType } from "@/app/types";
import { CUTTING_STATUS_LABELS } from "@/app/lib/constants";
import { formatDateShort } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import Modal from "@/app/components/atoms/Modal";

interface Props {
  assignments: CuttingAssignment[]; batches: RawClothBatch[]
  cuttingMasters: Employee[]; itemTypes: ItemType[]
  isAdmin: boolean; isSuperAdmin: boolean; isManager: boolean; isCuttingMaster: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>
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

const CUTTING_STEPS = [
  { key: "PENDING",     label: "Pending" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "PARTIAL",     label: "Partial" },
  { key: "COMPLETED",   label: "Completed" },
];

const STEP_COLORS: Record<string, string> = {
  PENDING: "#94a3b8", IN_PROGRESS: "#f59e0b", PARTIAL: "#6366f1", COMPLETED: "#10b981",
};

function StepTrail({ status }: { status: string }) {
  const currentIdx = CUTTING_STEPS.findIndex(s => s.key === status);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 10 }}>
      {CUTTING_STEPS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const color = done || active ? STEP_COLORS[step.key] : "var(--line)";
        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center", flex: i < CUTTING_STEPS.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{
                width: active ? 14 : 10, height: active ? 14 : 10,
                borderRadius: "50%",
                background: done || active ? color : "var(--canvas)",
                border: `2px solid ${color}`,
                boxShadow: active ? `0 0 0 3px ${color}28` : "none",
                transition: "all .2s",
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, color: done || active ? color : "var(--muted)", whiteSpace: "nowrap", letterSpacing: 0.2 }}>
                {step.label}
              </span>
            </div>
            {i < CUTTING_STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? STEP_COLORS[CUTTING_STEPS[i + 1]?.key] || "var(--primary)" : "var(--line)", margin: "0 2px", marginBottom: 14, transition: "background .3s" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProgressBar({ value, max, color = "var(--primary)" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ position: "relative", height: 8, background: "var(--line)", borderRadius: 99, overflow: "hidden" }}>
      <div style={{
        width: `${pct}%`, height: "100%", borderRadius: 99,
        background: pct === 100 ? "#10b981" : pct > 60 ? "#6366f1" : pct > 30 ? "#f59e0b" : color,
        transition: "width .4s ease",
      }} />
    </div>
  );
}

export default function Cutting({ assignments, batches, cuttingMasters, itemTypes, isAdmin, isSuperAdmin, isManager, isCuttingMaster, onMutate }: Props) {
  const [selected, setSelected] = useState<CuttingAssignment | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ batchId: "", masterId: "", itemTypeId: "", meters: "", targetPieces: "", size: "", notes: "" });
  const [update, setUpdate] = useState({ piecesCompleted: 0, clothUsed: 0, clothWasted: 0, status: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Local item type list (grows when user creates new ones inline)
  const [localItemTypes, setLocalItemTypes] = useState<ItemType[]>(itemTypes);
  const [newItemTypeName, setNewItemTypeName] = useState("");
  const [addingItemType, setAddingItemType] = useState(false);
  const [itemTypeCreating, setItemTypeCreating] = useState(false);

  // Local cutting master list (grows when user creates new ones inline)
  const [localMasters, setLocalMasters] = useState<Employee[]>(cuttingMasters);
  const [newMasterName, setNewMasterName] = useState("");
  const [newMasterPass, setNewMasterPass] = useState("");
  const [addingMaster, setAddingMaster] = useState(false);
  const [masterCreating, setMasterCreating] = useState(false);

  async function createItemTypeInline() {
    if (!newItemTypeName.trim()) return;
    setItemTypeCreating(true);
    try {
      const r = await onMutate(
        `mutation C($n:String!){createItemType(name:$n,category:"OTHER",clothLengthPerPiece:1.0){itemType{id name}}}`,
        { n: newItemTypeName.trim() }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;
      const created = r?.createItemType?.itemType;
      if (created) {
        setLocalItemTypes(p => [...p, created]);
        setForm(p => ({ ...p, itemTypeId: created.id }));
        setNewItemTypeName(""); setAddingItemType(false);
      }
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setItemTypeCreating(false); }
  }

  async function createMasterInline() {
    if (!newMasterName.trim() || !newMasterPass.trim()) return;
    setMasterCreating(true);
    try {
      const r = await onMutate(
        `mutation C($u:String!,$p:String!){createEmployee(username:$u,password:$p,role:"CUTTING_MASTER"){employee{id username}}}`,
        { u: newMasterName.trim(), p: newMasterPass.trim() }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;
      const created = r?.createEmployee?.employee;
      if (created) {
        setLocalMasters(p => [...p, created]);
        setForm(p => ({ ...p, masterId: created.id }));
        setNewMasterName(""); setNewMasterPass(""); setAddingMaster(false);
      }
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setMasterCreating(false); }
  }
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const canAssign = isSuperAdmin || isAdmin || isManager;
  const canUpdate = canAssign || isCuttingMaster;
  const q = search.toLowerCase();
  const filtered = assignments.filter(a =>
    (!statusFilter || a.status === statusFilter) &&
    (!q || a.cuttingMaster.username.toLowerCase().includes(q) ||
      a.rawClothBatch.batchNumber.toLowerCase().includes(q) ||
      a.rawClothBatch.clothCategory.name.toLowerCase().includes(q) ||
      a.itemType.name.toLowerCase().includes(q))
  );

  async function createAssignment() {
    setLoading(true); setError("");
    try {
      await onMutate(
        `mutation C($b:ID!,$m:ID!,$t:ID!,$meters:Float!,$target:Int!,$size:String,$notes:String){createCuttingAssignment(rawClothBatchId:$b,cuttingMasterId:$m,itemTypeId:$t,metersAssigned:$meters,targetPieces:$target,size:$size,notes:$notes){assignment{id}}}`,
        { b: form.batchId, m: form.masterId, t: form.itemTypeId, meters: +form.meters, target: +form.targetPieces, size: form.size || undefined, notes: form.notes }
      );
      setShowForm(false);
      setForm({ batchId: "", masterId: "", itemTypeId: "", meters: "", targetPieces: "", size: "", notes: "" });
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setLoading(false); }
  }

  async function saveUpdate() {
    if (!selected) return;
    setLoading(true); setError("");
    const pc = Number(update.piecesCompleted);
    const cu = Number(update.clothUsed);
    const cw = Number(update.clothWasted);
    try {
      await onMutate(
        `mutation U($id:ID!,$status:String,$pc:Int,$cu:Float,$cw:Float){updateCuttingAssignment(id:$id,status:$status,piecesCompleted:$pc,clothUsed:$cu,clothWasted:$cw){assignment{id status piecesCompleted}}}`,
        { id: selected.id, status: update.status || undefined, pc: Number.isFinite(pc) ? pc : undefined, cu: Number.isFinite(cu) ? cu : undefined, cw: Number.isFinite(cw) ? cw : undefined }
      );
      setSelected(null);
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setLoading(false); }
  }

  function selField(label: string, val: string, onChange: (v: string) => void, opts: { value: string; label: string }[]) {
    return (
      <label style={LBL}>{label}
        <select value={val} onChange={e => onChange(e.target.value)} style={I}>
          <option value="">Select…</option>
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Cutting Assignments</h2>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>{assignments.length} total · {assignments.filter(a => a.status === "IN_PROGRESS" || a.status === "PARTIAL").length} active</p>
        </div>
        {canAssign && (
          <button onClick={() => { setShowForm(true); setError(""); }} className="primary-button">
            + New Assignment
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <input placeholder="Search master, cloth or item…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...I, flex: 1, minWidth: 200, width: "auto" }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...I, width: "auto", minWidth: 180 }}>
          <option value="">All statuses</option>
          {Object.entries(CUTTING_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* New Assignment modal */}
      {showForm && (
        <Modal title="New Cutting Assignment" subtitle="Assign cloth from a batch to a cutting master"
          onClose={() => { setShowForm(false); setError(""); }} width={520}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <button onClick={createAssignment} disabled={loading || !form.batchId || !form.masterId || !form.itemTypeId} style={BTN_PRI}>{loading ? "Assigning…" : "Create Assignment"}</button>
            <button onClick={() => { setShowForm(false); setError(""); }} style={BTN_SEC}>Cancel</button>
          </div>}>
          {error && <div style={{ background: "#fff0ef", border: "1px solid #f1cbc8", color: "#8d3e39", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {selField("Raw Cloth Batch *", form.batchId, v => setForm(p => ({ ...p, batchId: v })),
              batches.map(b => ({ value: b.id, label: `${b.batchNumber} — ${b.clothCategory.name} ${b.clothColor.name} (${b.availableMeters}m available)` })))}

            {/* Cutting Master with inline create */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, textTransform: "uppercase" }}>Cutting Master *</span>
              <select value={form.masterId} onChange={e => setForm(p => ({ ...p, masterId: e.target.value }))} style={I}>
                <option value="">Select…</option>
                {localMasters.map(m => <option key={m.id} value={m.id}>{m.username}</option>)}
              </select>
              {!addingMaster
                ? <button type="button" onClick={() => setAddingMaster(true)} style={{ fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, fontWeight: 600 }}>+ Create new cutting master</button>
                : <div style={{ background: "var(--canvas)", borderRadius: 8, padding: 12, border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
                    <input placeholder="Username" value={newMasterName} onChange={e => setNewMasterName(e.target.value)} style={I} />
                    <input placeholder="Password" type="password" value={newMasterPass} onChange={e => setNewMasterPass(e.target.value)} style={I} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={createMasterInline} disabled={masterCreating || !newMasterName.trim() || !newMasterPass.trim()} style={{ ...BTN_PRI, flex: "none", padding: "8px 16px", fontSize: 13 }}>{masterCreating ? "Creating…" : "Create"}</button>
                      <button type="button" onClick={() => { setAddingMaster(false); setNewMasterName(""); setNewMasterPass(""); }} style={{ ...BTN_SEC, flex: "none", padding: "8px 16px", fontSize: 13 }}>Cancel</button>
                    </div>
                  </div>
              }
            </div>

            {/* Item Type with inline create */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, textTransform: "uppercase" }}>Item Type *</span>
              <select value={form.itemTypeId} onChange={e => setForm(p => ({ ...p, itemTypeId: e.target.value }))} style={I}>
                <option value="">Select…</option>
                {localItemTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {!addingItemType
                ? <button type="button" onClick={() => setAddingItemType(true)} style={{ fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, fontWeight: 600 }}>+ Create new item type</button>
                : <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input placeholder="Item type name (e.g. Shirt, Kurti…)" value={newItemTypeName} onChange={e => setNewItemTypeName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && createItemTypeInline()} style={{ ...I, flex: 1 }} autoFocus />
                    <button type="button" onClick={createItemTypeInline} disabled={itemTypeCreating || !newItemTypeName.trim()} style={{ ...BTN_PRI, flex: "none", padding: "10px 14px", fontSize: 13 }}>{itemTypeCreating ? "…" : "Create"}</button>
                    <button type="button" onClick={() => { setAddingItemType(false); setNewItemTypeName(""); }} style={{ ...BTN_SEC, flex: "none", padding: "10px 14px", fontSize: 13 }}>✕</button>
                  </div>
              }
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={LBL}>Meters Assigned *<input type="number" step="0.01" value={form.meters} placeholder="0.00" onChange={e => setForm(p => ({ ...p, meters: e.target.value }))} style={I} /></label>
              <label style={LBL}>Target Pieces *<input type="number" value={form.targetPieces} placeholder="0" onChange={e => setForm(p => ({ ...p, targetPieces: e.target.value }))} style={I} /></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={LBL}>
                Size (optional)
                <select value={form.size} onChange={e => setForm(p => ({ ...p, size: e.target.value }))} style={I}>
                  <option value="">Free Size / Not specified</option>
                  {["XS", "S", "M", "L", "XL", "XXL", "XXXL", "28", "30", "32", "34", "36", "38", "40", "42", "44"].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label style={LBL}>Notes<input value={form.notes} placeholder="Optional notes…" onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={I} /></label>
            </div>
          </div>
        </Modal>
      )}

      {/* Update modal */}
      {selected && (
        <Modal title={`Update: ${selected.assignmentNumber}`}
          subtitle={`${selected.itemType.name} · ${selected.metersAssigned}m · ${selected.targetPieces} target pieces`}
          onClose={() => { setSelected(null); setError(""); }} width={460}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <button onClick={saveUpdate} disabled={loading} style={BTN_PRI}>{loading ? "Saving…" : "Save Update"}</button>
            <button onClick={() => { setSelected(null); setError(""); }} style={BTN_SEC}>Cancel</button>
          </div>}>
          {error && <div style={{ background: "#fff0ef", border: "1px solid #f1cbc8", color: "#8d3e39", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={LBL}>Status
              <select value={update.status || selected.status} onChange={e => setUpdate(p => ({ ...p, status: e.target.value }))} style={I}>
                {Object.entries(CUTTING_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              {([["Pieces Done", "piecesCompleted"], ["Cloth Used (m)", "clothUsed"], ["Wasted (m)", "clothWasted"]] as [string, string][]).map(([label, field]) => (
                <label key={field} style={LBL}>{label}
                  <input type="number" step="0.01" value={(update as unknown as Record<string, number>)[field] || 0}
                    onChange={e => setUpdate(p => ({ ...p, [field]: +e.target.value }))} style={I} />
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* ── Card grid ── */}
      {filtered.length === 0 ? (
        <div style={{ padding: "64px 0", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>No assignments found</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
          {filtered.map(a => {
            const piecePct = a.targetPieces > 0 ? Math.min(100, (a.piecesCompleted / a.targetPieces) * 100) : 0;
            const meterPct = a.metersAssigned > 0 ? Math.min(100, (a.clothUsed / a.metersAssigned) * 100) : 0;
            const statusColor = STEP_COLORS[a.status] || "#94a3b8";
            return (
              <div key={a.id} style={{
                background: "var(--paper)", borderRadius: 14, border: "1px solid var(--line)",
                padding: 18, boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                borderLeft: `3px solid ${statusColor}`,
              }}>
                {/* Card header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.3 }}>{a.assignmentNumber}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginTop: 1 }}>{a.itemType.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      ✂ {a.cuttingMaster.username} &nbsp;·&nbsp; {a.rawClothBatch.batchNumber} {a.rawClothBatch.clothColor.name}
                      {a.size && <span style={{ marginLeft: 4, padding: "1px 6px", borderRadius: 10, background: "var(--canvas)", fontWeight: 700 }}>Size: {a.size}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{formatDateShort(a.assignedDate)}</span>
                    {canUpdate && (
                      <button
                        onClick={() => { setSelected(a); setUpdate({ piecesCompleted: Number(a.piecesCompleted) || 0, clothUsed: Number(a.clothUsed) || 0, clothWasted: Number(a.clothWasted) || 0, status: a.status }); setError(""); }}
                        style={{ padding: "4px 12px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--canvas)", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "var(--primary)" }}>
                        Update
                      </button>
                    )}
                  </div>
                </div>

                {/* Step trail */}
                <StepTrail status={a.status} />

                {/* Pieces progress */}
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Pieces</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>
                      <span style={{ color: piecePct === 100 ? "#10b981" : "var(--ink)" }}>{a.piecesCompleted}</span>
                      <span style={{ color: "var(--muted)", fontWeight: 400 }}> / {a.targetPieces}</span>
                      <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 11 }}> ({Math.round(piecePct)}%)</span>
                    </span>
                  </div>
                  <ProgressBar value={a.piecesCompleted} max={a.targetPieces} />
                </div>

                {/* Cloth usage */}
                {(a.clothUsed > 0 || a.metersAssigned > 0) && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Cloth used</span>
                      <span style={{ fontSize: 12 }}>
                        <span style={{ fontWeight: 700 }}>{a.clothUsed}m</span>
                        <span style={{ color: "var(--muted)" }}> / {a.metersAssigned}m</span>
                        {a.clothWasted > 0 && <span style={{ color: "#f59e0b", marginLeft: 6, fontSize: 11 }}>· {a.clothWasted}m waste</span>}
                      </span>
                    </div>
                    <ProgressBar value={a.clothUsed} max={a.metersAssigned} color="#6366f1" />
                  </div>
                )}

                {/* Cost per piece */}
                {a.costPerPiece != null && a.piecesCompleted > 0 && (
                  <div style={{ marginTop: 10, padding: "8px 10px", background: "var(--canvas)", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>COST / PIECE</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>₹{a.costPerPiece}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
