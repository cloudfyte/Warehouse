"use client";
import React, { useMemo, useState } from "react";
import { Tag } from "lucide-react";
import { ItemType } from "@/app/types";
import { showToast } from "@/app/lib/toast";
import Button from "@/app/components/atoms/Button";
import Input from "@/app/components/atoms/Input";
import CreatableSelect from "@/app/components/atoms/CreatableSelect";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import PageHeader from "@/app/components/molecules/PageHeader";
import Field from "@/app/components/molecules/Field";
import FormGrid from "@/app/components/molecules/FormGrid";
import { friendlyError } from "@/app/lib/errors";

interface Props {
  itemTypes: ItemType[];
  isSuperAdmin?: boolean;
  isAdmin: boolean;
  isManager: boolean;
  gql: <T>(q: string, v?: Record<string, unknown>) => Promise<T>;
  onRefresh: () => void;
}

const GST_OPTIONS = [0, 5, 12, 18, 28];
// Starting points only. The list below also picks up whatever categories are
// already in use, and a new one can be typed straight into the field — the
// category is a plain label on the item type, not a record of its own, so
// there is nothing to create before it can be used.
const CATEGORY_SEEDS = ["SHERWANI", "KURTA", "PANT", "COAT", "SHIRT", "BRIDAL", "CASUAL", "ACCESSORIES", "OTHER"];

const EMPTY_FORM = { name: "", category: "", clothLengthPerPiece: "0", hsnCode: "", gstRate: "0" };

