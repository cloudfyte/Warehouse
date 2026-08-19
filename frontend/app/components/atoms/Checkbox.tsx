"use client";
import React from "react";

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export default function Checkbox({ label, style, ...props }: CheckboxProps) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer", ...style }}>
      <input type="checkbox" {...props} />
      {label}
    </label>
  );
}
