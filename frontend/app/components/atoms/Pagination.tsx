"use client";

interface Props {
  page: number;
  total: number;
  perPage: number;
  onChange: (p: number) => void;
}

export default function Pagination({ page, total, perPage, onChange }: Props) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", fontSize: 13 }}>
      <span style={{ color: "var(--muted)" }}>
        {from}–{to} of {total}
      </span>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <button
          disabled={page <= 1}
          onClick={() => onChange(1)}
          style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", cursor: page <= 1 ? "default" : "pointer", opacity: page <= 1 ? 0.4 : 1, fontSize: 12 }}
        >
          «
        </button>
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", cursor: page <= 1 ? "default" : "pointer", opacity: page <= 1 ? 0.4 : 1, fontSize: 12 }}
        >
          ‹
        </button>
        <span style={{ padding: "4px 10px", borderRadius: 6, background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: 12 }}>
          {page} / {pages}
        </span>
        <button
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", cursor: page >= pages ? "default" : "pointer", opacity: page >= pages ? 0.4 : 1, fontSize: 12 }}
        >
          ›
        </button>
        <button
          disabled={page >= pages}
          onClick={() => onChange(pages)}
          style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", cursor: page >= pages ? "default" : "pointer", opacity: page >= pages ? 0.4 : 1, fontSize: 12 }}
        >
          »
        </button>
      </div>
    </div>
  );
}
