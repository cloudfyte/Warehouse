"use client";

export interface Total {
  label: string
  value: string
  /** Only for a number that means act on me — money owed, stock running out. */
  color?: string
}

/**
 * The page's own question, answered for whatever is filtered.
 *
 * Not a KPI wall: three or four numbers the person came to the screen for.
 * `narrowed` says the totals describe the filter and not the whole godown,
 * which is the difference between a useful total and a misleading one.
 */
export default function TotalsBar({ totals, narrowed, note }: {
  totals: Total[]
  narrowed?: boolean
  note?: string
}) {
  return (
    <>
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(150px,1fr))`, gap: 1,
        background: "var(--line)", border: "1px solid var(--line)", borderRadius: 14,
        overflow: "hidden", marginBottom: 14,
      }}>
        {totals.map(t => (
          <div key={t.label} style={{ background: "var(--paper)", padding: "15px 18px" }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>
              {t.label}
            </div>
            <div style={{ fontSize: 25, fontWeight: 700, color: t.color, fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 }}>
              {t.value}
            </div>
          </div>
        ))}
      </div>
      {narrowed && (
        <div style={{ fontSize: 12, color: "var(--muted)", margin: "-6px 0 12px" }}>
          {note || "Totals are for what you have filtered, not everything."}
        </div>
      )}
    </>
  );
}
