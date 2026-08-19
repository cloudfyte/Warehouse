"use client";

interface BadgeProps {
  label: string;
  color?: string;
  bg?: string;
  style?: React.CSSProperties;
}

export default function Badge({ label, color = "var(--primary)", bg, style }: BadgeProps) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px", borderRadius: 99,
      fontSize: 11, fontWeight: 700,
      color,
      background: bg ?? `${color}22`,
      ...style,
    }}>
      {label}
    </span>
  );
}
