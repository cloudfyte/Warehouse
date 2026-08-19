"use client";
import React from "react";

export default function FilterBar({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center", ...style }}>
      {children}
    </div>
  );
}
