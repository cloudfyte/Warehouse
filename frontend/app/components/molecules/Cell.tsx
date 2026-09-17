"use client";
import type { ReactNode } from "react";

/**
 * One labelled fact in a list row.
 *
 * Rows used to run their facts together into a single muted line that
 * truncated while half the row sat empty. A fact gets a column and a label
 * saying what it is, at a size that reads across a desk.
 */
export default function Cell({ label, value, align = "left" }: {
  label: string
  value?: ReactNode
  align?: "left" | "right"
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div style={{ minWidth: 0, textAlign: align }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {empty ? "—" : value}
      </div>
    </div>
  );
}
