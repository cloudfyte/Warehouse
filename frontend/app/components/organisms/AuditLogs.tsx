"use client";
import { useState } from "react";
import type { AuditLog } from "@/app/types";
import { downloadCsv } from "@/app/lib/csv";

interface Props { logs: AuditLog[] }

const ENTITY_COLORS: Record<string, string> = {
  SalesOrder: "#3b82f6", PurchaseOrder: "#8b5cf6", CuttingAssignment: "#f59e0b",
  StitchingJob: "#10b981", RawClothBatch: "#6366f1", FinishedProduct: "#ec4899",
  Employee: "#14b8a6", Buyer: "#f97316", Supplier: "#84cc16",
  CreditTransaction: "#ef4444", BuyerReturn: "#a78bfa", SystemSettings: "#64748b",
};

function entityColor(type: string) { return ENTITY_COLORS[type] || "#94a3b8"; }

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AuditLogs({ logs }: Props) {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const entityTypes = Array.from(new Set(logs.map(l => l.entityType))).sort();
  const q = search.toLowerCase();
  const filtered = logs.filter(l =>
    (!entityFilter || l.entityType === entityFilter) &&
    (!q || l.action.toLowerCase().includes(q) || l.actorName.toLowerCase().includes(q) ||
      l.entityType.toLowerCase().includes(q) || l.entityId.includes(q))
  );

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>Audit Log</h2>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>{logs.length} total entries</p>
        </div>
        <button onClick={() => downloadCsv(`audit_log_${new Date().toISOString().slice(0,10)}.csv`, filtered.map(l => ({
          "Entity Type": l.entityType, "Entity ID": l.entityId, "Action": l.action,
          "Actor": l.actorName, "Detail": JSON.stringify(l.detail), "Time": l.createdAt,
        })))}
          style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          ⬇ Export CSV
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input placeholder="Search action, actor or entity…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--ink)", fontSize: 14 }} />
        <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--ink)", fontSize: 14 }}>
          <option value="">All entities</option>
          {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--line)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--canvas)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
              {["Time", "Entity", "ID", "Action", "Actor", ""].map(h => (
                <th key={h} style={{ padding: "10px 14px", fontWeight: 600, borderBottom: "1px solid var(--line)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(l => {
              const color = entityColor(l.entityType);
              return (
                <tr key={l.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{timeAgo(l.createdAt)}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: color + "22", color }}>
                      {l.entityType}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--muted)" }}>#{l.entityId}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13 }}>
                    {l.action.replace(/_/g, " ")}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 13 }}>{l.actorName || "System"}</td>
                  <td style={{ padding: "10px 14px" }}>
                    {Object.keys(l.detail).length > 0 && (
                      <button onClick={() => setDetail(l)}
                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--canvas)", cursor: "pointer", fontSize: 12 }}>
                        Details
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No audit log entries</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setDetail(null)}>
          <div style={{ background: "var(--paper)", borderRadius: 14, padding: 28, maxWidth: 520, width: "90vw", maxHeight: "80vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{detail.action.replace(/_/g, " ")}</div>
                <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                  {detail.entityType} #{detail.entityId} · {detail.actorName} · {timeAgo(detail.createdAt)}
                </div>
              </div>
              <button onClick={() => setDetail(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--muted)" }}>×</button>
            </div>
            <pre style={{ background: "var(--canvas)", borderRadius: 8, padding: 14, fontSize: 12, overflow: "auto", margin: 0, color: "var(--ink)" }}>
              {JSON.stringify(detail.detail, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
