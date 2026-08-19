"use client";
import React from "react";
import Select from "./Select";

export const AGE_GROUPS = [
  { value: "MEN",    label: "Men" },
  { value: "WOMEN",  label: "Women" },
  { value: "BOYS",   label: "Boys" },
  { value: "GIRLS",  label: "Girls" },
  { value: "INFANT", label: "Infant / Baby" },
  { value: "UNISEX", label: "Unisex" },
];

export const AGE_GROUP_SIZES: Record<string, string[]> = {
  MEN:    ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "28", "30", "32", "34", "36", "38", "40", "42", "44", "46", "48", "50"],
  WOMEN:  ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "28", "30", "32", "34", "36", "38", "40"],
  BOYS:   ["1Y", "2Y", "3Y", "4Y", "5Y", "6Y", "7Y", "8Y", "9Y", "10Y", "11Y", "12Y", "13Y", "14Y"],
  GIRLS:  ["1Y", "2Y", "3Y", "4Y", "5Y", "6Y", "7Y", "8Y", "9Y", "10Y", "11Y", "12Y", "13Y", "14Y"],
  INFANT: ["0-3M", "3-6M", "6-9M", "9-12M", "12-18M", "18-24M"],
  UNISEX: ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Free Size"],
};

interface Props {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}

export default function AgeGroupSelect({ value, onChange, required }: Props) {
  return (
    <Select value={value} onChange={e => onChange(e.target.value)} required={required}>
      <option value="">— Select age group —</option>
      {AGE_GROUPS.map(g => (
        <option key={g.value} value={g.value}>{g.label}</option>
      ))}
    </Select>
  );
}