export default function ItemTypes({ itemTypes, isSuperAdmin, isAdmin, isManager, gql, onRefresh }: Props) {
  // Seeds plus every category already in use, so the list grows as the
  // catalogue does rather than staying frozen at whatever was hardcoded.
  const categoryOptions = useMemo(() => {
    const names = new Set(CATEGORY_SEEDS);
    itemTypes.forEach(it => { if (it.category) names.add(it.category.toUpperCase()); });
    return [...names].sort().map(name => ({ id: name, name }));
  }, [itemTypes]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ItemType | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const canManage = isSuperAdmin || isAdmin || isManager;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErr("");
    setShowForm(true);
  }

  function openEdit(it: ItemType) {
    setEditing(it);
    setForm({
      name: it.name,
      category: it.category,
      clothLengthPerPiece: String(it.clothLengthPerPiece),
      hsnCode: it.hsnCode ?? "",
      gstRate: String(it.gstRate ?? 0),
    });
    setErr("");
    setShowForm(true);
  }

  async function save() {
    setErr("");
    if (!form.name.trim()) { setErr("Name is required."); return; }
    setSaving(true);
    try {
      if (editing) {
        await gql(
          `mutation UIT($id:ID!,$name:String,$category:String,$clothLengthPerPiece:Float,$hsnCode:String,$gstRate:Float,$active:Boolean){
            updateItemType(id:$id,name:$name,category:$category,clothLengthPerPiece:$clothLengthPerPiece,hsnCode:$hsnCode,gstRate:$gstRate,active:$active){itemType{id}}
          }`,
          {
            id: editing.id,
            name: form.name.trim(),
            category: form.category || "OTHER",
            clothLengthPerPiece: parseFloat(form.clothLengthPerPiece) || 0,
            hsnCode: form.hsnCode.trim(),
            gstRate: parseFloat(form.gstRate) || 0,
          }
        );
      } else {
        await gql(
          `mutation CIT($name:String!,$category:String,$clothLengthPerPiece:Float,$hsnCode:String,$gstRate:Float){
            createItemType(name:$name,category:$category,clothLengthPerPiece:$clothLengthPerPiece,hsnCode:$hsnCode,gstRate:$gstRate){itemType{id}}
          }`,
          {
            name: form.name.trim(),
            category: form.category || "OTHER",
            clothLengthPerPiece: parseFloat(form.clothLengthPerPiece) || 0,
            hsnCode: form.hsnCode.trim(),
            gstRate: parseFloat(form.gstRate) || 0,
          }
        );
      }
      setShowForm(false);
      onRefresh();
    } catch (e: unknown) {
      setErr(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(it: ItemType) {
    try {
      await gql(`mutation T($id:ID!,$active:Boolean){updateItemType(id:$id,active:$active){itemType{id}}}`,
        { id: it.id, active: !it.active });
      onRefresh();
    } catch (e: unknown) {
      showToast(friendlyError(e), "error");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Item Types"
        actions={canManage && <Button variant="primary" onClick={openCreate}>+ New Item Type</Button>}
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                {["Name", "Category", "Cloth / Piece (m)", "HSN Code", "GST %", "Status", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itemTypes.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div style={{ textAlign: "center", padding: "60px 24px" }}>
                      <div style={{ marginBottom: 10, opacity: 0.3, display: "flex", justifyContent: "center" }}><Tag size={36} /></div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>No item types yet</div>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>Create item types to classify finished garment products</div>
                    </div>
                  </td>
                </tr>
              ) : itemTypes.map(it => (
                <tr key={it.id} style={{ borderBottom: "1px solid var(--border)" }}
                  className="hover:bg-[var(--surface-2)] transition-colors">
                  <td className="px-4 py-3 font-medium">{it.name}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>{it.category || "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{it.clothLengthPerPiece > 0 ? it.clothLengthPerPiece : "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{it.hsnCode || "—"}</td>
                  <td className="px-4 py-3">
                    {(it.gstRate ?? 0) > 0 ? (
                      <span className="px-2 py-0.5 rounded text-xs font-bold"
                        style={{ background: "#e3f2fd", color: "#1565c0" }}>{it.gstRate}%</span>
                    ) : <span style={{ color: "var(--text-secondary)" }}>0% (Exempt)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{ background: it.active ? "#e8f5e9" : "#fce4ec", color: it.active ? "#2e7d32" : "#c62828" }}>
                      {it.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {canManage && (
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEdit(it)}>Edit</Button>
                        <Button variant="secondary" size="sm" onClick={() => toggleActive(it)}>
                          {it.active ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-md rounded-xl p-6 space-y-4" style={{ background: "var(--surface)" }}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">{editing ? "Edit Item Type" : "New Item Type"}</h3>
              <button type="button" onClick={() => setShowForm(false)} className="text-2xl" style={{ color: "var(--text-secondary)" }}>×</button>
            </div>

            <ErrorBanner msg={err} />

            <div className="space-y-3">
              <Field label="Name" required>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sherwani" />
              </Field>
              <CreatableSelect
                label="Category"
                options={categoryOptions}
                value={form.category}
                onChange={v => setForm(f => ({ ...f, category: v }))}
                onCreate={async name => {
                  const created = name.trim().toUpperCase();
                  setForm(f => ({ ...f, category: created }));
                  return created;
                }}
                placeholder="Select or add a category…"
              />
              <FormGrid cols={2} gap={12}>
                <Field label="Cloth / Piece (m)">
                  <Input type="number" value={form.clothLengthPerPiece} onChange={e => setForm(f => ({ ...f, clothLengthPerPiece: e.target.value }))} min="0" step="0.25" />
                </Field>
                <Field label="HSN Code">
                  <Input value={form.hsnCode} onChange={e => setForm(f => ({ ...f, hsnCode: e.target.value }))} placeholder="e.g. 6211" maxLength={10} />
                </Field>
              </FormGrid>
              <Field label="GST Rate %">
                <div className="flex gap-2 flex-wrap" style={{ marginTop: 2 }}>
                  {GST_OPTIONS.map(r => (
                    <Button key={r} size="sm"
                      variant={form.gstRate === String(r) ? "primary" : "secondary"}
                      onClick={() => setForm(f => ({ ...f, gstRate: String(r) }))}>
                      {r}%
                    </Button>
                  ))}
                </div>
              </Field>
            </div>

            <div className="flex gap-3 justify-end pt-1">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : editing ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
