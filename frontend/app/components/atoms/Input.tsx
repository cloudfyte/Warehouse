"use client";
import React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export default function Input({ style, className, ...props }: InputProps) {
  return (
    <input
      className={["ui-field", className].filter(Boolean).join(" ")}
      style={{
        border: "1px solid var(--line)", background: "var(--canvas)",
        color: "var(--ink)", outline: "none",
        ...style,
      }}
      {...props}
    />
  );
}
