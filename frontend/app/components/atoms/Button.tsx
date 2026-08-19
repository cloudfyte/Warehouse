"use client";
import React from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, React.CSSProperties> = {
  primary:   { background: "var(--primary)",   color: "#fff",           border: "none" },
  secondary: { background: "transparent",       color: "var(--ink)",     border: "1px solid var(--line)" },
  danger:    { background: "#e53935",           color: "#fff",           border: "none" },
  ghost:     { background: "transparent",       color: "var(--primary)", border: "1px solid var(--primary)" },
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export default function Button({ variant = "primary", size = "md", style, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled}
      style={{
        padding: size === "sm" ? "6px 14px" : "9px 18px",
        borderRadius: 8,
        fontWeight: 700,
        fontSize: size === "sm" ? 12 : 13,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
        transition: "opacity 0.15s",
        ...VARIANTS[variant],
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
