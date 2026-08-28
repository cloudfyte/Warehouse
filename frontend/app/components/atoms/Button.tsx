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

// Defaults to type="button". An untyped button inside a <form> is a submit
// button, so without this every dialog button would fire its own onClick and
// the form's onSubmit — saving twice on a single click.
export default function Button({ variant = "primary", size = "md", type = "button", style, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={["ui-btn", size === "sm" && "ui-btn--sm", className].filter(Boolean).join(" ")}
      style={{
        borderRadius: 8,
        fontWeight: 700,
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
