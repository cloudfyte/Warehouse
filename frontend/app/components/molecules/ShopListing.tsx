"use client";
import { useState } from "react";

import CreatableSelect from "@/app/components/atoms/CreatableSelect";
import Input from "@/app/components/atoms/Input";
import Field from "@/app/components/molecules/Field";
import type { FinishedProduct, ShopCategory } from "@/app/types";

/**
 * What the shop's product page needs about one garment, filled in here.
 *
 * The shop's own form only insists on a name and a price, but a garment filed
 * under nothing cannot be browsed to — it exists on the site and no customer
 * can reach it. So the category is required at this end, and the rest is
 * offered because somebody would otherwise type it again at the shop.
 */
export interface ShopListingDraft {
  categoryId: string
  categoryName: string
  description: string
  hsnCode: string
  gstPercentage: string
  channel: "BOTH" | "ONLINE" | "WALKIN"
}

export function draftFrom(product: FinishedProduct): ShopListingDraft {
  return {
    categoryId: product.shopCategoryId ? String(product.shopCategoryId) : "",
    categoryName: product.shopCategoryName ?? "",
    description: product.shopDescription ?? "",
    hsnCode: product.hsnCode ?? "",
    gstPercentage: product.gstPercentage != null ? String(product.gstPercentage) : "",
    channel: product.shopChannel ?? "BOTH",
  };
}

const WHERE_IT_SELLS: { value: ShopListingDraft["channel"]; label: string; hint: string }[] = [
  { value: "BOTH", label: "Both", hint: "On the website and at the counter" },
  { value: "ONLINE", label: "Online only", hint: "Website only, not billed at the counter" },
  { value: "WALKIN", label: "Walk-in only", hint: "Counter billing only, hidden online" },
];

interface Props {
  categories: ShopCategory[]
  draft: ShopListingDraft
  onChange: (draft: ShopListingDraft) => void
  /** Creates the category on the shop's site and returns its id. */
  onCreateCategory: (name: string) => Promise<string>
}

export default function ShopListing({ categories, draft, onChange, onCreateCategory }: Props) {
  const [showMore, setShowMore] = useState(
    Boolean(draft.description || draft.hsnCode || draft.gstPercentage));
  const set = (patch: Partial<ShopListingDraft>) => onChange({ ...draft, ...patch });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <CreatableSelect
        label="Category on the shop's site"
        required
        options={categories.map(c => ({ id: String(c.id), name: c.name }))}
        value={draft.categoryId}
        placeholder="Pick a category…"
        onChange={id => set({
          categoryId: id,
          categoryName: categories.find(c => String(c.id) === id)?.name ?? "",
        })}
        onCreate={async name => {
          const id = await onCreateCategory(name);
          set({ categoryId: id, categoryName: name });
          return id;
        }}
      />

      <Field label="Where it sells" required>
        <div style={{ display: "grid", gap: 6 }}>
          {WHERE_IT_SELLS.map(opt => (
            <label key={opt.value}
              style={{
                display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer",
                padding: "7px 10px", borderRadius: 8, fontSize: 13,
                border: `1px solid ${draft.channel === opt.value ? "var(--accent)" : "var(--border)"}`,
                background: draft.channel === opt.value ? "var(--accent-soft, transparent)" : "transparent",
              }}>
              <input type="radio" name="shop-channel" value={opt.value}
                checked={draft.channel === opt.value}
                onChange={() => set({ channel: opt.value })}
                style={{ marginTop: 2 }} />
              <span>
                <strong style={{ display: "block" }}>{opt.label}</strong>
                <span style={{ color: "var(--muted)", fontSize: 12 }}>{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </Field>

      {showMore ? (
        <>
          <Field label="Description" hint="Shown on the shop's product page">
            <Input value={draft.description}
              onChange={e => set({ description: e.target.value })} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="HSN code" hint="For the shop's GST invoices">
              <Input value={draft.hsnCode} onChange={e => set({ hsnCode: e.target.value })} />
            </Field>
            <Field label="GST %">
              <Input type="number" min="0" step="0.01" value={draft.gstPercentage}
                onChange={e => set({ gstPercentage: e.target.value })} />
            </Field>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setShowMore(true)}
          style={{
            background: "none", border: "none", padding: 0, textAlign: "left",
            color: "var(--accent)", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
          + Description, HSN and GST (optional)
        </button>
      )}
    </div>
  );
}
