"use client";
import React from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  color?: string;
  sub?: string;
  icon?: React.ReactNode;
  style?: React.CSSProperties;
}

export default function StatCard({ label, value, color, sub, icon, style }: StatCardProps) {
  return (
    <div style={{
      background: "var(--paper)", borderRadius: 12,
      border: "1px solid var(--line)", padding: "16px 20px",
      display: "flex", flexDirection: "column", gap: 4,
      ...style,
    }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, display: "flex", alignItems: "center", gap: 6 }}>
        {icon && <span style={{ opacity: 0.7 }}>{icon}</span>}
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? "var(--ink)", lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}
