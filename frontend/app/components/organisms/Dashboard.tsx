"use client";
import React, { useState, useEffect, memo } from "react";
import { X, Truck, Receipt, Package, Scissors, Shirt, Tag, ShoppingCart, Landmark, AlertTriangle, AlertOctagon } from "lucide-react";
import type { CustomRole, DashboardStats, Employee, Tab } from "@/app/types";
import { formatMoney } from "@/app/lib/formatters";
import StatCard from "@/app/components/molecules/StatCard";

interface RawBatch { id: string; batchNumber: string; availableMeters: number; clothCategory: { id: string; name: string }; clothColor: { id: string; name: string; hexCode?: string }; warehouse: { id: string; name: string } }
interface ReadymadeItem { id: string; quantityAvailable: number; size: string; itemType: { id: string; name: string }; warehouse: { id: string; name: string } }
interface CuttingJob { id: string; status: string; piecesCompleted: number; targetPieces: number; clothUsed: number; metersAssigned: number; itemType: { name: string } }
interface StitchingJob { id: string; status: string; piecesCompleted: number; piecesAssigned: number; piecesRejected: number }
interface ReorderPoint { id: string; itemKind: string; active: boolean; warehouse: { id: string; name: string }; clothCategory?: { id: string; name: string } | null; clothColor?: { id: string; name: string } | null; thresholdMeters?: number | null; itemType?: { id: string; name: string } | null; size?: string; thresholdPieces?: number | null }


function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>
      {children}
    </div>
  );
}

