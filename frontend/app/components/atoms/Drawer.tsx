"use client";
import { useEffect, useRef } from "react";

interface DrawerProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Extra controls beside the close button — print, edit, status menus. */
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  zIndex?: number;
  /**
   * Makes the body a real <form>, so Enter in any field saves. Buttons default
   * to type="button" (see the Button atom), so a click never also submits.
   */
  onSubmit?: () => void;
}

/**
 * Right-hand side panel. Same contract as Modal — this is the variant used for
 * long forms and record detail, where a centred dialog would be taller than the
 * screen.
 *
 * The six hand-rolled copies this replaces each drew their own backdrop, and
 * none of them closed on Escape; most did not close on a backdrop click either,
 * so a drawer opened by mistake had to be dismissed with a small × in the
 * corner.
 */
export default function Drawer({
  title, subtitle, onClose, children, headerActions, footer,
  width = 480, zIndex = 200, onSubmit,
}: DrawerProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  useEffect(() => {
    const first = bodyRef.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])"
    );
    first?.focus();
  }, []);

  const body = (
    <>
      <div ref={bodyRef}>{children}</div>
      {footer && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
          {footer}
        </div>
      )}
    </>
  );

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex,
        background: "#0008",
        display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          background: "var(--paper)",
          width: `min(${width}px, 100vw)`,
          height: "100dvh",
          overflowY: "auto",
          padding: 28,
          borderLeft: "1px solid var(--line)",
        }}
      >
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", marginBottom: 24, gap: 12,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--ink)" }}>{title}</div>
            {subtitle && <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              style={{
                width: 40, height: 40, borderRadius: 8,
                border: "1px solid var(--line)",
                background: "transparent", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--muted)", fontSize: 18,
              }}
            >✕</button>
          </div>
        </div>

        {onSubmit
          ? <form onSubmit={e => { e.preventDefault(); onSubmit(); }}>{body}</form>
          : body}
      </div>
    </div>
  );
}
