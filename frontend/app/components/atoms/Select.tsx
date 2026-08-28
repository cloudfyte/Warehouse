"use client";
import React from "react";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export default function Select({ style, className, children, ...props }: SelectProps) {
  return (
    <select
      className={["ui-field", className].filter(Boolean).join(" ")}
      style={{
        border: "1px solid var(--line)", background: "var(--canvas)",
        color: "var(--ink)", outline: "none",
        ...style,
      }}
      {...props}
    >
      {children}
    </select>
  );
}
