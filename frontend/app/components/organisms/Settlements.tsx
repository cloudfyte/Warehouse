"use client";
import { useMemo, useState } from "react";
import { CalendarClock, Plus, Check, SkipForward, RefreshCw } from "lucide-react";
import type { WarehouseLocation } from "@/app/types";
import { formatMoney, formatDateShort } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Button from "@/app/components/atoms/Button";
import Badge from "@/app/components/atoms/Badge";
import Modal from "@/app/components/atoms/Modal";
import Field from "@/app/components/molecules/Field";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import PageHeader from "@/app/components/molecules/PageHeader";

export interface RecurringSettlement {
  id: string; name: string; kind: string; amount: number;
  dayOfMonth: number; active: boolean; notes?: string;
  warehouse: { id: string; name: string };
}

export interface Settlement {
  id: string; settlementNumber: string; name: string; kind: string;
  amount: number; period: string; dueDate: string; status: string;
  paidOn?: string | null; reference?: string; notes?: string;
  warehouse: { id: string; name: string };
}

interface Props {
  settlements: Settlement[];
  recurring: RecurringSettlement[];
  warehouses: WarehouseLocation[];
  canManage: boolean;
  onMutate: (q: string, v: Record<string, unknown>) => Promise<unknown>;
  onRefresh?: () => void;
}

const KINDS = [
  ["SALARY", "Salary"], ["RENT", "Rent"], ["UTILITIES", "Utilities"],
  ["MAINTENANCE", "Maintenance"], ["OTHER", "Other"],
] as const;

const STATUS_COLOR: Record<string, string> = {
  PENDING: "#f59e0b", PAID: "#059669", SKIPPED: "#6b7280",
};

const emptyTemplate = () => ({
  name: "", kind: "SALARY", amount: "", warehouseId: "", dayOfMonth: "1", notes: "",
});

/**
 * Salaries, rent and anything else that comes round every month.
 *
 * Entries are raised as pending on the 1st and become expenses only when
 * someone confirms the money moved — booking them on the 1st would show the
 * books lighter than the bank for the rest of the month.
 */
