"use client";
import { useState } from "react";
import { FileText } from "lucide-react";
import type { CustomerOrder } from "@/app/types";

interface Props {
  order?: CustomerOrder | null;
  /** Falls back to this when the bill has no record behind it yet. */
  billNumber?: string;
  compact?: boolean;
}

const photos = (csv?: string) => (csv || "").split(",").map(p => p.trim()).filter(Boolean);

/**
 * Who a made-to-measure garment is for.
 *
 * Shown at every step the work passes through, because the question on the
 * floor is never "which bill number is this" — it is "whose is this, and what
 * did they ask for". The paper bill answers the second one and is a tap away
 * rather than retyped into fields.
 */
export default function CustomerBill({ order, billNumber, compact = false }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const number = order?.billNumber || billNumber;
  if (!number) return null;

  const pics = photos(order?.billPhotos);

  return (
    <>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap",
        padding: compact ? "2px 8px" : "4px 10px", borderRadius: 99,
        background: "#ede9fe", color: "#6d28d9",
        fontSize: compact ? 10 : 12, fontWeight: 700,
      }}>
        {number}
        {order?.customerName && (
          <span style={{ fontWeight: 500 }}>· {order.customerName}</span>
        )}
        {order?.customerPhone && !compact && (
          <span style={{ fontWeight: 500 }}>· {order.customerPhone}</span>
        )}
        {pics.length > 0 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setOpen(pics[0]); }}
            title="See the written bill"
            style={{
              display: "inline-flex", alignItems: "center", gap: 3, background: "none",
              border: "none", color: "inherit", cursor: "pointer", padding: 0, font: "inherit",
            }}
          >
            <FileText size={compact ? 10 : 12} />
            {pics.length > 1 ? pics.length : ""}
          </button>
        )}
      </span>

      {open && (
        <div
          onClick={() => setOpen(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 400, background: "#000000cc",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: "92vw", maxHeight: "92vh", overflow: "auto" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              {pics.map(src => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="Written bill"
                  style={{ maxWidth: "88vw", maxHeight: "82vh", borderRadius: 8, background: "#fff" }} />
              ))}
            </div>
            <div style={{ textAlign: "center", color: "#fff", fontSize: 12, marginTop: 10 }}>
              {number}{order?.customerName ? ` · ${order.customerName}` : ""} — tap anywhere to close
            </div>
          </div>
        </div>
      )}
    </>
  );
}
