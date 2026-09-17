"use client";
import { useState, memo } from "react";
import { Download } from "lucide-react";
import type { AuditLog } from "@/app/types";
import { downloadCsv } from "@/app/lib/csv";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Button from "@/app/components/atoms/Button";
import Pagination from "@/app/components/atoms/Pagination";
import PageHeader from "@/app/components/molecules/PageHeader";
import FilterBar from "@/app/components/molecules/FilterBar";
import TotalsBar from "@/app/components/molecules/TotalsBar";

interface Props { logs: AuditLog[] }

const PER_PAGE = 25;

/** What the verb at the front of a mutation name means to a person. */
const VERBS: Record<string, { said: string; tone: string }> = {
  create:   { said: "added",      tone: "#2e7d32" },
  add:      { said: "added",      tone: "#2e7d32" },
  update:   { said: "changed",    tone: "#1565c0" },
  edit:     { said: "changed",    tone: "#1565c0" },
  set:      { said: "set",        tone: "#1565c0" },
  delete:   { said: "deleted",    tone: "#d32f2f" },
  remove:   { said: "removed",    tone: "#d32f2f" },
  cancel:   { said: "cancelled",  tone: "#d32f2f" },
  receive:  { said: "took in",    tone: "#6d28d9" },
  pay:      { said: "paid",       tone: "#e65100" },
  settle:   { said: "settled",    tone: "#e65100" },
  record:   { said: "recorded",   tone: "#e65100" },
  assign:   { said: "assigned",   tone: "#6d28d9" },
  hand:     { said: "handed over", tone: "#6d28d9" },
  dispatch: { said: "sent out",   tone: "#6d28d9" },
  print:    { said: "printed",    tone: "#64748b" },
  generate: { said: "generated",  tone: "#64748b" },
  login:    { said: "signed in",  tone: "#64748b" },
  token:    { said: "signed in",  tone: "#64748b" },
  verify:   { said: "signed in",  tone: "#64748b" },
  refresh:  { said: "signed in",  tone: "#64748b" },
};

/** "createCuttingAssignment" → { said: "added", subject: "cutting assignment" } */
function readAction(action: string) {
  const words = action.replace(/([A-Z])/g, " $1").trim().toLowerCase().split(" ");
  const verb = VERBS[words[0]] ?? { said: words[0], tone: "#64748b" };
  const subject = words.slice(1).join(" ");
  return { said: verb.said, tone: verb.tone, subject };
}