export default function Settlements({ settlements, recurring, warehouses, canManage, onMutate, onRefresh }: Props) {
  const [tab, setTab] = useState<"due" | "recurring">("due");
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [showTemplate, setShowTemplate] = useState(false);
  const [template, setTemplate] = useState(emptyTemplate());
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [payFor, setPayFor] = useState<Settlement | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", paidOn: "", paymentMethod: "CASH", reference: "" });

  const visible = useMemo(
    () => settlements.filter(s => !statusFilter || s.status === statusFilter),
    [settlements, statusFilter]);

  const pending = settlements.filter(s => s.status === "PENDING");
  const pendingTotal = pending.reduce((n, s) => n + (s.amount || 0), 0);

  async function run(label: string, q: string, v: Record<string, unknown>, id?: string) {
    setBusyId(id ?? label); setError("");
    try {
      await onMutate(q, v);
      onRefresh?.();
      showToast(label, "success");
      return true;
    } catch (e: unknown) {
      const msg = friendlyError(e);
      setError(msg); showToast(msg, "error");
      return false;
    } finally { setBusyId(null); }
  }

  function openPay(s: Settlement) {
    setPayForm({
      amount: String(s.amount ?? ""),
      paidOn: new Date().toISOString().slice(0, 10),
      paymentMethod: "CASH",
      reference: "",
    });
    setError("");
    setPayFor(s);
  }

  async function confirmPay() {
    if (!payFor) return;
    const ok = await run(
      `${payFor.name} marked paid and booked as an expense.`,
      `mutation P($id:ID!,$amount:Float,$paidOn:Date,$pm:String,$ref:String){`
      + `markSettlementPaid(id:$id,amount:$amount,paidOn:$paidOn,paymentMethod:$pm,reference:$ref)`
      + `{settlement{id status paidOn amount}}}`,
      {
        id: payFor.id,
        amount: payForm.amount === "" ? undefined : +payForm.amount,
        paidOn: payForm.paidOn || undefined,
        pm: payForm.paymentMethod,
        ref: payForm.reference || undefined,
      },
      payFor.id,
    );
    if (ok) setPayFor(null);
  }

  async function saveTemplate() {
    if (!template.name.trim()) { setError("Give it a name — who or what is paid."); return; }
    if (!template.warehouseId) { setError("Pick a warehouse."); return; }
    if (!(+template.amount > 0)) { setError("Enter an amount."); return; }

    setSavingTemplate(true);
    const ok = await run(
      "Recurring settlement saved.",
      `mutation C($name:String!,$kind:String!,$amount:Float!,$wh:ID!,$day:Int,$notes:String){`
      + `createRecurringSettlement(name:$name,kind:$kind,amount:$amount,warehouseId:$wh,dayOfMonth:$day,notes:$notes)`
      + `{recurringSettlement{id name}}}`,
      {
        name: template.name, kind: template.kind, amount: +template.amount,
        wh: template.warehouseId, day: parseInt(template.dayOfMonth, 10) || 1,
        notes: template.notes || undefined,
      },
    );
    setSavingTemplate(false);
    if (ok) { setShowTemplate(false); setTemplate(emptyTemplate()); }
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Settlements"
        sub={pending.length
          ? `${pending.length} pending · ${formatMoney(pendingTotal)} to confirm`
          : "Nothing pending"}
        actions={
          <>
            <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", marginRight: 4 }}>
              {([["due", "This Month"], ["recurring", "Recurring"]] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setTab(key)}
                  style={{
                    padding: "7px 14px", fontSize: 13, border: "none",
                    fontWeight: tab === key ? 700 : 500,
                    background: tab === key ? "var(--primary)" : "transparent",
                    color: tab === key ? "#fff" : "var(--muted)",
                  }}>
                  {label}
                </button>
              ))}
            </div>
            {canManage && tab === "due" && (
              <Button variant="secondary" disabled={busyId !== null}
                onClick={() => run("Settlements raised for this month.",
                  `mutation G{generateSettlements{settlements{id}}}`, {})}>
                <RefreshCw size={14} /> Raise This Month
              </Button>
            )}
            {canManage && tab === "recurring" && (
              <Button variant="primary" onClick={() => { setTemplate(emptyTemplate()); setError(""); setShowTemplate(true); }}>
                <Plus size={14} /> Add Recurring
              </Button>
            )}
          </>
        }
      />

      {error && <ErrorBanner msg={error} />}

      {tab === "due" ? (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {([["PENDING", "Pending"], ["PAID", "Paid"], ["SKIPPED", "Skipped"], ["", "All"]] as const).map(([v, label]) => (
              <button key={label} type="button" onClick={() => setStatusFilter(v)}
                style={{
                  padding: "5px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600,
                  border: "1px solid var(--line)", cursor: "pointer",
                  background: statusFilter === v ? "var(--primary)" : "var(--paper)",
                  color: statusFilter === v ? "#fff" : "var(--muted)",
                }}>
                {label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div style={{
              border: "1px dashed var(--line)", borderRadius: 12, padding: "40px 20px",
              textAlign: "center", color: "var(--muted)", fontSize: 13,
            }}>
              <CalendarClock size={22} style={{ opacity: 0.5 }} />
              <div style={{ marginTop: 8 }}>
                Nothing here. Add a recurring salary or rent, and it will be raised on the 1st.
              </div>
            </div>
          ) : (
            <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--line)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--canvas)", textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                    {["Settlement", "Kind", "Month", "Due", "Amount", "Status", ""].map(h => (
                      <th key={h} style={{ padding: "9px 14px", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map(s => (
                    <tr key={s.id} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>
                          {s.settlementNumber} · {s.warehouse.name}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--muted)" }}>
                        {KINDS.find(([k]) => k === s.kind)?.[1] ?? s.kind}
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        {new Date(s.period).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{formatDateShort(s.dueDate)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700 }}>{formatMoney(s.amount)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <Badge color={STATUS_COLOR[s.status] || "#888"} label={s.status} />
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        {canManage && s.status === "PENDING" && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <Button variant="primary" onClick={() => openPay(s)} disabled={busyId === s.id}
                              style={{ fontSize: 12, padding: "5px 10px" }}>
                              <Check size={13} /> Mark Paid
                            </Button>
                            <Button variant="secondary" disabled={busyId === s.id}
                              onClick={() => run(`${s.name} skipped for this month.`,
                                `mutation S($id:ID!){skipSettlement(id:$id){settlement{id status}}}`,
                                { id: s.id }, s.id)}
                              style={{ fontSize: 12, padding: "5px 10px" }}>
                              <SkipForward size={13} /> Skip
                            </Button>
                          </div>
                        )}
                        {s.status === "PAID" && s.paidOn && (
                          <span style={{ fontSize: 12, color: "var(--muted)" }}>
                            Paid {formatDateShort(s.paidOn)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--line)", overflowX: "auto" }}>
          {recurring.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              No recurring payments yet. Add a salary or a rent and it will be raised every month.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--canvas)", textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                  {["Name", "Kind", "Amount", "Due day", "Warehouse", "Active"].map(h => (
                    <th key={h} style={{ padding: "9px 14px", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recurring.map(r => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: "10px 14px", color: "var(--muted)" }}>
                      {KINDS.find(([k]) => k === r.kind)?.[1] ?? r.kind}
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 700 }}>{formatMoney(r.amount)}</td>
                    <td style={{ padding: "10px 14px" }}>{r.dayOfMonth}</td>
                    <td style={{ padding: "10px 14px", color: "var(--muted)" }}>{r.warehouse.name}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <Badge color={r.active ? "#059669" : "#6b7280"} label={r.active ? "Active" : "Paused"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Confirm a payment */}
      {payFor && (
        <Modal
          title="Mark Paid"
          subtitle={`${payFor.name} · ${payFor.settlementNumber}. This books an expense.`}
          width={440}
          zIndex={300}
          onClose={() => setPayFor(null)}
          onSubmit={confirmPay}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="primary" type="submit" disabled={busyId === payFor.id} style={{ flex: 1 }}>
                {busyId === payFor.id ? "Saving…" : "Confirm Payment"}
              </Button>
              <Button variant="secondary" onClick={() => setPayFor(null)}>Cancel</Button>
            </div>
          }
        >
          <Field label="Amount Paid" hint="Change it if the amount actually paid was different.">
            <Input type="number" min="0" step="0.01" value={payForm.amount}
              onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
          </Field>
          <Field label="Paid On">
            <Input type="date" value={payForm.paidOn}
              onChange={e => setPayForm(f => ({ ...f, paidOn: e.target.value }))} />
          </Field>
          <Field label="Method">
            <Select value={payForm.paymentMethod}
              onChange={e => setPayForm(f => ({ ...f, paymentMethod: e.target.value }))}>
              {["CASH", "UPI", "NEFT", "CHEQUE", "OTHER"].map(m => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Reference">
            <Input value={payForm.reference} placeholder="Voucher / UTR / cheque no"
              onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} />
          </Field>
          {error && <ErrorBanner msg={error} />}
        </Modal>
      )}

      {/* Add a recurring payment */}
      {showTemplate && (
        <Modal
          title="Add Recurring Settlement"
          subtitle="Raised as pending every month. Nothing is booked until you confirm it."
          width={480}
          zIndex={300}
          onClose={() => setShowTemplate(false)}
          onSubmit={saveTemplate}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="primary" type="submit" disabled={savingTemplate} style={{ flex: 1 }}>
                {savingTemplate ? "Saving…" : "Save"}
              </Button>
              <Button variant="secondary" onClick={() => setShowTemplate(false)}>Cancel</Button>
            </div>
          }
        >
          <Field label="Name *" hint="Who or what is paid.">
            <Input value={template.name} placeholder="e.g. Ravi (tailor) or Godown rent"
              onChange={e => setTemplate(t => ({ ...t, name: e.target.value }))} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Kind">
              <Select value={template.kind} onChange={e => setTemplate(t => ({ ...t, kind: e.target.value }))}>
                {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Amount *">
              <Input type="number" min="0" step="0.01" value={template.amount}
                onChange={e => setTemplate(t => ({ ...t, amount: e.target.value }))} />
            </Field>
            <Field label="Warehouse *">
              <Select value={template.warehouseId} onChange={e => setTemplate(t => ({ ...t, warehouseId: e.target.value }))}>
                <option value="">Select…</option>
                {warehouses.filter(w => w.active !== false).map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Due day" hint="1–28, so it exists in every month.">
              <Input type="number" min="1" max="28" value={template.dayOfMonth}
                onChange={e => setTemplate(t => ({ ...t, dayOfMonth: e.target.value }))} />
            </Field>
          </div>
          {error && <ErrorBanner msg={error} />}
        </Modal>
      )}
    </div>
  );
}
