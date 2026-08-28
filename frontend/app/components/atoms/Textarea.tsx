"use client";
import React from "react";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export default function Textarea({ style, className, ...props }: TextareaProps) {
  return (
    <textarea
      className={["ui-field", className].filter(Boolean).join(" ")}
      style={{
        border: "1px solid var(--line)", background: "var(--canvas)",
        color: "var(--ink)", outline: "none",
        resize: "vertical", minHeight: 80,
        ...style,
      }}
      {...props}
    />
  );
}
