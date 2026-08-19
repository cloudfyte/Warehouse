"use client";

export default function ErrorBanner({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 8,
      background: "#fff3f3", color: "#c62828",
      border: "1px solid #ffcdd2", fontSize: 13,
    }}>
      {msg}
    </div>
  );
}
