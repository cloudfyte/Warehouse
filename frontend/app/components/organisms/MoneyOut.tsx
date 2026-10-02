"use client";
import { useState } from "react";
import type { Expense, WarehouseLocation } from "@/app/types";
import Expenses from "@/app/components/organisms/Expenses";
import Settlements, { type Settlement, type RecurringSettlement } from "@/app/components/organisms/Settlements";

interface Props {
  expenses: Expense[]
  settlements: Settlement[]
  recurring: RecurringSettlement[]
  warehouses: WarehouseLocation[]
  isAdmin: boolean; isSuperAdmin: boolean; isManager?: boolean
  canManage: boolean
  onMutate: (q: string, v: Record<string, unknown>) => Promise<void>
  onRefresh: () => void
}

/**
 * Money going out, in one place.
 *
 * A settlement is a bill that comes back every month and an expense is one that
 * does not; both end up in the same figure. Two menus for that made somebody
 * check two screens to answer "what did we spend".
 */
export default function MoneyOut({
  expenses, settlements, recurring, warehouses,
  isAdmin, isSuperAdmin, isManager, canManage, onMutate, onRefresh,
}: Props) {
  const [view, setView] = useState<"paid" | "repeating">("paid");
  return (
    <div>
      <div style={{ padding: "18px 24px 0", display: "flex", gap: 8 }}>
        {([["paid", "What we spent"], ["repeating", "Every month"]] as const).map(([key, label]) => (
          <button type="button" key={key} onClick={() => setView(key)}
            style={{
              padding: "7px 16px", borderRadius: 20, cursor: "pointer", fontSize: 13.5, fontWeight: 600,
              border: `1px solid ${view === key ? "var(--primary)" : "var(--line)"}`,
              background: view === key ? "var(--primary)" : "var(--canvas)",
              color: view === key ? "#fff" : "var(--ink)",
            }}>
            {label}
          </button>
        ))}
      </div>
      {view === "paid" ? (
        <Expenses expenses={expenses} warehouses={warehouses}
          isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager}
          onMutate={onMutate} />
      ) : (
        <Settlements settlements={settlements} recurring={recurring} warehouses={warehouses}
          canManage={canManage} onMutate={onMutate} onRefresh={onRefresh} />
      )}
    </div>
  );
}
