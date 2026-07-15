"use client";
import { useState } from "react";
import type { Expense, WarehouseLocation } from "@/app/types";
import { formatMoney } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import Modal from "@/app/components/atoms/Modal";
import { downloadCsv } from "@/app/lib/csv";

interface Props {
  expenses: Expense[]
  warehouses: WarehouseLocation[]
  isAdmin: boolean; isSuperAdmin: boolean; isManager?: boolean
  onMutate: (q: string, v: Record<string, unknown>) => Promise<void>
}

const CATEGORIES: Record<string, string> = {
  UTILITIES:   "Utilities (Electricity / Water)",
  RENT:        "Rent",
  MAINTENANCE: "Machine / Equipment Maintenance",
  TRANSPORT:   "Transport / Delivery",
  PACKAGING:   "Packaging Material",
  LABOR:       "Contract Labour",
  OTHER:       "Other",
};

const CAT_COLORS: Record<string, string> = {
  UTILITIES: "#2563eb", RENT: "#7c3aed", MAINTENANCE: "#f59e0b",
  TRANSPORT: "#059669", PACKAGING: "#6366f1", LABOR: "#dc2626", OTHER: "#64748b",
};

const I: React.CSSProperties = {
  padding: "10px 13px", borderRadius: 9, border: "1px solid var(--line)",
  background: "var(--input-bg)", color: "var(--ink)", fontSize: 14, width: "100%", outline: "none",
};
const LBL: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 5,
  fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, textTransform: "uppercase",
};

