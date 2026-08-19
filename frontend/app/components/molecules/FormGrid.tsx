"use client";
import React from "react";

interface FormGridProps {
  cols?: 1 | 2 | 3;
  gap?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export default function FormGrid({ cols = 2, gap = 14, children, style }: FormGridProps) {
  const colTemplate = cols === 1 ? "1fr" : cols === 3 ? "1fr 1fr 1fr" : "1fr 1fr";
  return (
    <div style={{ display: "grid", gridTemplateColumns: colTemplate, gap, ...style }}>
      {children}
    </div>
  );
}
