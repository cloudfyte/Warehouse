"use client";
import { useState } from "react";
import { friendlyError } from "@/app/lib/errors";

interface Option { id: string; name: string }

interface Props {
  label: string
  options: Option[]
  value: string
  onChange: (id: string) => void
  /** Called when the user types a new name and submits — should create the item and return its ID */
  onCreate: (name: string) => Promise<string>
  placeholder?: string
  required?: boolean
  style?: React.CSSProperties
}

const selStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--bg)", color: "var(--fg)", fontSize: 14, width: "100%", boxSizing: "border-box",
};
const inpStyle: React.CSSProperties = { ...selStyle, marginTop: 6 };

export default function CreatableSelect({ label, options, value, onChange, onCreate, placeholder = "Select…", required, style }: Props) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selected = value === "__new__" || adding;

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setLoading(true); setError("");
    try {
      const id = await onCreate(name);
      onChange(id);
      setAdding(false);
      setNewName("");
    } catch (e: unknown) {
      setError(friendlyError(e));
    } finally { setLoading(false); }
  }

  function handleSelect(v: string) {
    if (v === "__new__") {
      setAdding(true);
      setNewName("");
      onChange("");
    } else {
      setAdding(false);
      onChange(v);
    }
  }

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, ...style }}>
      <span style={{ color: "var(--muted)", fontWeight: 500 }}>{label}{required && " *"}</span>
      <select value={selected ? "__new__" : value} onChange={e => handleSelect(e.target.value)} style={selStyle}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        <option value="__new__">— Add New…</option>
      </select>
      {selected && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleCreate(); } if (e.key === "Escape") { setAdding(false); onChange(""); } }}
            placeholder="Type name and press Enter…"
            style={inpStyle}
          />
          <button type="button" onClick={handleCreate} disabled={loading || !newName.trim()}
            style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
            {loading ? "…" : "+ Add"}
          </button>
          <button type="button" onClick={() => { setAdding(false); onChange(""); }}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer", color: "var(--muted)" }}>
            ✕
          </button>
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: "#f44336", marginTop: 2 }}>{error}</div>}
    </label>
  );
}
