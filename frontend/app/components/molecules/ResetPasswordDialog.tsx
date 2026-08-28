"use client";

import { useState } from "react";

export default function ResetPasswordDialog({
  name,
  onCancel,
  onSubmit,
}: {
  name: string;
  onCancel: () => void;
  onSubmit: (newPassword: string) => Promise<void>;
}) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handle = async () => {
    if (pw.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (pw !== pw2) { setErr("Passwords do not match."); return; }
    setBusy(true);
    try { await onSubmit(pw); } catch { setBusy(false); }
  };

  return (
    <div className="confirm-backdrop" onMouseDown={onCancel}>
      <div className="confirm-box" onMouseDown={e => e.stopPropagation()}>
        <h3>Reset password — {name}</h3>
        <p style={{ marginBottom: 12 }}>Set a new password for this account.</p>
        <label style={{ display: "block", marginBottom: 8 }}>
          New password
          <input
            type="password"
            value={pw}
            onChange={e => { setPw(e.target.value); setErr(""); }}
            placeholder="Min. 8 characters"
            style={{ width: "100%", marginTop: 4 }}
            autoFocus
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          Confirm password
          <input
            type="password"
            value={pw2}
            onChange={e => { setPw2(e.target.value); setErr(""); }}
            placeholder="Repeat password"
            style={{ width: "100%", marginTop: 4 }}
          />
        </label>
        {err && <p style={{ color: "#c0392b", fontSize: 12, marginBottom: 8 }}>{err}</p>}
        <div className="confirm-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="primary-button" onClick={handle} disabled={busy}>
            {busy ? "Saving…" : "Save password"}
          </button>
        </div>
      </div>
    </div>
  );
}