function Badge({ label, color }: { label: string; color: string }) {
  return <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: color + "18", color, border: `1px solid ${color}33` }}>{label}</span>;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function Expenses({ expenses, warehouses, isAdmin, isSuperAdmin, isManager, onMutate }: Props) {
  const [editing, setEditing] = useState<Partial<Expense> & { warehouseId?: string } | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [filterCat, setFilterCat] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const canEdit = isSuperAdmin || isAdmin || isManager;

  function openNew() {
    setIsNew(true);
    setEditing({ category: "OTHER", amount: 0, expenseDate: today(), description: "", reference: "", warehouseId: warehouses[0]?.id || "" });
    setError("");
  }
  function openEdit(e: Expense) {
    setIsNew(false);
    setEditing({ ...e, warehouseId: e.warehouse?.id });
    setError("");
  }

  const filtered = filterCat === "ALL" ? expenses : expenses.filter(e => e.category === filterCat);

  const totalFiltered = filtered.reduce((s, e) => s + (e.amount || 0), 0);

  async function save() {
    if (!editing) return;
    if (!editing.description?.trim()) { setError("Description is required"); return; }
    if (!editing.amount || editing.amount <= 0) { setError("Amount must be greater than 0"); return; }
    if (!editing.warehouseId) { setError("Select a warehouse"); return; }
    setLoading(true); setError("");
    try {
      if (isNew) {
        await onMutate(
          `mutation C($cat:String!,$amt:Float!,$date:String!,$desc:String!,$wid:ID!,$ref:String){createExpense(category:$cat,amount:$amt,expenseDate:$date,description:$desc,warehouseId:$wid,reference:$ref){expense{id}}}`,
          { cat: editing.category, amt: editing.amount, date: editing.expenseDate, desc: editing.description, wid: editing.warehouseId, ref: editing.reference || "" }
        );
      } else {
        await onMutate(
          `mutation U($id:ID!,$cat:String,$amt:Float,$date:String,$desc:String,$ref:String){updateExpense(id:$id,category:$cat,amount:$amt,expenseDate:$date,description:$desc,reference:$ref){expense{id}}}`,
          { id: editing.id, cat: editing.category, amt: editing.amount, date: editing.expenseDate, desc: editing.description, ref: editing.reference || "" }
        );
      }
      setEditing(null);
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setLoading(false); }
  }

  async function deleteExpense(id: string) {
    setLoading(true);
    try {
      await onMutate(`mutation D($id:ID!){deleteExpense(id:$id){ok}}`, { id });
      setConfirmDelete(null);
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Expenses</h2>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>{expenses.length} records · Total: {formatMoney(expenses.reduce((s, e) => s + e.amount, 0))}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => downloadCsv(`expenses-${new Date().toISOString().slice(0,10)}.csv`, expenses.map(e => ({ "Expense #": e.expenseNumber, Date: e.expenseDate, Category: CATEGORIES[e.category] || e.category, Description: e.description, Reference: e.reference, Amount: e.amount, Warehouse: e.warehouse?.name })))}
            style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            ↓ Export CSV
          </button>
          {canEdit && <button onClick={openNew} className="primary-button">+ Add Expense</button>}
        </div>
      </div>

      {/* Category summary cards */}
      <div style={{ display: "flex", gap: 10, overflowX: "auto", marginBottom: 20, paddingBottom: 4 }}>
        {Object.entries(CATEGORIES).map(([cat, label]) => {
          const total = expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
          if (total === 0) return null;
          return (
            <button key={cat} onClick={() => setFilterCat(filterCat === cat ? "ALL" : cat)}
              style={{ flexShrink: 0, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${filterCat === cat ? CAT_COLORS[cat] : "var(--line)"}`, background: filterCat === cat ? CAT_COLORS[cat] + "12" : "var(--paper)", cursor: "pointer", textAlign: "left", minWidth: 130 }}>
              <div style={{ fontSize: 10, color: filterCat === cat ? CAT_COLORS[cat] : "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, color: filterCat === cat ? CAT_COLORS[cat] : "var(--ink)" }}>{formatMoney(total)}</div>
            </button>
          );
        })}
      </div>

      {filterCat !== "ALL" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Showing: <strong>{CATEGORIES[filterCat]}</strong> — {formatMoney(totalFiltered)}</span>
          <button onClick={() => setFilterCat("ALL")} style={{ fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Clear filter</button>
        </div>
      )}

      {/* Edit / Add Modal */}
      {editing && (
        <Modal
          title={isNew ? "Add Expense" : "Edit Expense"}
          subtitle={isNew ? "Record a business expense" : `Editing: ${editing.expenseNumber || ""}`}
          onClose={() => { setEditing(null); setError(""); }}
          width={500}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={save} disabled={loading}
                style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                {loading ? "Saving…" : "Save"}
              </button>
              <button onClick={() => { setEditing(null); setError(""); }}
                style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--ink)", cursor: "pointer", fontSize: 14 }}>
                Cancel
              </button>
            </div>
          }
        >
          {error && <div style={{ background: "#fff0ef", border: "1px solid #f1cbc8", color: "#8d3e39", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label style={LBL}>Category
              <select value={editing.category || "OTHER"} onChange={e => setEditing(p => ({ ...p, category: e.target.value }))} style={I}>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label style={LBL}>Amount (₹) *
              <input type="number" min="0" step="0.01" value={editing.amount || ""} onChange={e => setEditing(p => ({ ...p, amount: +e.target.value }))} style={I} />
            </label>
            <label style={LBL}>Date *
              <input type="date" value={editing.expenseDate || today()} onChange={e => setEditing(p => ({ ...p, expenseDate: e.target.value }))} style={I} />
            </label>
            <label style={LBL}>Reference / Bill No
              <input type="text" value={editing.reference || ""} onChange={e => setEditing(p => ({ ...p, reference: e.target.value }))} style={I} placeholder="Optional receipt / bill ref" />
            </label>
          </div>
          {isNew && (
            <label style={{ ...LBL, marginTop: 14 }}>Warehouse *
              <select value={editing.warehouseId || ""} onChange={e => setEditing(p => ({ ...p, warehouseId: e.target.value }))} style={I}>
                <option value="">Select warehouse</option>
                {warehouses.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
          )}
          <label style={{ ...LBL, marginTop: 14 }}>Description *
            <textarea value={editing.description || ""} onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
              style={{ ...I, resize: "vertical", minHeight: 72 }} placeholder="What was this expense for?" />
          </label>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <Modal title="Delete Expense" subtitle="This cannot be undone." onClose={() => setConfirmDelete(null)} width={380}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => deleteExpense(confirmDelete)} disabled={loading}
                style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                {loading ? "Deleting…" : "Delete"}
              </button>
              <button onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--ink)", cursor: "pointer", fontSize: 14 }}>
                Cancel
              </button>
            </div>
          }
        >
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Are you sure you want to delete this expense record?</p>
        </Modal>
      )}

      {/* Table */}
      <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--line)", overflowX: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--th-bg)", textAlign: "left" }}>
              {["Expense #", "Date", "Category", "Description", "Warehouse", "Amount", ""].map(h => (
                <th key={h} style={{ padding: "11px 16px", fontWeight: 700, fontSize: 10, color: "var(--muted)", letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "1px solid var(--line)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id} style={{ borderBottom: "1px solid var(--panel-border)" }}>
                <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 12, color: "var(--muted)" }}>{e.expenseNumber}</td>
                <td style={{ padding: "12px 16px", fontSize: 13 }}>{e.expenseDate?.slice(0, 10)}</td>
                <td style={{ padding: "12px 16px" }}><Badge label={CATEGORIES[e.category] || e.category} color={CAT_COLORS[e.category] || "#666"} /></td>
                <td style={{ padding: "12px 16px", fontSize: 13, maxWidth: 260 }}>
                  <div style={{ fontWeight: 500 }}>{e.description}</div>
                  {e.reference && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Ref: {e.reference}</div>}
                </td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)" }}>{e.warehouse?.name}</td>
                <td style={{ padding: "12px 16px", fontSize: 15, fontWeight: 700 }}>{formatMoney(e.amount)}</td>
                <td style={{ padding: "12px 16px" }}>
                  {canEdit && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => openEdit(e)}
                        style={{ padding: "4px 12px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Edit</button>
                      <button onClick={() => setConfirmDelete(e.id)}
                        style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid #fca5a5", background: "#fff5f5", color: "#dc2626", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Del</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: "56px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                {filterCat === "ALL" ? "No expenses recorded yet. Click \"+ Add Expense\" to add one." : `No ${CATEGORIES[filterCat]} expenses found.`}
              </td></tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr style={{ background: "var(--canvas)", borderTop: "2px solid var(--line)" }}>
                <td colSpan={5} style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, textAlign: "right" }}>Total</td>
                <td style={{ padding: "12px 16px", fontSize: 16, fontWeight: 700, color: "var(--primary)" }}>{formatMoney(totalFiltered)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
