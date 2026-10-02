"use client";
import { useState } from "react";
import type {
  StockTransfer, WarehouseLocation, RawClothBatch, FinishedProduct,
} from "@/app/types";
import StockTransfers from "@/app/components/organisms/StockTransfers";
import RetailDispatches from "@/app/components/organisms/RetailDispatches";
import StockMovements from "@/app/components/organisms/StockMovements";

interface Props {
  transfers: StockTransfer[]
  warehouses: WarehouseLocation[]
  rawClothBatches: RawClothBatch[]
  finishedProducts: FinishedProduct[]
  // Shapes owned by the shop screen; this one only passes them through.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  channel?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stores: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dispatches: any[]
  unlinked: FinishedProduct[]
  canManage: boolean
  gql: (q: string, v?: Record<string, unknown>) => Promise<unknown>
  onRefresh: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>
}

/**
 * Stock going out, in one place.
 *
 * Two menus asked the same question — something is leaving this godown, where
 * is it going — and answered it on two screens. The destination is the choice,
 * not the screen: another godown of ours, or the shop. The third view is the
 * record of everything that has already gone, which is the question asked
 * afterwards.
 */
export default function MovingStock({
  transfers, warehouses, rawClothBatches, finishedProducts,
  channel, stores, dispatches, unlinked, canManage, gql, onRefresh, onMutate,
}: Props) {
  const [where, setWhere] = useState<"godown" | "shop" | "record">("godown");
  return (
    <div>
      <div style={{ padding: "18px 24px 0", display: "flex", gap: 8 }}>
        {([["godown", "Between our godowns"], ["shop", "To the shop"],
           ["record", "What moved"]] as const).map(([key, label]) => (
          <button type="button" key={key} onClick={() => setWhere(key)}
            style={{
              padding: "7px 16px", borderRadius: 20, cursor: "pointer", fontSize: 13.5, fontWeight: 600,
              border: `1px solid ${where === key ? "var(--primary)" : "var(--line)"}`,
              background: where === key ? "var(--primary)" : "var(--canvas)",
              color: where === key ? "#fff" : "var(--ink)",
            }}>
            {label}
          </button>
        ))}
      </div>
      {where === "godown" && (
        <StockTransfers
          transfers={transfers} warehouses={warehouses}
          rawClothBatches={rawClothBatches} finishedProducts={finishedProducts}
          gql={gql} onRefresh={onRefresh} />
      )}
      {where === "shop" && (
        <RetailDispatches
          channel={channel} stores={stores} dispatches={dispatches}
          products={finishedProducts} unlinked={unlinked} warehouses={warehouses}
          canManage={canManage} onRefresh={onRefresh} onMutate={onMutate} />
      )}
      {where === "record" && <StockMovements gql={gql} />}
    </div>
  );
}
