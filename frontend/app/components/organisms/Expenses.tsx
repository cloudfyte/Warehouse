"use client";
import { useState } from "react";
import type { Expense, WarehouseLocation } from "@/app/types";
import { formatMoney } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Modal from "@/app/components/atoms/Modal";
import Badge from "@/app/components/atoms/Badge";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Textarea from "@/app/components/atoms/Textarea";
import Button from "@/app/components/atoms/Button";
import Field from "@/app/components/molecules/Field";
import FormGrid from "@/app/components/molecules/FormGrid";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import PageHeader from "@/app/components/molecules/PageHeader";
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
      showToast(isNew ? "Expense recorded." : "Expense updated.", "success");
    } catch (e: unknown) { setError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  async function deleteExpense(id: string) {
    setLoading(true);
    try {
      await onMutate(`mutation D($id:ID!){deleteExpense(id:$id){ok}}`, { id });
      setConfirmDelete(null);
      showToast("Expense deleted.", "success");
    } catch (e: unknown) { setError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Expenses"
        sub={`${expenses.length} records · Total: ${formatMoney(expenses.reduce((s, e) => s + e.amount, 0))}`}
        actions={<>
          <Button variant="secondary" size="sm" onClick={() => downloadCsv(`expenses-${new Date().toISOString().slice(0,10)}.csv`, expenses.map(e => ({ "Expense #": e.expenseNumber, Date: e.expenseDate, Category: CATEGORIES[e.category] || e.category, Description: e.description, Reference: e.reference, Amount: e.amount, Warehouse: e.warehouse?.name })))}>
            ↓ Export CSV
          </Button>
          {canEdit && <Button variant="primary" onClick={openNew}>+ Add Expense</Button>}
        </>}
      />

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
              <Button variant="primary" onClick={save} disabled={loading} style={{ flex: 1, padding: "11px 0" }}>
                {loading ? "Saving…" : "Save"}
              </Button>
              <Button variant="secondary" onClick={() => { setEditing(null); setError(""); }} style={{ flex: 1, padding: "11px 0" }}>
                Cancel
              </Button>
            </div>
          }
        >
          <ErrorBanner msg={error} />
          <FormGrid>
            <Field label="Category">
              <Select value={editing.category || "OTHER"} onChange={e => setEditing(p => ({ ...p, category: e.target.value }))}>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Amount (₹)" required>
              <Input type="number" min="0" step="0.01" value={editing.amount || ""} onChange={e => setEditing(p => ({ ...p, amount: +e.target.value }))} />
            </Field>
            <Field label="Date" required>
              <Input type="date" value={editing.expenseDate || today()} onChange={e => setEditing(p => ({ ...p, expenseDate: e.target.value }))} />
            </Field>
            <Field label="Reference / Bill No">
              <Input type="text" value={editing.reference || ""} onChange={e => setEditing(p => ({ ...p, reference: e.target.value }))} placeholder="Optional receipt / bill ref" />
            </Field>
          </FormGrid>
          {isNew && (
            <Field label="Warehouse" required style={{ marginTop: 14 }}>
              <Select value={editing.warehouseId || ""} onChange={e => setEditing(p => ({ ...p, warehouseId: e.target.value }))}>
                <option value="">Select warehouse</option>
                {warehouses.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Description" required style={{ marginTop: 14 }}>
            <Textarea value={editing.description || ""} onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
              style={{ minHeight: 72 }} placeholder="What was this expense for?" />
          </Field>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <Modal title="Delete Expense" subtitle="This cannot be undone." onClose={() => setConfirmDelete(null)} width={380}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="danger" onClick={() => deleteExpense(confirmDelete)} disabled={loading} style={{ flex: 1, padding: "11px 0" }}>
                {loading ? "Deleting…" : "Delete"}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "11px 0" }}>
                Cancel
              </Button>
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
                      <Button variant="secondary" size="sm" onClick={() => openEdit(e)}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => setConfirmDelete(e.id)}>Del</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div style={{ textAlign: "center", padding: "60px 24px" }}>
                    <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.3 }}>💸</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                      {filterCat === "ALL" ? "No expenses recorded yet" : `No ${CATEGORIES[filterCat]} expenses`}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>
                      {filterCat === "ALL" ? "Click + Add Expense to record your first operational expense" : "Try switching to a different category"}
                    </div>
                  </div>
                </td>
              </tr>
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