function AlertRow({ critical, title, sub, color }: { critical?: boolean; title: string; sub: string; color: string }) {
  const Icon = critical ? AlertOctagon : AlertTriangle;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
      <Icon size={15} color={color} style={{ marginTop: 2, flexShrink: 0 }} />
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

const FLOW_STEPS: { tab: Tab; icon: React.ReactNode; label: string; getValue: (s: DashboardStats) => string; getAlert?: (s: DashboardStats) => boolean }[] = [
  { tab: "suppliers",        icon: <Truck size={18} />,       label: "Suppliers",    getValue: s => `${s.totalSuppliers ?? 0} vendors` },
  { tab: "purchase_bills",   icon: <Receipt size={18} />,     label: "Purchase",     getValue: s => formatMoney(s.supplierTotalPurchased ?? 0), getAlert: s => (s.supplierTotalPending ?? 0) > 0 },
  { tab: "raw_cloth",        icon: <Package size={18} />,     label: "Raw Cloth",    getValue: s => `${(s.totalRawMeters ?? 0).toFixed(0)} m` },
  { tab: "cutting",          icon: <Scissors size={18} />,    label: "Cutting",      getValue: s => `${s.cuttingInProgress ?? 0} active`,     getAlert: s => (s.cuttingInProgress ?? 0) > 0 },
  { tab: "stitching",        icon: <Shirt size={18} />,       label: "Stitching",    getValue: s => `${s.stitchingInProgress ?? 0} active`,   getAlert: s => (s.stitchingInProgress ?? 0) > 0 },
  { tab: "finished_products",icon: <Tag size={18} />,         label: "Finished",     getValue: s => `${s.totalFinishedPieces ?? 0} pcs` },
  { tab: "sales_orders",     icon: <ShoppingCart size={18} />,label: "Sales",        getValue: s => `${s.activeSalesOrders ?? 0} orders`,     getAlert: s => (s.activeSalesOrders ?? 0) > 0 },
  { tab: "credit",           icon: <Landmark size={18} />,    label: "Payments",     getValue: s => formatMoney(s.creditOutstanding ?? 0),    getAlert: s => (s.creditOutstanding ?? 0) > 0 },
];

function WorkflowGuide({ stats, onNavigate }: { stats: DashboardStats; onNavigate?: (tab: Tab) => void }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <SectionLabel>Production Pipeline</SectionLabel>
      <div style={{ overflowX: "auto", paddingBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 0, minWidth: "max-content" }}>
          {FLOW_STEPS.map((step, i) => {
            const val = stats ? step.getValue(stats) : "—";
            const alert = stats && step.getAlert ? step.getAlert(stats) : false;
            return (
              <div key={step.tab} style={{ display: "flex", alignItems: "center" }}>
                <button type="button"
                  onClick={() => onNavigate?.(step.tab)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    background: "var(--paper)", border: `1.5px solid ${alert ? "#f59e0b66" : "var(--line)"}`,
                    borderRadius: 10, padding: "10px 14px", cursor: "pointer",
                    minWidth: 88, transition: "box-shadow 0.15s, border-color 0.15s",
                    gap: 3,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.10)")}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
                >
                  <span style={{ display: "flex", color: alert ? "#b45309" : "var(--muted)" }}>{step.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: alert ? "#b45309" : "var(--ink)", marginTop: 4, whiteSpace: "nowrap" }}>{val}</span>
                  <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{step.label}</span>
                </button>
                {i < FLOW_STEPS.length - 1 && (
                  <span style={{ fontSize: 14, color: "var(--muted)", padding: "0 5px", flexShrink: 0 }}>→</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Dashboard({
  stats, profile, rawBatches = [], readymadeStock = [], reorderPoints = [], role = "STORE_KEEPER",
  cuttingAssignments = [], stitchingJobs = [], onNavigate,
}: {
  stats?: DashboardStats; profile?: Employee; role?: string;
  rawBatches?: RawBatch[]; readymadeStock?: ReadymadeItem[]; reorderPoints?: ReorderPoint[];
  cuttingAssignments?: CuttingJob[]; stitchingJobs?: StitchingJob[];
  onNavigate?: (tab: Tab) => void;
}) {
  const customRole: CustomRole | null = profile?.customRole ?? null;
  const [alertsDismissed, setAlertsDismissed] = useState(false);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);

  if (!stats || !profile) {
    return (
      <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ height: 80, borderRadius: 12, background: "linear-gradient(90deg, var(--line) 25%, var(--canvas) 50%, var(--line) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
        ))}
      </div>
    );
  }

  // An alert needs a reorder point behind it. Out-of-stock used to fire for
  // anything sitting at zero, and a cloth batch reaching zero is the normal end
  // of its life rather than a problem — so the dashboard filled with warnings
  // about stock nobody had said they wanted kept. Say what you want kept, by
  // setting a minimum, and only then does its absence get reported.
  const rawReorderFor = (b: typeof rawBatches[number]) => reorderPoints.find(r =>
    r.itemKind === "RAW_CLOTH" && r.active &&
    r.clothCategory?.id === b.clothCategory.id &&
    r.warehouse.id === b.warehouse.id &&
    (!r.clothColor || r.clothColor.id === b.clothColor.id)
  );
  const rmdReorderFor = (r: typeof readymadeStock[number]) => reorderPoints.find(p =>
    p.itemKind === "FINISHED" && p.active &&
    p.itemType?.id === r.itemType.id &&
    p.warehouse.id === r.warehouse.id &&
    (!p.size || p.size === r.size)
  );

  const outRaw = rawBatches.filter(b => b.availableMeters <= 0 && rawReorderFor(b));
  const lowRaw = rawBatches.flatMap(b => {
    if (b.availableMeters <= 0) return [];
    const rp = rawReorderFor(b);
    if (!rp || rp.thresholdMeters == null || b.availableMeters >= rp.thresholdMeters) return [];
    return [{ batch: b, threshold: rp.thresholdMeters }];
  });
  const outRmd = readymadeStock.filter(r => r.quantityAvailable <= 0 && rmdReorderFor(r));
  const lowRmd = readymadeStock.flatMap(r => {
    if (r.quantityAvailable <= 0) return [];
    const rp = rmdReorderFor(r);
    if (!rp || rp.thresholdPieces == null || r.quantityAvailable >= rp.thresholdPieces) return [];
    return [{ item: r, threshold: rp.thresholdPieces }];
  });
  const totalAlerts = lowRaw.length + outRaw.length + lowRmd.length + outRmd.length;

  const isCustomRole = !!customRole;
  const tp = customRole?.tabPermissions || {};
  const isSuperAdmin = !isCustomRole && role === "SUPER_ADMIN";
  const isAdmin = !isCustomRole && role === "ADMIN";
  const isManager = !isCustomRole && role === "MANAGER";
  const isCuttingMaster = !isCustomRole && role === "CUTTING_MASTER";
  const isTailor = !isCustomRole && role === "TAILOR";
  const isStoreKeeper = !isCustomRole && role === "STORE_KEEPER";
  const isAuditor = !isCustomRole && role === "AUDITOR";

  const showFullStats = isSuperAdmin || isAdmin || isManager || isAuditor;
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  return (
    <div style={{ padding: 28 }}>
      {/* Welcome */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
            {greeting}, {profile.username} 👋
          </h1>
          <div style={{ color: "var(--muted)", marginTop: 5, fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
            {customRole ? (
              <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                background: customRole.color + "22", color: customRole.color, border: `1px solid ${customRole.color}44` }}>
                {customRole.displayName}
              </span>
            ) : (
              <span>{role.replace(/_/g, " ")}</span>
            )}
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{(profile.locations ?? []).map(l => l.name).join(", ") || "All locations"}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--primary)" }}>{timeStr}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{dateStr}</div>
        </div>
      </div>

      {/* ─── CUSTOM ROLE view (composite by tab permissions) ─────────── */}
      {isCustomRole && (
        <>
          {(tp.cutting || tp.stitching) && (
            <>
              <SectionLabel>Production Overview</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14, marginBottom: 28 }}>
                {tp.cutting && <StatCard label="Cutting In Progress" value={stats.cuttingInProgress ?? 0} color="#f59e0b" />}
                {tp.cutting && <StatCard label="Pieces Cut" value={cuttingAssignments.reduce((s, j) => s + (j.piecesCompleted || 0), 0)} sub={`of ${cuttingAssignments.reduce((s, j) => s + (j.targetPieces || 0), 0)} target`} color="#f59e0b" />}
                {tp.stitching && <StatCard label="Stitching In Progress" value={stats.stitchingInProgress ?? 0} color="#6366f1" />}
                {tp.stitching && <StatCard label="Pieces Stitched" value={stitchingJobs.reduce((s, j) => s + (j.piecesCompleted || 0), 0)} color="#6366f1" />}
              </div>
            </>
          )}
          {(tp.raw_cloth || tp.readymade_stock || tp.finished_products) && (
            <>
              <SectionLabel>Inventory</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14, marginBottom: 28 }}>
                {tp.raw_cloth && <StatCard label="Raw Cloth Available" value={`${(stats.totalRawMeters ?? 0).toFixed(1)} m`} color="var(--primary)" />}
                {tp.finished_products && <StatCard label="Finished Pieces" value={stats.totalFinishedPieces ?? 0} sub={`${stats.inhousePieces ?? 0} stitched · ${stats.readymadePieces ?? 0} imported`} />}
                {tp.readymade_stock && <StatCard label="Readymade Stock" value={stats.readymadePieces ?? 0} sub="pieces in stock" />}
              </div>
            </>
          )}
          {(tp.purchase_orders || tp.purchase_bills || tp.suppliers) && (
            <>
              <SectionLabel>Procurement</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14, marginBottom: 28 }}>
                {tp.purchase_orders && <StatCard label="Active Purchase Orders" value={stats.activePurchaseOrders ?? 0} color="#2196f3" />}
                {tp.suppliers && <StatCard label="Suppliers" value={stats.totalSuppliers ?? 0} />}
                {tp.purchase_bills && <StatCard label="Pending to Suppliers" value={formatMoney(stats.supplierTotalPending ?? 0)} color={(stats.supplierTotalPending ?? 0) > 0 ? "#e65100" : "#2e7d32"} />}
              </div>
            </>
          )}
          {(tp.sales_orders || tp.credit || tp.expenses || tp.reports) && (
            <>
              <SectionLabel>Sales & Finance</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14, marginBottom: 28 }}>
                {tp.sales_orders && <StatCard label="Active Sales Orders" value={stats.activeSalesOrders ?? 0} color="#9c27b0" />}
                {tp.sales_orders && <StatCard label="Buyers" value={stats.totalBuyers ?? 0} />}
                {(tp.reports || tp.sales_orders) && <StatCard label="Revenue This Month" value={formatMoney(stats.revenueThisMonth ?? 0)} color="var(--accent)" />}
                {(tp.reports || tp.sales_orders) && <StatCard label="Revenue This Year" value={formatMoney(stats.revenueThisYear ?? 0)} color="var(--accent)" />}
                {(tp.credit) && <StatCard label="Credit Outstanding" value={formatMoney(stats.creditOutstanding ?? 0)} color={(stats.creditOutstanding ?? 0) > 0 ? "#f44336" : "#4caf50"} sub="Pending from buyers" />}
                {(tp.credit) && <StatCard label="Overdue" value={formatMoney(stats.creditOverdue ?? 0)} color={(stats.creditOverdue ?? 0) > 0 ? "#b71c1c" : "#4caf50"} />}
                {tp.expenses && <StatCard label="Expenses This Month" value={formatMoney(stats.expensesThisMonth ?? 0)} color="#dc2626" />}
              </div>
              {(tp.reports || tp.sales_orders) && <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>Delivered orders only</div>}
            </>
          )}
          {Object.values(tp).every(v => !v) && (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>👋</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>Welcome, {profile.username}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Your dashboard will show stats for the tabs assigned to your role.</div>
            </div>
          )}
        </>
      )}

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
                <button type="button" onClick={() => setAlertsDismissed(true)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#b45309", padding: 4, borderRadius: 6 }}>
                  <X size={14} />
                </button>
              </div>
              <div style={{ background: "var(--paper)", border: "1px solid #f59e0b55", borderRadius: 12, overflow: "hidden" }}>
                {outRaw.map(b => <AlertRow key={b.id} critical color="#dc2626" title={`OUT OF STOCK: ${b.clothCategory.name} — ${b.clothColor.name}`} sub={`${b.batchNumber} · ${b.warehouse.name}`} />)}
                {lowRaw.map(({ batch: b, threshold }) => <AlertRow key={b.id} color="#b45309" title={`Low raw cloth: ${b.clothCategory.name} — ${b.clothColor.name}`} sub={`${b.batchNumber} · ${b.warehouse.name} · ${b.availableMeters.toFixed(1)}m left (reorder at ${threshold}m)`} />)}
                {outRmd.map(r => <AlertRow key={r.id} critical color="#dc2626" title={`OUT OF STOCK: ${r.itemType.name}${r.size ? ` · ${r.size}` : ""}`} sub={`${r.warehouse.name}`} />)}
                {lowRmd.map(({ item: r, threshold }) => <AlertRow key={r.id} color="#b45309" title={`Low readymade: ${r.itemType.name}${r.size ? ` · ${r.size}` : ""}`} sub={`${r.warehouse.name} · ${r.quantityAvailable} pcs left (reorder at ${threshold} pcs)`} />)}
              </div>
            </div>
          )}
          <SectionLabel>Inventory Snapshot</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14 }}>
            <StatCard label="Raw Cloth Available" value={`${(stats.totalRawMeters ?? 0).toFixed(1)} m`} color={outRaw.length > 0 || lowRaw.length > 0 ? "#f59e0b" : "var(--primary)"} />
            <StatCard label="Finished Pieces" value={stats.totalFinishedPieces ?? 0} sub={`${stats.inhousePieces ?? 0} stitched · ${stats.readymadePieces ?? 0} imported`} />
            <StatCard label="Cutting In Progress" value={stats.cuttingInProgress ?? 0} color="#ff9800" />
            <StatCard label="Stitching In Progress" value={stats.stitchingInProgress ?? 0} color="#ff9800" />
          </div>
        </>
      )}

      {/* ─── MANAGER / ADMIN / SUPER_ADMIN / AUDITOR view ───────────── */}
      {showFullStats && (
        <>
          <WorkflowGuide stats={stats} onNavigate={onNavigate} />
          {totalAlerts > 0 && !alertsDismissed && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ marginBottom: 10, fontSize: 11, fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: 1, display: "flex", alignItems: "center", gap: 6 }}>
                <span>⚠ Stock Alerts</span>
                <span style={{ background: "#f59e0b", color: "#fff", borderRadius: 99, fontSize: 10, padding: "1px 7px", fontWeight: 700 }}>{totalAlerts}</span>
                <button type="button" onClick={() => setAlertsDismissed(true)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#b45309", padding: 4, borderRadius: 6 }}>
                  <X size={14} />
                </button>
              </div>
              <div style={{ background: "var(--paper)", border: "1px solid #f59e0b55", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(245,158,11,0.08)" }}>
                {outRaw.map(b => <AlertRow key={b.id} critical color="#dc2626" title={`OUT OF STOCK: ${b.clothCategory.name} — ${b.clothColor.name}`} sub={`${b.batchNumber} · ${b.warehouse.name} · 0m remaining`} />)}
                {lowRaw.map(({ batch: b, threshold }) => <AlertRow key={b.id} color="#b45309" title={`Low raw cloth: ${b.clothCategory.name} — ${b.clothColor.name}`} sub={`${b.batchNumber} · ${b.warehouse.name} · ${b.availableMeters.toFixed(1)}m remaining (reorder at ${threshold}m)`} />)}
                {outRmd.map(r => <AlertRow key={r.id} critical color="#dc2626" title={`OUT OF STOCK: ${r.itemType.name}${r.size ? ` · ${r.size}` : ""}`} sub={`${r.warehouse.name} · 0 pcs remaining`} />)}
                {lowRmd.map(({ item: r, threshold }) => <AlertRow key={r.id} color="#b45309" title={`Low readymade stock: ${r.itemType.name}${r.size ? ` · ${r.size}` : ""}`} sub={`${r.warehouse.name} · ${r.quantityAvailable} pcs remaining (reorder at ${threshold} pcs)`} />)}
              </div>
            </div>
          )}

          <SectionLabel>Inventory Snapshot</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14, marginBottom: 28 }}>
            <StatCard label="Raw Cloth Available" value={`${(stats.totalRawMeters ?? 0).toFixed(1)} m`} color={outRaw.length > 0 || lowRaw.length > 0 ? "#f59e0b" : "var(--primary)"} />
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
              <SectionLabel>Revenue</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14, marginBottom: 8 }}>
                <StatCard label="Revenue This Month" value={formatMoney(stats.revenueThisMonth ?? 0)} color="var(--accent)" />
                <StatCard label="Revenue This Year" value={formatMoney(stats.revenueThisYear ?? 0)} color="var(--accent)" />
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 20 }}>Delivered orders only</div>

              <SectionLabel>Supplier Payments (Invoices)</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14, marginBottom: 28 }}>
                <StatCard
                  label="Total Purchased"
                  value={formatMoney(stats.supplierTotalPurchased ?? 0)}
                  color="var(--ink)"
                />
                <StatCard
                  label="Paid to Suppliers"
                  value={formatMoney(stats.supplierTotalPaid ?? 0)}
                  color="#2e7d32"
                />
                <StatCard
                  label="Pending to Suppliers"
                  value={formatMoney(stats.supplierTotalPending ?? 0)}
                  color={(stats.supplierTotalPending ?? 0) > 0 ? "#e65100" : "#2e7d32"}
                  sub={(stats.supplierTotalPending ?? 0) > 0 ? "Amount still owed" : "All settled"}
                />
              </div>

              <SectionLabel>Expenses</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14, marginBottom: 28 }}>
                <StatCard label="Expenses This Month" value={formatMoney(stats.expensesThisMonth ?? 0)} color="#dc2626" />
                <StatCard label="Expenses This Year" value={formatMoney(stats.expensesThisYear ?? 0)} color="#b91c1c" />
              </div>

              <SectionLabel>Buyer Credit & Payments</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14 }}>
                <StatCard
                  label="Outstanding (Unpaid)"
                  value={formatMoney(stats.creditOutstanding ?? 0)}
                  color={(stats.creditOutstanding ?? 0) > 0 ? "#f44336" : "#4caf50"}
                  sub="Pending from buyers"
                />
                <StatCard
                  label="Received from Buyers"
                  value={formatMoney(stats.creditReceived ?? 0)}
                  color="#1565c0"
                  sub="Paid on credit accounts"
                />
                <StatCard
                  label="Overdue"
                  value={formatMoney(stats.creditOverdue ?? 0)}
                  color={(stats.creditOverdue ?? 0) > 0 ? "#b71c1c" : "#4caf50"}
                  sub="Past due date"
                />
                <StatCard
                  label="Fully Settled"
                  value={formatMoney(stats.creditSettled ?? 0)}
                  color="#2e7d32"
                  sub="Closed credit accounts"
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default memo(Dashboard);
