"use client";
import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area, LineChart, Line,
} from "recharts";

// ─── types ────────────────────────────────────────────────────────────────────

interface MonthlyRevenue { month: string; revenue: number; orderCount: number }
interface MonthlyProduction { month: string; piecesCut: number; piecesStitched: number; clothWasted: number }
interface RevenueExpense { month: string; revenue: number; expenses: number }
interface StockCategory { category: string; meters: number; pieces: number }
interface TopBuyer { buyerName: string; totalSpend: number; orderCount: number }
interface TopSupplier { supplierName: string; totalPurchased: number; totalPending: number }

interface AnalyticsStats {
  monthlyRevenue: MonthlyRevenue[]
  monthlyProduction: MonthlyProduction[]
  revenueVsExpenses: RevenueExpense[]
  stockByCategory: StockCategory[]
  topBuyers: TopBuyer[]
  topSuppliers: TopSupplier[]
  clothWastagePct: number
  supplierTotalPending: number
}

interface AnalyticsData {
  analyticsStats: AnalyticsStats
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#8b5cf6", "#f97316", "#14b8a6"];

function fmtK(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n.toFixed(0)}`;
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 20px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: color ?? "var(--ink)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: 24, marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--muted)", marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

function Empty() {
  return <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: 13 }}>No data yet</div>;
}

const PERIODS = [
  { label: "3 months", months: 3 },
  { label: "6 months", months: 6 },
  { label: "12 months", months: 12 },
];

const TOOLTIP_STYLE = { borderRadius: 8, border: "1px solid var(--line)", background: "var(--paper)", fontSize: 12 };

// ─── component ────────────────────────────────────────────────────────────────

export default function Analytics({ gql }: { gql: (q: string) => Promise<AnalyticsData> }) {
  const [data, setData] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(12);

  useEffect(() => {
    gql(`{
      analyticsStats {
        monthlyRevenue { month revenue orderCount }
        monthlyProduction { month piecesCut piecesStitched clothWasted }
        revenueVsExpenses { month revenue expenses }
        stockByCategory { category meters pieces }
        topBuyers { buyerName totalSpend orderCount }
        topSuppliers { supplierName totalPurchased totalPending }
        clothWastagePct
        supplierTotalPending
      }
    }`)
      .then(d => setData(d.analyticsStats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [gql]);

  if (loading) return <div style={{ padding: 40, color: "var(--muted)", textAlign: "center" }}>Loading analytics…</div>;
  if (!data) return <div style={{ padding: 40, color: "var(--muted)", textAlign: "center" }}>Failed to load analytics</div>;

  const { monthlyRevenue, monthlyProduction, revenueVsExpenses, stockByCategory, topBuyers, topSuppliers, clothWastagePct, supplierTotalPending } = data;

  const revenueFiltered = [...monthlyRevenue].sort((a, b) => a.month.localeCompare(b.month)).slice(-period);
  const prodFiltered = [...monthlyProduction].sort((a, b) => a.month.localeCompare(b.month)).slice(-period);
  const revExpFiltered = [...revenueVsExpenses].sort((a, b) => a.month.localeCompare(b.month)).slice(-period);

  const totalRevenue = revenueFiltered.reduce((s, m) => s + m.revenue, 0);
  const totalOrders = revenueFiltered.reduce((s, m) => s + m.orderCount, 0);
  const totalPieces = prodFiltered.reduce((s, m) => s + m.piecesCut, 0);
  const totalExpenses = revExpFiltered.reduce((s, m) => s + m.expenses, 0);
  const netProfit = totalRevenue - totalExpenses;

  return (
    <div style={{ padding: 28 }}>
      {/* Header + period selector */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Analytics</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {PERIODS.map(p => (
            <button key={p.months} onClick={() => setPeriod(p.months)}
              style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: period === p.months ? "var(--primary)" : "transparent",
                color: period === p.months ? "#fff" : "var(--ink)" }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <StatCard label="Revenue" value={fmtK(totalRevenue)} sub={`${totalOrders} orders`} />
        <StatCard label="Net P&L" value={fmtK(netProfit)} sub="Rev − Expenses" color={netProfit >= 0 ? "#2e7d32" : "#c62828"} />
        <StatCard label="Pieces Cut" value={totalPieces.toLocaleString("en-IN")} sub="cutting assignments" />
        <StatCard label="Supplier Payable" value={fmtK(supplierTotalPending)} sub="outstanding balance" color={supplierTotalPending > 0 ? "#e65100" : undefined} />
      </div>

      {/* Cloth wastage KPI */}
      <div style={{ marginBottom: 24, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 20px", display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--muted)" }}>Cloth Wastage %</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, color: clothWastagePct > 15 ? "#c62828" : clothWastagePct > 8 ? "#e65100" : "#2e7d32" }}>
            {clothWastagePct.toFixed(1)}%
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>all-time cloth wasted ÷ cloth used in cutting</div>
        </div>
        <div style={{ flex: 1, minWidth: 200, height: 8, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(clothWastagePct, 100)}%`, height: "100%", borderRadius: 4,
            background: clothWastagePct > 15 ? "#c62828" : clothWastagePct > 8 ? "#e65100" : "#2e7d32" }} />
        </div>
      </div>

      {/* Monthly Revenue area chart */}
      <Section title={`Monthly Revenue — Last ${period} months`}>
        {revenueFiltered.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={revenueFiltered} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted)" }} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: "var(--muted)" }} width={60} />
              <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, "Revenue"]}
                labelStyle={{ fontSize: 12, fontWeight: 700 }} contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} fill="url(#rev)" dot={{ r: 3, fill: "#6366f1" }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* Revenue vs Expenses comparison */}
      <Section title={`Revenue vs Expenses — Last ${period} months`}>
        {revExpFiltered.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={revExpFiltered} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted)" }} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: "var(--muted)" }} width={60} />
              <Tooltip
                formatter={(v, name) => [`₹${Number(v).toLocaleString("en-IN")}`, name === "revenue" ? "Revenue" : "Expenses"]}
                labelStyle={{ fontSize: 12, fontWeight: 700 }} contentStyle={TOOLTIP_STYLE}
              />
              <Legend formatter={v => v === "revenue" ? "Revenue" : "Expenses"} iconType="circle" iconSize={8} />
              <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: "#10b981" }} />
              <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3, fill: "#ef4444" }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* Monthly Production */}
      <Section title={`Monthly Production — Last ${period} months`}>
        {prodFiltered.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={prodFiltered} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} width={40} />
              <Tooltip contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => [Number(v).toLocaleString("en-IN"), name === "piecesCut" ? "Pieces Cut" : name === "piecesStitched" ? "Pieces Stitched" : "Cloth Wasted (m)"]} />
              <Legend formatter={v => ({ piecesCut: "Pieces Cut", piecesStitched: "Pieces Stitched", clothWasted: "Cloth Wasted (m)" }[v] ?? v)} iconType="circle" iconSize={8} />
              <Bar dataKey="piecesCut" fill="#6366f1" name="piecesCut" radius={[3, 3, 0, 0]} />
              <Bar dataKey="piecesStitched" fill="#10b981" name="piecesStitched" radius={[3, 3, 0, 0]} />
              <Bar dataKey="clothWasted" fill="#f59e0b" name="clothWasted" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
        {/* Stock by Category */}
        <Section title="Stock by Category">
          {stockByCategory.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stockByCategory} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted)" }} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 10, fill: "var(--muted)" }} width={80} />
                <Tooltip contentStyle={TOOLTIP_STYLE}
                  formatter={(v, name) => [Number(v), String(name) === "meters" ? "Metres (cloth)" : "Pcs (readymade)"]} />
                <Bar dataKey="meters" fill="#3b82f6" name="meters" radius={[0, 4, 4, 0]} />
                <Bar dataKey="pieces" fill="#10b981" name="pieces" radius={[0, 4, 4, 0]} />
                <Legend iconType="circle" iconSize={8} formatter={v => v === "meters" ? "Metres" : "Pieces"} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* Top Buyers */}
        <Section title="Top Buyers by Revenue">
          {topBuyers.length === 0 ? <Empty /> : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={topBuyers} dataKey="totalSpend" nameKey="buyerName" outerRadius={75} innerRadius={40} paddingAngle={3}>
                    {topBuyers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, "Spend"]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
                {topBuyers.slice(0, 5).map((b, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.buyerName}</span>
                    <span style={{ fontWeight: 700, color: "var(--muted)" }}>{fmtK(b.totalSpend)}</span>
                    <span style={{ color: "var(--muted)", fontSize: 10 }}>({b.orderCount})</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>
      </div>

      {/* Top Suppliers */}
      <Section title="Top Suppliers by Purchases">
        {topSuppliers.length === 0 ? <Empty /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 120px", gap: 0, padding: "8px 12px", background: "var(--canvas)", borderRadius: "8px 8px 0 0", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)" }}>
              <span>Supplier</span>
              <span style={{ textAlign: "right" }}>Total Purchased</span>
              <span style={{ textAlign: "right" }}>Outstanding</span>
              <span style={{ textAlign: "right" }}>Paid %</span>
            </div>
            {topSuppliers.map((s, i) => {
              const paidPct = s.totalPurchased > 0 ? ((s.totalPurchased - s.totalPending) / s.totalPurchased * 100) : 100;
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 120px", gap: 0, padding: "10px 12px", borderBottom: "1px solid var(--line)", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{s.supplierName}</span>
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 700, fontSize: 13 }}>{fmtK(s.totalPurchased)}</div>
                  <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: s.totalPending > 0 ? "#e65100" : "#2e7d32" }}>
                    {s.totalPending > 0 ? fmtK(s.totalPending) : "Cleared"}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{paidPct.toFixed(0)}%</span>
                      <div style={{ width: 60, height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${paidPct}%`, height: "100%", borderRadius: 3, background: paidPct >= 100 ? "#2e7d32" : paidPct > 50 ? "#f59e0b" : "#ef4444" }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
