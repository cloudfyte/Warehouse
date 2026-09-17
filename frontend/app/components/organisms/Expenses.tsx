"use client";
import { useState, useEffect, useRef } from "react";
import { Camera } from "lucide-react";
import type { Expense, WarehouseLocation } from "@/app/types";
import { formatMoney } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Modal from "@/app/components/atoms/Modal";
import Badge from "@/app/components/atoms/Badge";
import Pagination from "@/app/components/atoms/Pagination";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Textarea from "@/app/components/atoms/Textarea";
import Button from "@/app/components/atoms/Button";
import Field from "@/app/components/molecules/Field";
import FormGrid from "@/app/components/molecules/FormGrid";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import PageHeader from "@/app/components/molecules/PageHeader";
import Cell from "@/app/components/molecules/Cell";
import { downloadCsv } from "@/app/lib/csv";

interface Props {
  expenses: Expense[]
  warehouses: WarehouseLocation[]
  isAdmin: boolean; isSuperAdmin: boolean; isManager?: boolean
  onMutate: (q: string, v: Record<string, unknown>) => Promise<void>
}

const PER_PAGE = 20;

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
  const proofRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<Partial<Expense> & { warehouseId?: string } | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [filterCat, setFilterCat] = useState("ALL");
  const [quickDate, setQuickDate] = useState<"ALL" | "TODAY" | "WEEK" | "MONTH" | "CUSTOM">("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filterCat, quickDate, fromDate, toDate]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const canEdit = isSuperAdmin || isAdmin || isManager;

  function openNew() {
    setIsNew(true);
    setEditing({ category: "OTHER", amount: 0, expenseDate: today(), description: "", reference: "", paymentMethod: "CASH", proofImage: "", warehouseId: warehouses[0]?.id || "" });
    setError("");
  }
  function openEdit(e: Expense) {
    setIsNew(false);
    setEditing({ ...e, warehouseId: e.warehouse?.id });
    setError("");
  }

  function handleProofPick(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setEditing(p => p ? { ...p, proofImage: reader.result as string } : p);
    reader.readAsDataURL(file);
  }

  const todayStr = today();
  function dateInRange(dateStr: string) {
    if (quickDate === "ALL") return true;
    if (quickDate === "TODAY") return dateStr === todayStr;
    if (quickDate === "WEEK") {
      const d = new Date(todayStr); d.setDate(d.getDate() - 6);
      return dateStr >= d.toISOString().slice(0, 10) && dateStr <= todayStr;
    }
    if (quickDate === "MONTH") return dateStr.slice(0, 7) === todayStr.slice(0, 7);
    if (quickDate === "CUSTOM") {
      if (fromDate && dateStr < fromDate) return false;
      if (toDate && dateStr > toDate) return false;
      return true;
    }
    return true;
  }
  const filtered = expenses.filter(e => (filterCat === "ALL" || e.category === filterCat) && dateInRange(e.expenseDate));
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

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
          `mutation C($cat:String!,$amt:Float!,$date:String!,$desc:String!,$wid:ID!,$ref:String,$pm:String,$proof:String){createExpense(category:$cat,amount:$amt,expenseDate:$date,description:$desc,warehouseId:$wid,reference:$ref,paymentMethod:$pm,proofImage:$proof){expense{id}}}`,
          { cat: editing.category, amt: editing.amount, date: editing.expenseDate, desc: editing.description, wid: editing.warehouseId, ref: editing.reference || "", pm: editing.paymentMethod || "CASH", proof: editing.proofImage || "" }
        );
      } else {
        await onMutate(
          `mutation U($id:ID!,$cat:String,$amt:Float,$date:String,$desc:String,$ref:String,$pm:String,$proof:String){updateExpense(id:$id,category:$cat,amount:$amt,expenseDate:$date,description:$desc,reference:$ref,paymentMethod:$pm,proofImage:$proof){expense{id}}}`,
          { id: editing.id, cat: editing.category, amt: editing.amount, date: editing.expenseDate, desc: editing.description, ref: editing.reference || "", pm: editing.paymentMethod || "CASH", proof: editing.proofImage || undefined }
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
            <button type="button" key={cat} onClick={() => setFilterCat(filterCat === cat ? "ALL" : cat)}
              style={{ flexShrink: 0, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${filterCat === cat ? CAT_COLORS[cat] : "var(--line)"}`, background: filterCat === cat ? CAT_COLORS[cat] + "12" : "var(--paper)", cursor: "pointer", textAlign: "left", minWidth: 130 }}>
              <div style={{ fontSize: 10, color: filterCat === cat ? CAT_COLORS[cat] : "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, color: filterCat === cat ? CAT_COLORS[cat] : "var(--ink)" }}>{formatMoney(total)}</div>
            </button>
          );
        })}
      </div>

      {/* Date filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {(["ALL", "TODAY", "WEEK", "MONTH", "CUSTOM"] as const).map(q => {
          const labels = { ALL: "All time", TODAY: "Today", WEEK: "This week", MONTH: "This month", CUSTOM: "Custom" };
          return (
            <button type="button" key={q} onClick={() => setQuickDate(q)}
              style={{ padding: "5px 13px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: `1.5px solid ${quickDate === q ? "var(--primary)" : "var(--line)"}`,
                background: quickDate === q ? "var(--primary)" : "var(--paper)",
                color: quickDate === q ? "#fff" : "var(--ink)" }}>
              {labels[q]}
            </button>
          );
        })}
        {quickDate === "CUSTOM" && (
          <>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "4px 8px", fontSize: 12, background: "var(--paper)", color: "var(--ink)" }} />
            <span style={{ fontSize: 12, color: "var(--muted)" }}>to</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "4px 8px", fontSize: 12, background: "var(--paper)", color: "var(--ink)" }} />
          </>
        )}
        {(quickDate !== "ALL" || filterCat !== "ALL") && (
          <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 4 }}>
            {filtered.length} record{filtered.length !== 1 ? "s" : ""} · {formatMoney(totalFiltered)}
          </span>
        )}
      </div>

      {filterCat !== "ALL" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Category: <strong>{CATEGORIES[filterCat]}</strong></span>
          <button type="button" onClick={() => setFilterCat("ALL")} style={{ fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Clear</button>
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
            <Field label="Payment Method">
              <Select value={editing.paymentMethod || "CASH"} onChange={e => setEditing(p => ({ ...p, paymentMethod: e.target.value }))}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="NEFT">NEFT / IMPS</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTHER">Other</option>
              </Select>
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
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--muted)" }}>PROOF / RECEIPT (optional)</div>
            <Button variant="secondary" size="sm" onClick={() => proofRef.current?.click()}>
              <Camera size={14} /> {editing.proofImage ? "Change Photo" : "Upload Receipt Photo"}
            </Button>
            <input ref={proofRef} type="file" accept="image/*" onChange={handleProofPick} style={{ display: "none" }} />
            {editing.proofImage && (
              <div style={{ marginTop: 10, position: "relative", display: "inline-block" }}>
                <img src={editing.proofImage} alt="proof" style={{ maxWidth: 200, maxHeight: 150, borderRadius: 8, border: "1px solid var(--line)", objectFit: "contain" }} />
                <button type="button" onClick={() => setEditing(p => p ? { ...p, proofImage: "" } : p)}
                  style={{ position: "absolute", top: -6, right: -6, background: "#ef4444", color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </div>
            )}
          </div>
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
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
            {filterCat === "ALL" ? "Nothing spent in this period" : `No ${CATEGORIES[filterCat]} expenses`}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Rent, wages, freight and the rest go here.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {paged.map(e => {
            const tone = CAT_COLORS[e.category] || "#666";
            return (
              <div key={e.id} style={{
                display: "grid",
                // ~800px of minimums — fits a 1280 laptop with the sidebar open.
                gridTemplateColumns: "minmax(190px,1.7fr) minmax(110px,0.9fr) minmax(110px,0.9fr) 160px 120px",
                gap: 16, alignItems: "center",
                border: "1px solid var(--line)", borderLeft: `3px solid ${tone}`,
                borderRadius: 12, padding: "14px 16px", background: "var(--paper)",
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>{e.description}</div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
                    {e.expenseNumber}{e.reference ? ` · ref ${e.reference}` : ""}
                  </div>
                  {e.proofImage && (
                    <button type="button" onClick={() => window.open(e.proofImage, "_blank")}
                      style={{ fontSize: 12.5, color: "var(--primary)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}>
                      See the receipt
                    </button>
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    What for
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Badge label={CATEGORIES[e.category] || e.category} color={tone} />
                  </div>
                </div>

                <Cell label="Spent on" value={e.expenseDate?.slice(0, 10)} />
                <Cell label="Paid by / where"
                  value={[e.paymentMethod, e.warehouse?.name].filter(Boolean).join(" · ")} />

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: -0.5, lineHeight: 1.1 }}>
                    {formatMoney(e.amount)}
                  </div>
                  {canEdit && (
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 7 }}>
                      <Button variant="secondary" size="sm" onClick={() => openEdit(e)}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => setConfirmDelete(e.id)}>Delete</Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
    </div>
  );
}
