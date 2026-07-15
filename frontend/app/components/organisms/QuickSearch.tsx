"use client";
import { useEffect, useRef, useState } from "react";
import type { FinishedProduct, Supplier, Buyer, RawClothBatch, Tab } from "@/app/types";
import { formatMoney } from "@/app/lib/formatters";

interface Props {
  finishedProducts: FinishedProduct[]
  suppliers: Supplier[]
  buyers: Buyer[]
  rawBatches: RawClothBatch[]
  onNavigate: (tab: Tab) => void
  onClose: () => void
}

interface Result {
  id: string; kind: "product" | "supplier" | "buyer" | "cloth"; tab: Tab
  title: string; sub: string; badge?: string; badgeColor?: string
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return <>{text.slice(0, idx)}<mark style={{ background: "#fef08a", borderRadius: 2, padding: "0 1px" }}>{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}</>;
}

export default function QuickSearch({ finishedProducts, suppliers, buyers, rawBatches, onNavigate, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();

  const results: Result[] = q.length < 1 ? [] : [
    ...finishedProducts
      .filter(p => p.barcode?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.itemType?.name?.toLowerCase().includes(q))
      .slice(0, 5)
      .map(p => ({
        id: p.id, kind: "product" as const, tab: "finished_products" as Tab,
        title: `${p.sku} — ${p.itemType?.name}`,
        sub: `Size: ${p.size || "—"} · ${formatMoney(p.salePrice)} · ${p.quantity} pcs · ${p.warehouse?.name}`,
        badge: p.barcode, badgeColor: "#2563eb",
      })),
    ...suppliers
      .filter(s => s.name.toLowerCase().includes(q) || s.phone?.includes(q) || s.gstin?.toLowerCase().includes(q))
      .slice(0, 3)
      .map(s => ({
        id: s.id, kind: "supplier" as const, tab: "suppliers" as Tab,
        title: s.name,
        sub: `${s.contactPerson || ""} · ${s.phone || ""} · ${s.city || ""}`,
        badge: "Supplier", badgeColor: "#059669",
      })),
    ...buyers
      .filter(b => b.name.toLowerCase().includes(q) || b.phone?.includes(q) || b.gstin?.toLowerCase().includes(q))
      .slice(0, 3)
      .map(b => ({
        id: b.id, kind: "buyer" as const, tab: "buyers" as Tab,
        title: b.name,
        sub: `${b.contactPerson || ""} · ${b.phone || ""} · ${b.city || ""}`,
        badge: "Buyer", badgeColor: "#7c3aed",
      })),
    ...rawBatches
      .filter(b => b.batchNumber?.toLowerCase().includes(q) || b.clothCategory?.name?.toLowerCase().includes(q))
      .slice(0, 3)
      .map(b => ({
        id: b.id, kind: "cloth" as const, tab: "raw_cloth" as Tab,
        title: `${b.batchNumber} — ${b.clothCategory?.name}`,
        sub: `${b.clothColor?.name} · ${b.availableMeters?.toFixed(1)}m available · ${b.warehouse?.name}`,
        badge: "Raw Cloth", badgeColor: "#2563eb",
      })),
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.45)", display: "flex",
        alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--paper)", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          width: "min(600px, 94vw)", overflow: "hidden",
        }}
      >
        {/* Search input */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by barcode, SKU, name, supplier, buyer…"
            style={{
              flex: 1, border: "none", outline: "none", fontSize: 16,
              background: "transparent", color: "var(--ink)",
            }}
          />
          <kbd style={{ fontSize: 10, background: "var(--canvas)", border: "1px solid var(--line)", borderRadius: 4, padding: "2px 6px", color: "var(--muted)", flexShrink: 0 }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          {q.length > 0 && results.length === 0 && (
            <div style={{ padding: "36px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              No results for &quot;{query}&quot;
            </div>
          )}
          {results.map(r => (
            <button
              key={r.id + r.kind}
              onClick={() => { onNavigate(r.tab); onClose(); }}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                padding: "12px 18px", background: "none", border: "none",
                borderBottom: "1px solid var(--line)", cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--canvas)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <span style={{ fontSize: 20, flexShrink: 0 }}>
                {r.kind === "product" ? "👕" : r.kind === "supplier" ? "🏭" : r.kind === "buyer" ? "🧑‍💼" : "🧵"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {highlight(r.title, query)}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.sub}
                </div>
              </div>
              {r.badge && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: (r.badgeColor || "#666") + "18", color: r.badgeColor || "#666", border: `1px solid ${r.badgeColor || "#666"}33`, flexShrink: 0 }}>
                  {r.badge}
                </span>
              )}
            </button>
          ))}
          {q.length === 0 && (
            <div style={{ padding: "24px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Quick Jump</div>
              {(["finished_products", "suppliers", "buyers", "raw_cloth", "purchase_bills", "sales_orders"] as Tab[]).map(tab => (
                <button key={tab} onClick={() => { onNavigate(tab); onClose(); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 0", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--ink)", borderBottom: "1px solid var(--line)" }}>
                  {tab.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: "8px 18px", fontSize: 11, color: "var(--muted)", borderTop: "1px solid var(--line)", display: "flex", gap: 16 }}>
          <span>↵ Open tab</span>
          <span>ESC Close</span>
          <span>Tip: Scan barcode directly here</span>
        </div>
      </div>
    </div>
  );
}
