"use client";
import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import FileInput from "@/app/components/atoms/FileInput";
import Button from "@/app/components/atoms/Button";

interface Props {
  /** Comma-separated data URLs or stored paths, the shape the backend keeps. */
  value: string;
  onChange: (value: string) => void;
  max?: number;
  /** Longest edge after downscaling. Phone photos arrive far larger than a tag needs. */
  maxEdge?: number;
  disabled?: boolean;
}

/**
 * Pick one or more photos and hand them back as a comma-separated list.
 *
 * Photos are downscaled in the browser before they are ever sent. A phone on the
 * shop floor produces a 4 MB image, base64 inflates it by a third, and several
 * of those on one purchase order line makes a request nobody wants to wait for
 * over a warehouse wifi. The server's own 10 MB cap stays the backstop.
 */
export default function PhotoPicker({ value, onChange, max = 6, maxEdge = 1600, disabled }: Props) {
  const photos = value ? splitEntries(value) : [];
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function add(files: FileList) {
    const room = max - photos.length;
    if (room <= 0) return;
    setBusy(true);
    try {
      const added = await Promise.all(
        Array.from(files).slice(0, room).map(f => downscale(f, maxEdge)));
      onChange([...photos, ...added.filter(Boolean)].join(","));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(index: number) {
    onChange(photos.filter((_, i) => i !== index).join(","));
  }

  return (
    <div>
      {photos.length < max && (
        <FileInput
          ref={inputRef}
          accept="image/*"
          multiple
          disabled={disabled || busy}
          onChange={e => e.target.files && add(e.target.files)}
        />
      )}

      {busy && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Preparing photos…</div>}

      {photos.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {photos.map((src, i) => (
            <div key={i} style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`Photo ${i + 1}`}
                style={{
                  width: 88, height: 88, objectFit: "cover",
                  borderRadius: 8, border: "1px solid var(--line)", display: "block",
                }}
              />
              {!disabled && (
                <Button
                  variant="danger"
                  onClick={() => remove(i)}
                  aria-label={`Remove photo ${i + 1}`}
                  style={{
                    position: "absolute", top: 4, right: 4, borderRadius: "50%",
                    width: 20, height: 20, padding: 0, fontSize: 12, lineHeight: 1,
                    justifyContent: "center", minWidth: 0,
                  }}
                >
                  ×
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {photos.length === 0 && !busy && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
          <ImagePlus size={13} /> Up to {max} photos
        </div>
      )}
    </div>
  );
}

/**
 * Split the stored list. A data URL carries a comma of its own between header
 * and payload, so a header is always followed by exactly one payload chunk —
 * the same rule the backend splits on.
 */
function splitEntries(value: string): string[] {
  const out: string[] = [];
  const chunks = value.split(",");
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i].trim();
    if (!chunk) continue;
    if (chunk.startsWith("data:")) {
      out.push(`${chunk},${(chunks[++i] ?? "").trim()}`);
    } else {
      out.push(chunk);
    }
  }
  return out;
}

/** Read a file, shrink its longest edge to `maxEdge`, return a JPEG data URL. */
function downscale(file: File, maxEdge: number): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onerror = () => resolve("");
    reader.onload = () => {
      const source = reader.result as string;
      const img = new Image();
      // A file we cannot decode is passed through untouched; the server's
      // allowlist is the thing that decides whether it is acceptable.
      img.onerror = () => resolve(source);
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        if (scale >= 1) { resolve(source); return; }
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(source); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = source;
    };
    reader.readAsDataURL(file);
  });
}
