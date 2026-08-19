"use client";
import React from "react";

interface PageHeaderProps {
  title: string;
  sub?: string | React.ReactNode;
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}

export default function PageHeader({ title, sub, actions, style }: PageHeaderProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10, ...style }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{title}</h2>
        {sub && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}
