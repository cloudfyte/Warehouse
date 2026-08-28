"use client";
import { useState } from "react";
import { nameToColorHex } from "@/app/lib/colorUtils";
import { RawClothBatch } from "@/app/types";

interface Props {
  batches: RawClothBatch[];
}

export default function RawCloth({ batches }: Props) {
  const [search, setSearch] = useState("");
  const q = search.toLowerCase();
  const filtered = batches.filter(b =>
    !q ||
    b.batchNumber?.toLowerCase().includes(q) ||
    b.clothCategory?.name?.toLowerCase().includes(q) ||
    (b.clothColor as { name?: string })?.name?.toLowerCase().includes(q) ||
    (b as { warehouse?: { name?: string } }).warehouse?.name?.toLowerCase().includes(q)
  );

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: "0 0 16px" }}>
        Raw Cloth Batches{" "}
        <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 16 }}>({batches.length})</span>
      </h2>
      <input
        placeholder="Search batch, category, color or warehouse…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--ink)", fontSize: 14, width: "100%", boxSizing: "border-box", marginBottom: 16 }}
      />
      <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--border)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
              {["Batch #", "Category", "Color", "Total m", "Available m", "Cost/m", "Bin", "Warehouse", "Received"].map(h => (
                <th key={h} style={{ padding: "10px 14px", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((b: RawClothBatch) => {
              const bAny = b as any; // eslint-disable-line @typescript-eslint/no-explicit-any
              return (
                <tr key={b.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "11px 14px", fontWeight: 600 }}>{b.batchNumber}</td>
                  <td style={{ padding: "11px 14px" }}>{b.clothCategory?.name}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {b.clothColor && <span style={{ width: 12, height: 12, borderRadius: 3, background: nameToColorHex(b.clothColor.name, bAny.clothColor?.hexCode), display: "inline-block", flexShrink: 0 }} />}
                      {b.clothColor?.name}
                    </div>
                  </td>
                  <td style={{ padding: "11px 14px" }}>{bAny.totalMeters}m</td>
                  <td style={{ padding: "11px 14px", fontWeight: 700, color: bAny.availableMeters < 5 ? "#f44336" : "inherit" }}>{bAny.availableMeters}m</td>
                  <td style={{ padding: "11px 14px" }}>₹{bAny.costPerMeter}</td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: "var(--muted)" }}>{bAny.binLocation || "—"}</td>
                  <td style={{ padding: "11px 14px" }}>{bAny.warehouse?.name}</td>
                  <td style={{ padding: "11px 14px", fontSize: 12 }}>{bAny.receivedDate ? new Date(bAny.receivedDate).toLocaleDateString("en-IN") : "—"}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                  {batches.length === 0
                    ? "No raw cloth batches. Receive a Purchase Order or Purchase Bill to add cloth stock."
                    : "No batches match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