function when(iso: string, now: number): string {
  const secs = Math.floor(((now || new Date(iso).getTime()) - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  if (secs < 172800) return "yesterday";
  return new Date(iso).toLocaleString("en-IN",
    { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function exactly(iso: string): string {
  return new Date(iso).toLocaleString("en-IN",
    { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** The arguments, minus the ones that only repeat what the sentence said. */
function facts(detail: Record<string, unknown>): [string, string][] {
  return Object.entries(detail)
    .filter(([k, v]) => k !== "record" && v !== null && v !== "" && v !== undefined)
    .map(([k, v]) => [
      k.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase()),
      typeof v === "object" ? JSON.stringify(v) : String(v),
    ]);
}

/**
 * Who did what, in a sentence.
 *
 * This page used to be a dump of the table behind it — "CuttingAssignment #12 ·
 * STATUS_CHANGED_TO_READY" — and only six of the app's modules wrote to it at
 * all. Every mutation is recorded now, so the job here is to make a day's work
 * readable: a name, what they did, which record, and when.
 */
function AuditLogs({ logs }: Props) {
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState("");
  const [kind, setKind] = useState("");
  const [period, setPeriod] = useState("7");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const [page, setPage] = useState(1);
  // The clock is read once, so "last 7 days" means the same thing for every
  // row in one pass.
  const [now] = useState(() => Date.now());

  const people = Array.from(new Set(logs.map(l => l.actorName).filter(Boolean))).sort();
  const q = search.toLowerCase();
  const cutoff = period && now ? now - Number(period) * 86400000 : 0;

  const filtered = logs.filter(l => {
    if (person && l.actorName !== person) return false;
    if (cutoff && new Date(l.createdAt).getTime() < cutoff) return false;
    if (kind && readAction(l.action).said !== kind) return false;
    if (!q) return true;
    const record = String(l.detail?.record ?? "");
    return l.action.toLowerCase().includes(q) || l.actorName.toLowerCase().includes(q)
      || l.entityType.toLowerCase().includes(q) || record.toLowerCase().includes(q);
  });
  // Narrowing the filter can leave you past the end; clamp rather than reset,
  // so the page number never fights the filter.
  const lastPage = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const shownPage = Math.min(page, lastPage);
  const paged = filtered.slice((shownPage - 1) * PER_PAGE, shownPage * PER_PAGE);

  const today = now ? new Date(now).toDateString() : "";
  const changesToday = filtered.filter(l => new Date(l.createdAt).toDateString() === today).length;
  const kinds = Array.from(new Set(logs.map(l => readAction(l.action).said))).sort();

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Who did what"
        sub="Every change anybody made, newest first"
        actions={
          <Button variant="secondary" onClick={() => downloadCsv(
            `who-did-what-${new Date().toISOString().slice(0, 10)}.csv`,
            filtered.map(l => {
              const a = readAction(l.action);
              return {
                When: exactly(l.createdAt), Who: l.actorName || "System",
                Did: `${a.said} ${a.subject}`.trim(),
                Record: String(l.detail?.record ?? `${l.entityType} ${l.entityId}`),
                Details: facts(l.detail).map(([k, v]) => `${k}: ${v}`).join("; "),
              };
            })
          )}>
            <Download size={14} /> Export CSV
          </Button>
        }
      />

      <TotalsBar
        narrowed={filtered.length !== logs.length}
        note="Totals are for what you have filtered, not the whole trail."
        totals={[
          { label: "Changes", value: String(filtered.length) },
          { label: "Today", value: String(changesToday), color: "var(--primary)" },
          { label: "People", value: String(new Set(filtered.map(l => l.actorName)).size) },
        ]}
      />

      <FilterBar>
        <Input placeholder="Search a person, a record or an action…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 220, width: "auto" }} />
        <Select value={person} onChange={e => setPerson(e.target.value)} style={{ width: "auto", minWidth: 150 }}>
          <option value="">Everybody</option>
          {people.map(p => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Select value={kind} onChange={e => setKind(e.target.value)} style={{ width: "auto", minWidth: 140 }}>
          <option value="">Anything</option>
          {kinds.map(k => <option key={k} value={k}>{k}</option>)}
        </Select>
        <Select value={period} onChange={e => setPeriod(e.target.value)} style={{ width: "auto", minWidth: 140 }}>
          <option value="1">Today</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="">Everything</option>
        </Select>
      </FilterBar>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
            {logs.length === 0 ? "Nothing has been done yet" : "Nothing in that stretch"}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {logs.length === 0
              ? "Every change anybody makes turns up here by itself."
              : "Try another person, or widen the dates."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          {paged.map(l => {
            const a = readAction(l.action);
            const record = String(l.detail?.record ?? "");
            const rows = facts(l.detail);
            const isOpen = open.has(l.id);
            return (
              <div key={l.id} style={{
                border: "1px solid var(--line)", borderLeft: `3px solid ${a.tone}`,
                borderRadius: 12, background: "var(--paper)",
              }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(280px,2.2fr) minmax(150px,1fr) 130px 84px",
                  gap: 16, alignItems: "center", padding: "12px 16px",
                }}>
                  <div style={{ minWidth: 0 }}>
                    {/* The sentence, which is the whole point of this page. */}
                    <div style={{ fontSize: 15, lineHeight: 1.35 }}>
                      <strong>{l.actorName || "System"}</strong>{" "}
                      <span style={{ color: a.tone, fontWeight: 600 }}>{a.said}</span>{" "}
                      {a.subject || "something"}
                    </div>
                    {record && (
                      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {record}
                      </div>
                    )}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    {l.entityType && (
                      <span style={{
                        fontSize: 12.5, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
                        background: "var(--canvas)", border: "1px solid var(--line)",
                      }}>
                        {l.entityType.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "right" }}
                    title={exactly(l.createdAt)}>
                    {when(l.createdAt, now)}
                  </div>

                  {rows.length > 0 ? (
                    <Button variant="secondary" size="sm"
                      onClick={() => setOpen(o => {
                        const next = new Set(o);
                        if (next.has(l.id)) next.delete(l.id); else next.add(l.id);
                        return next;
                      })}>
                      {isOpen ? "Hide" : "What"}
                    </Button>
                  ) : <span />}
                </div>

                {isOpen && (
                  <div style={{
                    borderTop: "1px solid var(--line)", padding: "12px 16px",
                    display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12,
                  }}>
                    {rows.map(([k, v]) => (
                      <div key={k} style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{k}</div>
                        <div style={{ fontSize: 14, marginTop: 2, wordBreak: "break-word" }}>{v}</div>
                      </div>
                    ))}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>When exactly</div>
                      <div style={{ fontSize: 14, marginTop: 2 }}>{exactly(l.createdAt)}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Pagination page={shownPage} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
    </div>
  );
}

export default memo(AuditLogs);
