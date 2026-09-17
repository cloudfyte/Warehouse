"use client";
import { useState } from "react";
import type { Karigar, KarigarWorkload } from "@/app/types";
import KarigarWork from "@/app/components/organisms/KarigarWork";
import Karigars from "@/app/components/organisms/Karigars";

interface Props {
  workload: KarigarWorkload[];
  karigars: Karigar[];
  canManage: boolean;
  onRefresh?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>;
}

/**
 * Karigars, in one place instead of two tabs.
 *
 * What is out with them is the daily question and opens first; the list of who
 * they are and what they charge is the same subject, so it is a switch here
 * rather than another line in the sidebar.
 */
export default function KarigarsTab({ workload, karigars, canManage, onRefresh, onMutate }: Props) {
  const [view, setView] = useState<"work" | "list">("work");
  return (
    <div>
      <div style={{ padding: "18px 24px 0", display: "flex", gap: 8 }}>
        {([["work", "Work out"], ["list", "Who they are"]] as const).map(([key, label]) => (
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
      {view === "work"
        ? <KarigarWork workload={workload} canManage={canManage} onRefresh={onRefresh} onMutate={onMutate} />
        : <Karigars karigars={karigars} canManage={canManage} onRefresh={onRefresh} onMutate={onMutate} />}
    </div>
  );
}
