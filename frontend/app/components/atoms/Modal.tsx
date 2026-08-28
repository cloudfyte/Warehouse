"use client";
import { useEffect, useRef } from "react";

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  zIndex?: number;
  /**
   * Makes the body a real <form>, so Enter in any field saves the dialog
   * instead of doing nothing. Most of this app is data entry — without it
   * every row costs a reach for the mouse.
   *
   * Buttons default to type="button" (see the Button atom), so a click still
   * runs only its own onClick and never also submits.
   */
  onSubmit?: () => void;
}

export default function Modal({
  title, subtitle, onClose, children, footer,
  width = 520, zIndex = 100, onSubmit,
}: ModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  // Put the caret in the first field so the dialog can be filled without
  // reaching for the mouse first.
  useEffect(() => {
    const first = bodyRef.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])"
    );
    first?.focus();
  }, []);

  const body = (
    <>
      <div ref={bodyRef} style={{ padding: "20px 24px" }}>
        {children}
      </div>
      {footer && (
        <div style={{ padding: "14px 24px 20px", borderTop: "1px solid var(--line)" }}>
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
        background: "rgba(10,20,15,0.55)",
        backdropFilter: "blur(6px)",
        overflowY: "auto",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px 60px",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: "100%",
          maxWidth: width,
          background: "var(--paper)",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)",
          border: "1px solid var(--line)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "18px 24px",
          borderBottom: "1px solid var(--line)",
          borderRadius: "16px 16px 0 0",
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)", letterSpacing: -0.2 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              width: 40, height: 40, borderRadius: 8,
              border: "1px solid var(--line)",
              background: "transparent", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--muted)", fontSize: 18, flexShrink: 0,
              transition: "background 0.15s",
            }}
          >✕</button>
        </div>

        {onSubmit
          ? <form onSubmit={e => { e.preventDefault(); onSubmit(); }}>{body}</form>
          : body}
      </div>
    </div>
  );
}
