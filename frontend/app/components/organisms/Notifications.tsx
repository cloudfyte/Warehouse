"use client";
import { useState } from "react";
import { X, ExternalLink } from "lucide-react";
import type { Notification } from "@/app/types";
import { formatDateShort } from "@/app/lib/formatters";
import { TAB_TITLES } from "@/app/lib/constants";

interface Props {
  notifications: Notification[]
  onMutate: (q: string, v: Record<string, unknown>) => Promise<void>
  onNavigate?: (tab: string) => void
}

const LEVEL_COLORS: Record<string, string> = {
  INFO: "#3b82f6",
  WARNING: "#f59e0b",
  CRITICAL: "#ef4444",
};
const LEVEL_BG: Record<string, string> = {
  INFO: "color-mix(in srgb, #3b82f6 12%, transparent)",
  WARNING: "color-mix(in srgb, #f59e0b 12%, transparent)",
  CRITICAL: "color-mix(in srgb, #ef4444 12%, transparent)",
};
const LEVEL_ICONS: Record<string, string> = {
  INFO: "ℹ",
  WARNING: "⚠",
  CRITICAL: "🚨",
};
const LEVEL_LABELS: Record<string, string> = {
  INFO: "Information",
  WARNING: "Warning",
  CRITICAL: "Critical",
};

type Filter = "all" | "unread" | "read";

export default function Notifications({ notifications, onMutate, onNavigate }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<Notification | null>(null);

  const unread = notifications.filter(n => !n.read);
  const read   = notifications.filter(n => n.read);
  const visible =
    filter === "unread" ? unread :
    filter === "read"   ? read   :
    notifications;

  async function markAll() {
    await onMutate(`mutation{markNotificationsRead(markAll:true){count}}`, {});
  }

  async function markOne(id: string) {
    await onMutate(`mutation M($ids:[ID]){markNotificationsRead(ids:$ids){count}}`, { ids: [id] });
  }

  async function handleClick(n: Notification) {
    if (!n.read) await markOne(n.id);
    if (n.link && onNavigate) {
      // navigate to the linked tab
      onNavigate(n.link);
    } else {
      // open detail panel
      setDetail(n);
    }
  }

  const tabBtn = (f: Filter, label: string, count: number) => {
    const active = filter === f;
    return (
      <button key={f} onClick={() => setFilter(f)} style={{
        padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer",
        fontWeight: active ? 700 : 500, fontSize: 13,
        background: active ? "var(--primary)" : "var(--canvas)",
        color: active ? "#fff" : "var(--muted)",
        display: "flex", alignItems: "center", gap: 6,
        transition: "background 0.15s, color 0.15s",
      }}>
        {label}
        {count > 0 && (
          <span style={{
            background: active ? "rgba(255,255,255,0.25)" : "var(--line)",
            color: active ? "#fff" : "var(--ink)",
            borderRadius: 99, fontSize: 11, fontWeight: 700,
            padding: "1px 7px",
          }}>{count}</span>
        )}
      </button>
    );
  };

  return (
    <div style={{ padding: 24 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Notifications</h2>
        {unread.length > 0 && (
          <button onClick={markAll} style={{
            padding: "7px 16px", borderRadius: 8, border: "1px solid var(--line)",
            background: "var(--paper)", cursor: "pointer", fontSize: 13, color: "var(--ink)",
          }}>
            Mark all read
          </button>
        )}
      </div>

      {/* ── Filter tabs ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, background: "var(--canvas)", padding: 4, borderRadius: 10, width: "fit-content" }}>
        {tabBtn("all",    "All",    notifications.length)}
        {tabBtn("unread", "Unread", unread.length)}
        {tabBtn("read",   "Read",   read.length)}
      </div>

      {/* ── List ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 720 }}>
        {visible.map(n => {
          const color = LEVEL_COLORS[n.level] || "#3b82f6";
          const hasLink = !!n.link;
          return (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              title={hasLink ? `Go to ${TAB_TITLES[n.link as keyof typeof TAB_TITLES] || n.link}` : "Click to view details"}
              style={{
                background: n.read ? "var(--paper)" : `${color}0a`,
                border: `1px solid ${n.read ? "var(--line)" : color + "33"}`,
                borderLeft: `4px solid ${n.read ? "var(--line)" : color}`,
                borderRadius: 10, padding: "14px 18px",
                cursor: "pointer",
                display: "flex", gap: 14, alignItems: "flex-start",
                transition: "box-shadow 0.15s",
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{LEVEL_ICONS[n.level] || "ℹ"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ fontWeight: n.read ? 500 : 700, fontSize: 14, color: "var(--ink)" }}>{n.title}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    {!n.read && (
                      <button
                        onClick={async e => { e.stopPropagation(); await markOne(n.id); }}
                        style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, border: "1px solid var(--line)", background: "transparent", cursor: "pointer", color: "var(--muted)" }}>
                        Mark read
                      </button>
                    )}
                    <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatDateShort(n.createdAt)}</span>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, lineHeight: 1.4, whiteSpace: "pre-line" }}>{n.message}</div>
                {hasLink ? (
                  <div style={{ fontSize: 11, color, marginTop: 6, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                    <ExternalLink size={11} />
                    Go to {TAB_TITLES[n.link as keyof typeof TAB_TITLES] || n.link}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                    Click to view full details
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {visible.length === 0 && (
          <div style={{ textAlign: "center", padding: 64, color: "var(--muted)", fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>
              {filter === "unread" ? "✅" : filter === "read" ? "📭" : "🔔"}
            </div>
            {filter === "unread" ? "No unread notifications" :
             filter === "read"   ? "No read notifications yet" :
             "All caught up — no notifications"}
          </div>
        )}
      </div>

      {/* ── Detail modal (for notifications without a link) ── */}
      {detail && (
        <div
          onClick={() => setDetail(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--paper)", borderRadius: 18, width: "100%", maxWidth: 480,
              boxShadow: "0 24px 64px rgba(0,0,0,0.2)", overflow: "hidden",
            }}
          >
            {/* coloured header band */}
            <div style={{
              background: LEVEL_BG[detail.level] || "#eff6ff",
              borderBottom: `1px solid ${LEVEL_COLORS[detail.level] || "#3b82f6"}22`,
              padding: "20px 24px",
              display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 28 }}>{LEVEL_ICONS[detail.level] || "ℹ"}</span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{detail.title}</div>
                  <span style={{
                    display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 700,
                    padding: "2px 8px", borderRadius: 99,
                    background: LEVEL_COLORS[detail.level] || "#3b82f6",
                    color: "#fff", letterSpacing: 0.6, textTransform: "uppercase",
                  }}>
                    {LEVEL_LABELS[detail.level] || detail.level}
                  </span>
                </div>
              </div>
              <button onClick={() => setDetail(null)} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--muted)", padding: 4, borderRadius: 6, flexShrink: 0,
              }}>
                <X size={18} />
              </button>
            </div>

            {/* body */}
            <div style={{ padding: "20px 24px" }}>
              <p style={{
                margin: 0, fontSize: 14, color: "var(--ink)", lineHeight: 1.7,
                whiteSpace: "pre-line",
              }}>
                {detail.message}
              </p>
              <div style={{ marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
                Received · {formatDateShort(detail.createdAt)}
              </div>
            </div>

            <div style={{ padding: "0 24px 20px", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setDetail(null)} style={{
                padding: "9px 24px", borderRadius: 9, border: "none",
                background: "var(--primary)", color: "#fff", fontWeight: 700,
                fontSize: 14, cursor: "pointer",
              }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
