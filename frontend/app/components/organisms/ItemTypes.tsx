"use client";
import React, { useState } from "react";
import { ItemType } from "@/app/types";

interface Props {
  itemTypes: ItemType[];
  isAdmin: boolean;
  isManager: boolean;
  gql: <T>(q: string, v?: Record<string, unknown>) => Promise<T>;
  onRefresh: () => void;
}

const GST_OPTIONS = [0, 5, 12, 18, 28];
const CATEGORY_OPTIONS = ["SHERWANI", "KURTA", "PANT", "COAT", "SHIRT", "BRIDAL", "CASUAL", "ACCESSORIES", "OTHER"];

const EMPTY_FORM = { name: "", category: "", clothLengthPerPiece: "0", hsnCode: "", gstRate: "0" };

export default function ItemTypes({ itemTypes, isAdmin, isManager, gql, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ItemType | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const canManage = isAdmin || isManager;

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
      setErr(e instanceof Error ? e.message : "Save failed.");
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
      alert(e instanceof Error ? e.message : "Failed.");
    }
  }

  const inp = "input w-full";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Item Types</h2>
        {canManage && (
          <button onClick={openCreate} className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: "var(--accent)" }}>
            + New Item Type
          </button>
        )}
      </div>

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
                <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--text-secondary)" }}>No item types yet</td></tr>
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
                        <button onClick={() => openEdit(it)}
                          className="text-xs px-2 py-1 rounded" style={{ background: "var(--surface-2)", color: "var(--accent)" }}>
                          Edit
                        </button>
                        <button onClick={() => toggleActive(it)}
                          className="text-xs px-2 py-1 rounded" style={{ color: "var(--text-secondary)", background: "var(--surface-2)" }}>
                          {it.active ? "Deactivate" : "Activate"}
                        </button>
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
              <button onClick={() => setShowForm(false)} className="text-2xl" style={{ color: "var(--text-secondary)" }}>×</button>
            </div>

            {err && <div className="p-3 rounded text-sm" style={{ background: "#fce4ec", color: "#c62828" }}>{err}</div>}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inp} placeholder="e.g. Sherwani" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inp}>
                  <option value="">Select category</option>
                  {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Cloth / Piece (m)</label>
                  <input type="number" value={form.clothLengthPerPiece} onChange={e => setForm(f => ({ ...f, clothLengthPerPiece: e.target.value }))}
                    className={inp} min="0" step="0.25" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>HSN Code</label>
                  <input value={form.hsnCode} onChange={e => setForm(f => ({ ...f, hsnCode: e.target.value }))}
                    className={inp} placeholder="e.g. 6211" maxLength={10} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>GST Rate %</label>
                <div className="flex gap-2 flex-wrap">
                  {GST_OPTIONS.map(r => (
                    <button key={r} onClick={() => setForm(f => ({ ...f, gstRate: String(r) }))}
                      className="px-3 py-1.5 rounded text-sm font-medium border transition-colors"
                      style={{
                        background: form.gstRate === String(r) ? "var(--accent)" : "transparent",
                        color: form.gstRate === String(r) ? "#fff" : "var(--text-secondary)",
                        borderColor: form.gstRate === String(r) ? "var(--accent)" : "var(--border)",
                      }}>
                      {r}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-1">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded text-sm" style={{ color: "var(--text-secondary)" }}>Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded text-sm font-medium text-white"
                style={{ background: "var(--accent)" }}>
                {saving ? "Saving…" : editing ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
