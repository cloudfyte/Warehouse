"use client";
import { useState } from "react";

const ALPHA_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Free Size"];
const NUMERIC_SIZES = ["28", "30", "32", "34", "36", "38", "40", "42", "44", "46", "48", "50"];

const ALL_STANDARD = [...ALPHA_SIZES, ...NUMERIC_SIZES];

const I: React.CSSProperties = {
  padding: "10px 13px", borderRadius: 9, border: "1px solid var(--line)",
  background: "var(--input-bg)", color: "var(--ink)", fontSize: 14, width: "100%", outline: "none",
};

interface Props {
  value: string;
  onChange: (v: string) => void;
  extraOptions?: string[];
  label?: string;
  required?: boolean;
}

export default function SizeSelect({ value, onChange, extraOptions = [], label = "Size", required }: Props) {
  const isCustom = value !== "" && !ALL_STANDARD.includes(value) && !extraOptions.includes(value);
  const [custom, setCustom] = useState(isCustom ? value : "");

  const extraFiltered = extraOptions.filter(e => !ALL_STANDARD.includes(e));

  function handleSelect(v: string) {
    if (v === "__custom__") {
      onChange(custom);
    } else {
      setCustom("");
      onChange(v);
    }
  }

  const selectValue = isCustom ? "__custom__" : value;

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, textTransform: "uppercase" }}>
      {label}{required && " *"}
      <select value={selectValue} onChange={e => handleSelect(e.target.value)} style={I}>
        <option value="">— Select size —</option>
        <optgroup label="Clothing sizes">
          {ALPHA_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </optgroup>
        <optgroup label="Numeric sizes (waist / trouser)">
          {NUMERIC_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </optgroup>
        {extraFiltered.length > 0 && (
          <optgroup label="Other">
            {extraFiltered.map(s => <option key={s} value={s}>{s}</option>)}
          </optgroup>
        )}
        <option value="__custom__">Custom…</option>
      </select>
      {(selectValue === "__custom__" || isCustom) && (
        <input
          value={custom}
          onChange={e => { setCustom(e.target.value); onChange(e.target.value); }}
          placeholder="Type custom size (e.g. 52, Petite, 4XL)"
          style={{ ...I, marginTop: 4 }}
        />
      )}
    </label>
  );
}
