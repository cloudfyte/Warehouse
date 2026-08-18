"use client";
import React, { useState, useMemo } from "react";
import { Buyer, Supplier, SalesOrder, CreditTransaction, PurchaseBill, LedgerEntry } from "@/app/types";

interface Props {
  buyers: Buyer[];
  suppliers: Supplier[];
  salesOrders: SalesOrder[];
  creditTransactions: CreditTransaction[];
  purchaseBills: PurchaseBill[];
}

type Mode = "buyer" | "supplier";

const fmt = (n: number) =>
  `₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

function buildBuyerLedger(buyerId: string, salesOrders: SalesOrder[], creditTransactions: CreditTransaction[]): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  for (const so of salesOrders.filter(o => o.buyer.id === buyerId)) {
    if (so.totalAmount > 0)
      entries.push({
        date: so.orderDate,
        type: "sale",
        reference: so.orderNumber,
        description: `Sales Order — ${so.items?.length ?? 0} item(s)`,
        debit: so.totalAmount,
        credit: 0,
        balance: 0,
      });
  }

  for (const ct of creditTransactions.filter(t => t.buyer.id === buyerId)) {
    for (const p of ct.payments ?? []) {
      entries.push({
        date: p.paymentDate,
        type: "payment",
        reference: ct.salesOrder?.orderNumber ?? "—",
        description: `Payment — ${p.paymentMethod}${p.reference ? ` (${p.reference})` : ""}`,
        debit: 0,
        credit: p.amount,
        balance: 0,
      });
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  for (const e of entries) {
    running += e.debit - e.credit;
    e.balance = running;
  }
  return entries;
}

function buildSupplierLedger(supplierId: string, purchaseBills: PurchaseBill[]): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  const bills = purchaseBills.filter(b => b.supplier.id === supplierId);

  for (const bill of bills) {
    entries.push({
      date: bill.billDate,
      type: "bill",
      reference: bill.billNumber,
      description: `Purchase Bill${bill.invoiceRef ? ` — ${bill.invoiceRef}` : ""}`,
      debit: bill.totalAmount,
      credit: 0,
      balance: 0,
    });
    for (const p of bill.supplierPayments ?? []) {
      entries.push({
        date: p.paymentDate,
        type: "supplier_payment",
        reference: p.paymentNumber,
        description: `Payment — ${p.paymentMode}${p.reference ? ` (${p.reference})` : ""}`,
        debit: 0,
        credit: p.amount,
        balance: 0,
      });
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  for (const e of entries) {
    running += e.debit - e.credit;
    e.balance = running;
  }
  return entries;
}

const TYPE_LABELS: Record<string, string> = {
  sale: "Sale",
  payment: "Receipt",
  bill: "Purchase",
  supplier_payment: "Payment",
};

const TYPE_COLORS: Record<string, string> = {
  sale: "#2196f3",
  payment: "#4caf50",
  bill: "#ff9800",
  supplier_payment: "#4caf50",
};

export default function Ledger({ buyers, suppliers, salesOrders, creditTransactions, purchaseBills }: Props) {
  const [mode, setMode] = useState<Mode>("buyer");
  const [partyId, setPartyId] = useState("");

  const ledger = useMemo<LedgerEntry[]>(() => {
    if (!partyId) return [];
    return mode === "buyer"
      ? buildBuyerLedger(partyId, salesOrders, creditTransactions)
      : buildSupplierLedger(partyId, purchaseBills);
  }, [mode, partyId, salesOrders, creditTransactions, purchaseBills]);

  const totalDebit = ledger.reduce((s, e) => s + e.debit, 0);
  const totalCredit = ledger.reduce((s, e) => s + e.credit, 0);
  const closing = totalDebit - totalCredit;

  const parties = mode === "buyer" ? buyers.filter(b => b.active) : suppliers.filter(s => s.active);
  const selectedParty = parties.find(p => p.id === partyId);

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">Party Ledger</h2>

      {/* Controls */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
          {(["buyer", "supplier"] as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setPartyId(""); }}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: mode === m ? "var(--primary)" : "var(--surface)",
                color: mode === m ? "#fff" : "var(--text-secondary)",
              }}>
              {m === "buyer" ? "Buyer" : "Supplier"}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            {mode === "buyer" ? "Select Buyer" : "Select Supplier"}
          </label>
          <select value={partyId} onChange={e => setPartyId(e.target.value)} className="input w-full">
            <option value="">— pick a {mode} —</option>
            {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {!partyId ? (
        <div className="card p-10 text-center" style={{ color: "var(--text-secondary)" }}>
          Select a {mode} to view their ledger statement.
        </div>
      ) : (
        <>
          {/* Party header + summary */}
          <div className="card p-5">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h3 className="font-bold text-lg">{selectedParty?.name}</h3>
                <div className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  {selectedParty?.city}{selectedParty?.state ? `, ${selectedParty.state}` : ""}
                  {selectedParty?.phone ? ` · ${selectedParty.phone}` : ""}
                </div>
              </div>
              <div className="flex gap-4 text-right">
                <div>
                  <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    {mode === "buyer" ? "Total Sales" : "Total Purchases"}
                  </div>
                  <div className="text-lg font-bold">{fmt(totalDebit)}</div>
                </div>
                <div>
                  <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Total Received</div>
                  <div className="text-lg font-bold" style={{ color: "#4caf50" }}>{fmt(totalCredit)}</div>
                </div>
                <div>
                  <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Balance Due</div>
                  <div className="text-xl font-bold" style={{ color: closing > 0 ? "#f44336" : "#4caf50" }}>
                    {closing > 0 ? `${fmt(closing)} Dr` : closing < 0 ? `${fmt(closing)} Cr` : "₹0 (Settled)"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Ledger table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                    {["Date", "Type", "Reference", "Description", "Debit (Dr)", "Credit (Cr)", "Balance"].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--text-secondary)" }}>
                        No transactions found for this {mode}.
                      </td>
                    </tr>
                  ) : ledger.map((e, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}
                      className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="px-4 py-3 tabular-nums text-xs whitespace-nowrap">
                        {new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium text-white"
                          style={{ background: TYPE_COLORS[e.type] ?? "#555" }}>
                          {TYPE_LABELS[e.type] ?? e.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{e.reference}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)", maxWidth: 220 }}>{e.description}</td>
                      <td className="px-4 py-3 tabular-nums text-right">
                        {e.debit > 0 ? <span style={{ color: "#f44336" }}>{fmt(e.debit)}</span> : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-right">
                        {e.credit > 0 ? <span style={{ color: "#4caf50" }}>{fmt(e.credit)}</span> : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-right font-semibold" style={{ color: e.balance > 0 ? "#f44336" : "#4caf50" }}>
                        {e.balance > 0 ? `${fmt(e.balance)} Dr` : e.balance < 0 ? `${fmt(Math.abs(e.balance))} Cr` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {ledger.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface-2)" }}>
                      <td colSpan={4} className="px-4 py-3 font-bold text-sm">Closing Balance</td>
                      <td className="px-4 py-3 tabular-nums text-right font-bold" style={{ color: "#f44336" }}>{fmt(totalDebit)}</td>
                      <td className="px-4 py-3 tabular-nums text-right font-bold" style={{ color: "#4caf50" }}>{fmt(totalCredit)}</td>
                      <td className="px-4 py-3 tabular-nums text-right font-bold"
                        style={{ color: closing > 0 ? "#f44336" : "#4caf50" }}>
                        {closing > 0 ? `${fmt(closing)} Dr` : closing < 0 ? `${fmt(Math.abs(closing))} Cr` : "Nil"}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
