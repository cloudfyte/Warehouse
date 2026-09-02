"use client";
import { useState } from "react";
import { Rows3 } from "lucide-react";

/**
 * Split one readymade purchase line into a size run.
 *
 * A supplier sells a style as a run — the same kurta in 38, 40, 42, 44 — and
 * every size is its own order line, its own stock row and its own barcode.
 * Typing that line four times is where the time goes and where the typos come
 * from, so the sizes are typed once here and the rest of the line is copied.
 *
 * The generated lines are ordinary lines: the count for size 44 can be raised
 * afterwards, or a size dropped, without any of this being involved.
 */
export default function SizeRunSplit({ onSplit }: {
  onSplit: (sizes: string[], qtyEach: number) => void;
}) {
  const [sizes, setSizes] = useState("");
  const [qtyEach, setQtyEach] = useState("1");

  const list = Array.from(new Set(
    sizes.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
  ));
  const qty = parseInt(qtyEach, 10) || 0;
  const ready = list.length > 1 && qty > 0;

  const box: React.CSSProperties = {
    padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line)",
    background: "var(--input-bg)", color: "var(--ink)", fontSize: 13, outline: "none",
  };

  return (
    <div style={{
      marginTop: 12, padding: "10px 12px", borderRadius: 9,
      border: "1px dashed var(--line)", background: "var(--canvas)",
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
          Buying a size run?
        </span>
        <input
          placeholder="38, 40, 42, 44, 46"
          value={sizes}
          onChange={e => setSizes(e.target.value)}
          style={{ ...box, flex: 1, minWidth: 160 }}
          aria-label="Sizes in this run"
        />
        <input
          type="number" min="1" value={qtyEach}
          onChange={e => setQtyEach(e.target.value)}
          style={{ ...box, width: 68 }}
          aria-label="Pieces per size"
        />
        <span style={{ fontSize: 12, color: "var(--muted)" }}>pcs each</span>
        <button
          type="button"
          disabled={!ready}
          onClick={() => { onSplit(list, qty); setSizes(""); }}
          style={{
            padding: "7px 12px", borderRadius: 8, border: "1px solid var(--primary)",
            background: ready ? "var(--primary)" : "transparent",
            color: ready ? "#fff" : "var(--muted)",
            fontSize: 12, fontWeight: 700, cursor: ready ? "pointer" : "not-allowed",
            display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
          }}
        >
          <Rows3 size={13} /> Split into {list.length || ""} line{list.length === 1 ? "" : "s"}
        </button>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
        Everything else on this line — item type, colour, price, photos — is copied to each size.
        {ready && <> That is <strong>{list.length * qty} pieces</strong> in total.</>}
      </div>
    </div>
  );
}
