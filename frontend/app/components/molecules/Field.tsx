"use client";
import React from "react";

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  span?: number;
}

export default function Field({ label, required, hint, children, style, span }: FieldProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, ...(span ? { gridColumn: `span ${span}` } : {}), ...style }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>
        <span>{label}{required && <span style={{ color: "#e53935", marginLeft: 2 }}>*</span>}</span>
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: "var(--muted)" }}>{hint}</div>}
    </div>
  );
}
