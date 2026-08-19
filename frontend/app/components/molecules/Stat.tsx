"use client";

interface StatProps {
  label: string;
  value: string | number;
  color?: string;
  sub?: string;
  style?: React.CSSProperties;
}

export default function Stat({ label, value, color, sub, style }: StatProps) {
  return (
    <div style={style}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontWeight: 700, fontSize: 20, color: color ?? "var(--ink)", lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
