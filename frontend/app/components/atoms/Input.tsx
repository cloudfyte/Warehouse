"use client";
import React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export default function Input({ style, ...props }: InputProps) {
  return (
    <input
      style={{
        width: "100%", padding: "9px 12px", borderRadius: 8,
        border: "1px solid var(--line)", background: "var(--canvas)",
        color: "var(--ink)", fontSize: 13, outline: "none", boxSizing: "border-box",
        ...style,
      }}
      {...props}
    />
  );
}
