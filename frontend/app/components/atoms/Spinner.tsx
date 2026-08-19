"use client";

export default function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span style={{
      display: "inline-block",
      width: size, height: size,
      border: `2px solid var(--line)`,
      borderTopColor: "var(--primary)",
      borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
    }} />
  );
}
