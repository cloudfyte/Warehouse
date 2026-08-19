"use client";
import React from "react";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export default function Textarea({ style, ...props }: TextareaProps) {
  return (
    <textarea
      style={{
        width: "100%", padding: "9px 12px", borderRadius: 8,
        border: "1px solid var(--line)", background: "var(--canvas)",
        color: "var(--ink)", fontSize: 13, outline: "none", boxSizing: "border-box",
        resize: "vertical", minHeight: 80,
        ...style,
      }}
      {...props}
    />
  );
}
