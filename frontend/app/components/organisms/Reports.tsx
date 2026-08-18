"use client";
import React, { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { PLReport, AgingReport } from "@/app/types";
import { PL_REPORT_QUERY, AGING_REPORT_QUERY } from "@/app/lib/graphql";

interface Props {
  gql: <T>(q: string, v?: Record<string, unknown>) => Promise<T>;
}

const CURRENT_YEAR = new Date().getFullYear();

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card p-4 space-y-1">
      <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color: color ?? "var(--text-primary)" }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );
}

function pct(n: number) { return `${n.toFixed(1)}%`; }
function fmt(n: number) { return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0 })}`.replace(/\.0$/, ""); }

export default function Reports({ gql }: Props) {
  const [section, setSection] = useState<"pl" | "aging">("pl");

  // P&L state
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState<number | "">("");
  const [plData, setPlData] = useState<PLReport | null>(null);
  const [plLoading, setPlLoading] = useState(false);
  const [plErr, setPlErr] = useState("");

  // Aging state
  const [agingData, setAgingData] = useState<AgingReport | null>(null);
  const [agingLoading, setAgingLoading] = useState(false);
  const [agingErr, setAgingErr] = useState("");

  async function fetchPL() {
    setPlErr(""); setPlLoading(true);
    try {
      const data = await gql<{ profitLossReport: PLReport }>(PL_REPORT_QUERY, {
        year, month: month === "" ? null : month,
      });
      setPlData(data.profitLossReport);
    } catch (e: unknown) {
      setPlErr(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setPlLoading(false);
    }
  }

  async function fetchAging() {
    setAgingErr(""); setAgingLoading(true);
    try {
      const data = await gql<{ agingReport: AgingReport }>(AGING_REPORT_QUERY);
      setAgingData(data.agingReport);
    } catch (e: unknown) {
      setAgingErr(e instanceof Error ? e.message : "Failed to load aging report.");
    } finally {
      setAgingLoading(false);
    }
  }

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">Reports</h2>

      {/* Section tabs */}
      <div className="flex gap-2">
        {(["pl", "aging"] as const).map(s => (
          <button key={s} onClick={() => setSection(s)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: section === s ? "var(--primary)" : "var(--surface-2)",
              color: section === s ? "#fff" : "var(--text-secondary)",
            }}>
            {s === "pl" ? "Profit & Loss" : "Receivables Aging"}
          </button>
        ))}
      </div>

      {/* ── P&L section ─────────────────────────────────────────────────── */}
      {section === "pl" && (
        <div className="space-y-5">
          {/* Controls */}
          <div className="card p-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Year</label>
                <select value={year} onChange={e => setYear(Number(e.target.value))} className="input">
                  {Array.from({ length: 4 }, (_, i) => CURRENT_YEAR - i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Month (optional)</label>
                <select value={month} onChange={e => setMonth(e.target.value === "" ? "" : Number(e.target.value))} className="input">
                  <option value="">Full Year</option>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <button onClick={fetchPL} disabled={plLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white self-end"
                style={{ background: "var(--primary)" }}>
                {plLoading ? "Loading…" : "Generate"}
              </button>
            </div>
          </div>

          {plErr && <div className="p-3 rounded text-sm" style={{ background: "#fce4ec", color: "#c62828" }}>{plErr}</div>}

          {plData && (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <KpiCard label="Revenue" value={fmt(plData.revenue)} />
                <KpiCard label="COGS" value={fmt(plData.cogs)} />
                <KpiCard label="Gross Profit" value={fmt(plData.grossProfit)}
                  color={plData.grossProfit >= 0 ? "#4caf50" : "#f44336"}
                  sub={`Margin: ${pct(plData.grossMarginPct)}`} />
                <KpiCard label="Expenses" value={fmt(plData.expenses)} />
                <KpiCard label="Net Profit" value={fmt(plData.netProfit)}
                  color={plData.netProfit >= 0 ? "#4caf50" : "#f44336"}
                  sub={`Margin: ${pct(plData.netMarginPct)}`} />
              </div>

              {/* Monthly chart (only for full year) */}
              {plData.monthly.length > 0 && (
                <div className="card p-4">
                  <h3 className="text-sm font-semibold mb-4">Monthly Breakdown — {year}</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={plData.monthly} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--text-secondary)" />
                      <YAxis tick={{ fontSize: 11 }} stroke="var(--text-secondary)"
                        tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}
                        formatter={(v: unknown, name: string) => [fmt(typeof v === "number" ? v : 0), name]} />
                      <Legend />
                      <Bar dataKey="revenue" name="Revenue" fill="#2196f3" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cogs" name="COGS" fill="#ff9800" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expenses" name="Expenses" fill="#f44336" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="netProfit" name="Net Profit" fill="#4caf50" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}

          {!plData && !plLoading && (
            <div className="card p-8 text-center" style={{ color: "var(--text-secondary)" }}>
              Select a year and click Generate to view the P&amp;L report.
            </div>
          )}
        </div>
      )}

      {/* ── Aging section ────────────────────────────────────────────────── */}
      {section === "aging" && (
        <div className="space-y-5">
          <div>
            <button onClick={fetchAging} disabled={agingLoading}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "var(--primary)" }}>
              {agingLoading ? "Loading…" : "Generate Aging Report"}
            </button>
          </div>

          {agingErr && <div className="p-3 rounded text-sm" style={{ background: "#fce4ec", color: "#c62828" }}>{agingErr}</div>}

          {agingData && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <KpiCard label="Total Buyer Outstanding" value={fmt(agingData.totalBuyerOutstanding)} color="#f44336" />
                <KpiCard label="Total Supplier Outstanding" value={fmt(agingData.totalSupplierOutstanding)} color="#ff9800" />
              </div>

              {/* Buyer aging */}
              <div className="card overflow-hidden">
                <div className="px-4 pt-4 pb-2">
                  <h3 className="text-sm font-semibold">Buyer Receivables Aging</h3>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Outstanding credit by age bucket (days)</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                        {["Buyer", "0–30 days", "31–60 days", "61–90 days", "91+ days", "Total"].map(h => (
                          <th key={h} className="px-4 py-3 text-right first:text-left font-medium" style={{ color: "var(--text-secondary)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {agingData.buyerRows.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-6 text-center" style={{ color: "var(--text-secondary)" }}>No outstanding receivables</td></tr>
                      ) : agingData.buyerRows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td className="px-4 py-3 font-medium">{row.buyerName}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{row.bucket030 ? fmt(row.bucket030) : "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums" style={{ color: row.bucket3160 ? "#ff9800" : undefined }}>{row.bucket3160 ? fmt(row.bucket3160) : "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums" style={{ color: row.bucket6190 ? "#f57c00" : undefined }}>{row.bucket6190 ? fmt(row.bucket6190) : "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: row.bucket91Plus ? "#f44336" : undefined }}>{row.bucket91Plus ? fmt(row.bucket91Plus) : "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold">{fmt(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Supplier aging */}
              <div className="card overflow-hidden">
                <div className="px-4 pt-4 pb-2">
                  <h3 className="text-sm font-semibold">Supplier Payables Aging</h3>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Outstanding payables by bill age (days)</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                        {["Supplier", "0–30 days", "31–60 days", "61–90 days", "91+ days", "Total"].map(h => (
                          <th key={h} className="px-4 py-3 text-right first:text-left font-medium" style={{ color: "var(--text-secondary)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {agingData.supplierRows.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-6 text-center" style={{ color: "var(--text-secondary)" }}>No outstanding payables</td></tr>
                      ) : agingData.supplierRows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td className="px-4 py-3 font-medium">{row.supplierName}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{row.bucket030 ? fmt(row.bucket030) : "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums" style={{ color: row.bucket3160 ? "#ff9800" : undefined }}>{row.bucket3160 ? fmt(row.bucket3160) : "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums" style={{ color: row.bucket6190 ? "#f57c00" : undefined }}>{row.bucket6190 ? fmt(row.bucket6190) : "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: row.bucket91Plus ? "#f44336" : undefined }}>{row.bucket91Plus ? fmt(row.bucket91Plus) : "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold">{fmt(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {!agingData && !agingLoading && (
            <div className="card p-8 text-center" style={{ color: "var(--text-secondary)" }}>
              Click Generate to load the current aging report.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
