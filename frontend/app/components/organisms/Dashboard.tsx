"use client";
import { useState } from "react";
import { X } from "lucide-react";
import type { DashboardStats, Employee } from "@/app/types";
import { formatMoney } from "@/app/lib/formatters";

interface RawBatch { id: string; batchNumber: string; availableMeters: number; clothCategory: { name: string }; clothColor: { name: string; hexCode?: string }; warehouse: { name: string } }
interface ReadymadeItem { id: string; quantityAvailable: number; size: string; itemType: { name: string }; warehouse: { name: string } }
interface CuttingJob { id: string; status: string; piecesCompleted: number; targetPieces: number; clothUsed: number; metersAssigned: number; itemType: { name: string } }
interface StitchingJob { id: string; status: string; piecesCompleted: number; piecesAssigned: number; piecesRejected: number }

const LOW_RAW_THRESHOLD = 50;
const LOW_RMD_THRESHOLD = 10;

function StatCard({ label, value, sub, color = "var(--primary)" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--border)", borderRadius: 12,
      padding: "18px 22px", borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "var(--fg)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>
      {children}
    </div>
  );
}

function AlertRow({ icon, title, sub, color }: { icon: string; title: string; sub: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
      <span style={{ fontSize: 16, marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: 8, background: "var(--line)", borderRadius: 99, overflow: "hidden", marginTop: 8 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.4s" }} />
    </div>
  );
}

export default function Dashboard({
  stats, profile, rawBatches = [], readymadeStock = [], role = "STORE_KEEPER",
  cuttingAssignments = [], stitchingJobs = [],
}: {
  stats?: DashboardStats; profile?: Employee; role?: string;
  rawBatches?: RawBatch[]; readymadeStock?: ReadymadeItem[];
  cuttingAssignments?: CuttingJob[]; stitchingJobs?: StitchingJob[];
}) {
  const [alertsDismissed, setAlertsDismissed] = useState(false);

  if (!stats || !profile) {
    return <div style={{ padding: 28, color: "var(--muted)" }}>Loading dashboard…</div>;
  }

  const lowRaw = rawBatches.filter(b => b.availableMeters > 0 && b.availableMeters < LOW_RAW_THRESHOLD);
  const outRaw = rawBatches.filter(b => b.availableMeters <= 0);
  const lowRmd = readymadeStock.filter(r => r.quantityAvailable > 0 && r.quantityAvailable < LOW_RMD_THRESHOLD);
  const outRmd = readymadeStock.filter(r => r.quantityAvailable <= 0);
  const totalAlerts = lowRaw.length + outRaw.length + lowRmd.length + outRmd.length;

  const isSuperAdmin = role === "SUPER_ADMIN";
  const isAdmin = role === "ADMIN";
  const isManager = role === "MANAGER";
  const isCuttingMaster = role === "CUTTING_MASTER";
  const isTailor = role === "TAILOR";
  const isStoreKeeper = role === "STORE_KEEPER";
  const isAuditor = role === "AUDITOR";

  const showFullStats = isSuperAdmin || isAdmin || isManager || isAuditor;

  return (
    <div style={{ padding: 28 }}>
      {/* Welcome */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Welcome back, {profile.username}
        </h1>
        <div style={{ color: "var(--muted)", marginTop: 4, fontSize: 14 }}>
          {role.replace(/_/g, " ")} · {(profile.locations ?? []).map(l => l.name).join(", ") || "All locations"}
        </div>
      </div>

      {/* ─── CUTTING MASTER view ─────────────────────────────────────── */}
      {isCuttingMaster && (
        <>
          <SectionLabel>My Cutting Assignments</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14, marginBottom: 28 }}>
            <StatCard label="Total Assigned" value={cuttingAssignments.length} color="#f59e0b" />
            <StatCard label="In Progress" value={cuttingAssignments.filter(j => j.status === "IN_PROGRESS").length} color="#f59e0b" />
            <StatCard label="Completed" value={cuttingAssignments.filter(j => j.status === "COMPLETED").length} color="#10b981" />
            <StatCard
              label="Pieces Cut"
              value={cuttingAssignments.reduce((s, j) => s + (j.piecesCompleted || 0), 0)}
              sub={`of ${cuttingAssignments.reduce((s, j) => s + (j.targetPieces || 0), 0)} target`}
              color="#6366f1"
            />
          </div>

          {cuttingAssignments.filter(j => j.status !== "COMPLETED").length > 0 && (
            <>
              <SectionLabel>Active Jobs</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                {cuttingAssignments.filter(j => j.status !== "COMPLETED").map(j => (
                  <div key={j.id} style={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{j.itemType?.name}</div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
                        background: j.status === "IN_PROGRESS" ? "#f59e0b22" : "#94a3b822",
                        color: j.status === "IN_PROGRESS" ? "#b45309" : "var(--muted)" }}>
                        {j.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                      {j.piecesCompleted} / {j.targetPieces} pieces · {(j.clothUsed || 0).toFixed(1)}m used of {j.metersAssigned}m
                    </div>
                    <ProgressBar value={j.piecesCompleted} max={j.targetPieces} color="#f59e0b" />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ─── TAILOR view ─────────────────────────────────────────────── */}
      {isTailor && (
        <>
          <SectionLabel>My Stitching Jobs</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14, marginBottom: 28 }}>
            <StatCard label="Total Jobs" value={stitchingJobs.length} color="#6366f1" />
            <StatCard label="In Progress" value={stitchingJobs.filter(j => j.status === "PROCESSING").length} color="#f59e0b" />
            <StatCard label="Completed" value={stitchingJobs.filter(j => j.status === "READY").length} color="#10b981" />
            <StatCard
              label="Pieces Stitched"
              value={stitchingJobs.reduce((s, j) => s + (j.piecesCompleted || 0), 0)}
              sub={`${stitchingJobs.reduce((s, j) => s + (j.piecesRejected || 0), 0)} rejected`}
              color="#6366f1"
            />
          </div>

          {stitchingJobs.filter(j => j.status !== "READY" && j.status !== "REJECTED").length > 0 && (
            <>
              <SectionLabel>Active Jobs</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                {stitchingJobs.filter(j => j.status !== "READY" && j.status !== "REJECTED").map(j => (
                  <div key={j.id} style={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>Stitching Job</div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
                        background: "#6366f122", color: "#4f46e5" }}>
                        {j.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                      {j.piecesCompleted} / {j.piecesAssigned} pieces
                      {j.piecesRejected > 0 && <span style={{ color: "#ef4444" }}> · {j.piecesRejected} rejected</span>}
                    </div>
                    <ProgressBar value={j.piecesCompleted} max={j.piecesAssigned} color="#6366f1" />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ─── STORE KEEPER view ───────────────────────────────────────── */}
      {isStoreKeeper && (
        <>
          {totalAlerts > 0 && !alertsDismissed && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ marginBottom: 10, fontSize: 11, fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: 1, display: "flex", alignItems: "center", gap: 6 }}>
                <span>⚠ Stock Alerts</span>
                <span style={{ background: "#f59e0b", color: "#fff", borderRadius: 99, fontSize: 10, padding: "1px 7px", fontWeight: 700 }}>{totalAlerts}</span>
                <button onClick={() => setAlertsDismissed(true)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#b45309", padding: 4, borderRadius: 6 }}>
                  <X size={14} />
                </button>
              </div>
              <div style={{ background: "var(--paper)", border: "1px solid #f59e0b55", borderRadius: 12, overflow: "hidden" }}>
                {outRaw.map(b => <AlertRow key={b.id} icon="🚨" color="#dc2626" title={`OUT OF STOCK: ${b.clothCategory.name} — ${b.clothColor.name}`} sub={`${b.batchNumber} · ${b.warehouse.name}`} />)}
                {lowRaw.map(b => <AlertRow key={b.id} icon="⚠️" color="#b45309" title={`Low raw cloth: ${b.clothCategory.name} — ${b.clothColor.name}`} sub={`${b.batchNumber} · ${b.warehouse.name} · ${b.availableMeters.toFixed(1)}m left`} />)}
                {outRmd.map(r => <AlertRow key={r.id} icon="🚨" color="#dc2626" title={`OUT OF STOCK: ${r.itemType.name}${r.size ? ` · ${r.size}` : ""}`} sub={`${r.warehouse.name}`} />)}
                {lowRmd.map(r => <AlertRow key={r.id} icon="⚠️" color="#b45309" title={`Low readymade: ${r.itemType.name}${r.size ? ` · ${r.size}` : ""}`} sub={`${r.warehouse.name} · ${r.quantityAvailable} pcs left`} />)}
              </div>
            </div>
          )}
          <SectionLabel>Inventory Snapshot</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14 }}>
            <StatCard label="Raw Cloth Available" value={`${(stats.totalRawMeters ?? 0).toFixed(1)} m`} color={lowRaw.length > 0 || outRaw.length > 0 ? "#f59e0b" : "var(--primary)"} />
            <StatCard label="Finished Pieces" value={stats.totalFinishedPieces ?? 0} sub={`${stats.inhousePieces ?? 0} stitched · ${stats.readymadePieces ?? 0} imported`} />
            <StatCard label="Cutting In Progress" value={stats.cuttingInProgress ?? 0} color="#ff9800" />
            <StatCard label="Stitching In Progress" value={stats.stitchingInProgress ?? 0} color="#ff9800" />
          </div>
        </>
      )}

      {/* ─── MANAGER / ADMIN / SUPER_ADMIN / AUDITOR view ───────────── */}
      {showFullStats && (
        <>
          {totalAlerts > 0 && !alertsDismissed && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ marginBottom: 10, fontSize: 11, fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: 1, display: "flex", alignItems: "center", gap: 6 }}>
                <span>⚠ Stock Alerts</span>
                <span style={{ background: "#f59e0b", color: "#fff", borderRadius: 99, fontSize: 10, padding: "1px 7px", fontWeight: 700 }}>{totalAlerts}</span>
                <button onClick={() => setAlertsDismissed(true)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#b45309", padding: 4, borderRadius: 6 }}>
                  <X size={14} />
                </button>
              </div>
              <div style={{ background: "var(--paper)", border: "1px solid #f59e0b55", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(245,158,11,0.08)" }}>
                <div style={{ background: "#fffbeb", padding: "10px 14px", borderBottom: "1px solid #f59e0b44", fontSize: 12, color: "#92400e", fontWeight: 600 }}>
                  Low stock threshold: raw cloth &lt; {LOW_RAW_THRESHOLD}m · readymade &lt; {LOW_RMD_THRESHOLD} pcs
                </div>
                {outRaw.map(b => <AlertRow key={b.id} icon="🚨" color="#dc2626" title={`OUT OF STOCK: ${b.clothCategory.name} — ${b.clothColor.name}`} sub={`${b.batchNumber} · ${b.warehouse.name} · 0m remaining`} />)}
                {lowRaw.map(b => <AlertRow key={b.id} icon="⚠️" color="#b45309" title={`Low raw cloth: ${b.clothCategory.name} — ${b.clothColor.name}`} sub={`${b.batchNumber} · ${b.warehouse.name} · ${b.availableMeters.toFixed(1)}m remaining`} />)}
                {outRmd.map(r => <AlertRow key={r.id} icon="🚨" color="#dc2626" title={`OUT OF STOCK: ${r.itemType.name}${r.size ? ` · ${r.size}` : ""}`} sub={`${r.warehouse.name} · 0 pcs remaining`} />)}
                {lowRmd.map(r => <AlertRow key={r.id} icon="⚠️" color="#b45309" title={`Low readymade stock: ${r.itemType.name}${r.size ? ` · ${r.size}` : ""}`} sub={`${r.warehouse.name} · ${r.quantityAvailable} pcs remaining`} />)}
              </div>
            </div>
          )}

          <SectionLabel>Inventory Snapshot</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14, marginBottom: 28 }}>
            <StatCard label="Raw Cloth Available" value={`${(stats.totalRawMeters ?? 0).toFixed(1)} m`} color={lowRaw.length > 0 || outRaw.length > 0 ? "#f59e0b" : "var(--primary)"} />
            <StatCard label="Finished Pieces" value={stats.totalFinishedPieces ?? 0} sub={`${stats.inhousePieces ?? 0} stitched · ${stats.readymadePieces ?? 0} imported`} />
            <StatCard label="Suppliers" value={stats.totalSuppliers ?? 0} />
            <StatCard label="Buyers" value={stats.totalBuyers ?? 0} />
          </div>

          <SectionLabel>Active Operations</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14, marginBottom: 28 }}>
            <StatCard label="Purchase Orders" value={stats.activePurchaseOrders ?? 0} color="#2196f3" />
            <StatCard label="Sales Orders" value={stats.activeSalesOrders ?? 0} color="#9c27b0" />
            <StatCard label="Cutting In Progress" value={stats.cuttingInProgress ?? 0} color="#ff9800" />
            <StatCard label="Stitching In Progress" value={stats.stitchingInProgress ?? 0} color="#ff9800" />
          </div>

          {!isAuditor && (
            <>
              <SectionLabel>Revenue & Credit</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14 }}>
                <StatCard label="Revenue This Month" value={formatMoney(stats.revenueThisMonth ?? 0)} color="var(--accent)" />
                <StatCard label="Revenue This Year" value={formatMoney(stats.revenueThisYear ?? 0)} color="var(--accent)" />
                <StatCard label="Credit Outstanding" value={formatMoney(stats.creditOutstanding ?? 0)} color={(stats.creditOutstanding ?? 0) > 0 ? "#f44336" : "#4caf50"} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
