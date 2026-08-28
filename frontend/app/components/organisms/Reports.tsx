"use client";
import React, { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { PLReport, AgingReport } from "@/app/types";
import { PL_REPORT_QUERY, AGING_REPORT_QUERY } from "@/app/lib/graphql";
import Button from "@/app/components/atoms/Button";
import Select from "@/app/components/atoms/Select";
import StatCard from "@/app/components/molecules/StatCard";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import PageHeader from "@/app/components/molecules/PageHeader";
import Field from "@/app/components/molecules/Field";
import { formatMoney } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";

interface Props {
  gql: <T>(q: string, v?: Record<string, unknown>) => Promise<T>;
}

const CURRENT_YEAR = new Date().getFullYear();

function pct(n: number) { return `${n.toFixed(1)}%`; }
const fmt = (n: number) => formatMoney(n, { decimals: 0 });

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
      setPlErr(friendlyError(e));
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
      setAgingErr(friendlyError(e));
    } finally {
      setAgingLoading(false);
    }
  }

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div className="space-y-5">
      <PageHeader title="Reports" />

      {/* Section tabs */}
      <div className="flex gap-2">
        {(["pl", "aging"] as const).map(s => (
          <Button key={s} variant={section === s ? "primary" : "secondary"} size="sm" onClick={() => setSection(s)}>
            {s === "pl" ? "Profit & Loss" : "Receivables Aging"}
          </Button>
        ))}
      </div>

      {/* ── P&L section ─────────────────────────────────────────────────── */}
      {section === "pl" && (
        <div className="space-y-5">
          {/* Controls */}
          <div className="card p-4">
            <div className="flex items-end gap-3 flex-wrap">
              <Field label="Year">
                <Select value={year} onChange={e => setYear(Number(e.target.value))}>
                  {Array.from({ length: 4 }, (_, i) => CURRENT_YEAR - i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Month (optional)">
                <Select value={month} onChange={e => setMonth(e.target.value === "" ? "" : Number(e.target.value))}>
                  <option value="">Full Year</option>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </Select>
              </Field>
              <Button variant="primary" onClick={fetchPL} disabled={plLoading} style={{ alignSelf: "flex-end" }}>
                {plLoading ? "Loading…" : "Generate"}
              </Button>
            </div>
          </div>

          <ErrorBanner msg={plErr} />

          {plData && (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <StatCard label="Revenue" value={fmt(plData.revenue)} />
                <StatCard label="COGS" value={fmt(plData.cogs)} />
                <StatCard label="Gross Profit" value={fmt(plData.grossProfit)}
                  color={plData.grossProfit >= 0 ? "#4caf50" : "#f44336"}
                  sub={`Margin: ${pct(plData.grossMarginPct)}`} />
                <StatCard label="Expenses" value={fmt(plData.expenses)} />
                <StatCard label="Net Profit" value={fmt(plData.netProfit)}
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
                        tickFormatter={v => formatMoney(v, { compact: true })} />
                      <Tooltip
                        contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}
                        formatter={(v: unknown, name: unknown) => [fmt(typeof v === "number" ? v : 0), name as string]} />
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
            <Button variant="primary" onClick={fetchAging} disabled={agingLoading}>
              {agingLoading ? "Loading…" : "Generate Aging Report"}
            </Button>
          </div>

          <ErrorBanner msg={agingErr} />

          {agingData && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Total Buyer Outstanding" value={fmt(agingData.totalBuyerOutstanding)} color="#f44336" />
                <StatCard label="Total Supplier Outstanding" value={fmt(agingData.totalSupplierOutstanding)} color="#ff9800" />
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
