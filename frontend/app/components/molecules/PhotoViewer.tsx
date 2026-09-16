"use client";
import { useCallback, useEffect, useState } from "react";
import { ImageIcon, ChevronLeft, ChevronRight, X } from "lucide-react";

interface Props {
  /** Comma-separated URLs, as every photo field in this app stores them. */
  value?: string;
  /** Square edge of the thumbnail. */
  size?: number;
  /** Shown behind the placeholder when there is no photo — usually the colour. */
  tint?: string | null;
  alt?: string;
}

const split = (csv?: string) => (csv || "").split(",").map(s => s.trim()).filter(Boolean);

/**
 * A thumbnail you can actually open.
 *
 * Photographs exist here to be looked at — a shade against a roll, the
 * measurements on a written bill — and a thumbnail is far too small to answer
 * either question. Clicking one opens it at full size, and arrow keys walk a
 * lot that was photographed more than once.
 */
export default function PhotoViewer({ value, size = 56, tint, alt = "" }: Props) {
  const photos = split(value);
  const [at, setAt] = useState<number | null>(null);

  const close = useCallback(() => setAt(null), []);
  const step = useCallback((by: number) => {
    setAt(i => (i === null ? i : (i + by + photos.length) % photos.length));
  }, [photos.length]);

  useEffect(() => {
    if (at === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, close, step]);

  if (!photos.length) {
    return (
      <span style={{
        width: size, height: size, borderRadius: 10, flexShrink: 0,
        border: "1px dashed var(--line)", display: "inline-flex",
        alignItems: "center", justifyContent: "center",
        background: tint ? `${tint}22` : "var(--canvas)",
      }}>
        <ImageIcon size={Math.round(size * 0.32)} style={{ color: "var(--muted)" }} />
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setAt(0); }}
        title={photos.length > 1 ? `${photos.length} photos` : "Open photo"}
        style={{
          position: "relative", width: size, height: size, padding: 0, flexShrink: 0,
          border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden",
          background: "var(--canvas)", cursor: "zoom-in", display: "block",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photos[0]} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        {photos.length > 1 && (
          <span style={{
            position: "absolute", right: 3, bottom: 3, padding: "1px 6px", borderRadius: 99,
            background: "#000000b0", color: "#fff", fontSize: 10, fontWeight: 700,
          }}>
            {photos.length}
          </span>
        )}
      </button>

      {at !== null && (
        <div
          onClick={close}
          style={{
            position: "fixed", inset: 0, zIndex: 500, background: "#000000d8",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}
        >
          <button type="button" onClick={close} aria-label="Close"
            style={{
              position: "absolute", top: 16, right: 18, background: "none", border: "none",
              color: "#fff", cursor: "pointer", padding: 6,
            }}>
            <X size={26} />
          </button>

          {photos.length > 1 && (
            <>
              <button type="button" aria-label="Previous"
                onClick={e => { e.stopPropagation(); step(-1); }}
                style={{ position: "absolute", left: 14, background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 10 }}>
                <ChevronLeft size={34} />
              </button>
              <button type="button" aria-label="Next"
                onClick={e => { e.stopPropagation(); step(1); }}
                style={{ position: "absolute", right: 14, background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 10 }}>
                <ChevronRight size={34} />
              </button>
            </>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[at]}
            alt={alt}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: "90vw", maxHeight: "86vh", borderRadius: 10, background: "#fff", cursor: "default" }}
          />

          <div style={{ position: "absolute", bottom: 18, color: "#fff", fontSize: 13, opacity: 0.85 }}>
            {alt ? `${alt} — ` : ""}
            {photos.length > 1 ? `${at + 1} of ${photos.length} · ` : ""}
            click outside to close
          </div>
        </div>
      )}
    </>
  );
}
