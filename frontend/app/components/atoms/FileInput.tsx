"use client";
import React from "react";

// ComponentPropsWithRef rather than InputHTMLAttributes so callers can hold a
// ref and clear the input after a pick — React 19 passes ref as a plain prop.
type FileInputProps = React.ComponentPropsWithRef<"input">;

export default function FileInput({ style, ...props }: FileInputProps) {
  return (
    <input
      type="file"
      style={{ fontSize: 13, color: "var(--ink)", ...style }}
      {...props}
    />
  );
}
