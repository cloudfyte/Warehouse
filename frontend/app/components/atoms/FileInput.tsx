"use client";
import React from "react";

interface FileInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  accept?: string;
}

export default function FileInput({ style, ...props }: FileInputProps) {
  return (
    <input
      type="file"
      style={{ fontSize: 13, color: "var(--ink)", ...style }}
      {...props}
    />
  );
}
