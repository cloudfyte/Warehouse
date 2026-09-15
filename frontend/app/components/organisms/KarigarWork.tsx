"use client";
import { useState } from "react";
import { ChevronRight, Users } from "lucide-react";
import type { KarigarWorkload } from "@/app/types";
import { formatDateShort, formatMoney } from "@/app/lib/formatters";
import Input from "@/app/components/atoms/Input";
import Button from "@/app/components/atoms/Button";
import Modal from "@/app/components/atoms/Modal";
import Field from "@/app/components/molecules/Field";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import PageHeader from "@/app/components/molecules/PageHeader";

interface Props {
  workload: KarigarWorkload[];
  canManage?: boolean;
  onRefresh?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate?: (q: string, v: Record<string, unknown>) => Promise<any>;
}

/**
 * What each karigar is holding.
 *
 * The stitching screen is organised by job, which answers "where is this
 * docket". Standing at the counter with a karigar in front of you, the
 * question is the other way round: what of theirs is out, since when, against
 * which design, and how many of each size.
 */
export default function KarigarWork({ workload, canManage = false, onRefresh, onMutate }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  // "What do I owe on this docket" is the job screen's question. Standing in
  // front of a unit, the question is "what do I owe you".
  const [settling, setSettling] = useState<KarigarWorkload | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function settle() {
    if (!settling || !onMutate) return;
    setBusy(true);
    try {
      const res = await onMutate(
        `mutation S($k:ID!,$amt:Float!){settleKarigar(karigarId:$k,amount:$amt){unallocated jobs{id}}}`,
        { k: settling.karigar.id, amt: +amount },
      );
      const cleared = res?.settleKarigar?.jobs?.length ?? 0;
      showToast(`Paid across ${cleared} job${cleared === 1 ? "" : "s"}.`, "success");
      setSettling(null); setAmount("");
      onRefresh?.();
    } catch (e: unknown) { showToast(friendlyError(e), "error"); }
    finally { setBusy(false); }
  }

  const q = search.trim().toLowerCase();
  const shown = workload.filter(w =>
    !q || w.karigar.name.toLowerCase().includes(q) || (w.karigar.city || "").toLowerCase().includes(q));

  const totals = shown.reduce(
    (a, w) => ({ open: a.open + w.openPieces, due: a.due + w.amountDue }),
    { open: 0, due: 0 });

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Karigar Work" sub="What each one is holding, and what is owed on it" />

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 1,
        background: "var(--line)", border: "1px solid var(--line)", borderRadius: 12,
        overflow: "hidden", marginBottom: 14,
      }}>
        {([
          ["Karigars with work", String(shown.filter(w => w.openPieces > 0).length), undefined],
          ["Pieces out", String(totals.open), undefined],
          ["Owed", formatMoney(totals.due), totals.due > 0 ? "#e65100" : undefined],
        ] as const).map(([label, value, color]) => (
          <div key={label} style={{ background: "var(--paper)", padding: "12px 16px" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
          </div>
        ))}
      </div>

      <Input placeholder="Search karigar or city…" value={search}
        onChange={e => setSearch(e.target.value)} style={{ marginBottom: 14 }} />

      <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
        {shown.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            {workload.length === 0 ? "No karigars yet." : "None match that search."}
          </div>
        ) : shown.map(w => {
          const isOpen = open.has(w.karigar.id);
          return (
            <div key={w.karigar.id} style={{ borderTop: "1px solid var(--line)" }}>
              <button
                type="button"
                onClick={() => setOpen(o => {
                  const next = new Set(o);
                  if (next.has(w.karigar.id)) next.delete(w.karigar.id); else next.add(w.karigar.id);
                  return next;
                })}
                style={{
                  display: "grid", width: "100%",
                  gridTemplateColumns: "minmax(150px,1.6fr) 110px 110px 120px 22px",
                  gap: 12, alignItems: "center", padding: "12px 16px",
                  background: isOpen ? "var(--canvas)" : "transparent",
                  border: "none", textAlign: "left", color: "var(--ink)", cursor: "pointer",
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{w.karigar.name}</span>
                  {w.karigar.city && <span style={{ color: "var(--muted)", fontSize: 12 }}> · {w.karigar.city}</span>}
                  <span style={{
                    marginLeft: 7, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                    background: w.karigar.kind === "IN_HOUSE" ? "#e8f5e9" : "#ede9fe",
                    color: w.karigar.kind === "IN_HOUSE" ? "#2e7d32" : "#6d28d9",
                  }}>
                    {w.karigar.kind === "IN_HOUSE" ? "In-house" : "Outside"}
                  </span>
                </span>
                <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                  <strong>{w.openPieces}</strong> <span style={{ color: "var(--muted)" }}>out</span>
                </span>
                <span style={{ fontSize: 13, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                  {w.finishedPieces} done
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums", color: w.amountDue > 0 ? "#e65100" : "var(--muted)" }}>
                  {w.amountDue > 0 ? formatMoney(w.amountDue) : "—"}
                  {canManage && onMutate && w.amountDue > 0 && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={e => { e.stopPropagation(); setSettling(w); setAmount(String(w.amountDue)); }}
                      onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); setSettling(w); setAmount(String(w.amountDue)); } }}
                      style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--primary)", cursor: "pointer" }}
                    >
                      Settle
                    </span>
                  )}
                </span>
                <ChevronRight size={14} style={{
                  color: "var(--muted)",
                  transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .12s",
                }} />
              </button>

              {isOpen && (
                w.jobs.length === 0 ? (
                  <div style={{ padding: "12px 16px 16px 40px", fontSize: 12, color: "var(--muted)" }}>
                    Nothing out with them right now.
                  </div>
                ) : (
                  <div style={{ padding: "0 16px 14px 40px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {w.jobs.map(j => (
                      <div key={j.id} style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{j.jobNumber}</span>
                          <span style={{ fontSize: 12 }}>{j.cuttingAssignment?.itemType?.name}</span>
                          {j.cuttingAssignment?.rawClothBatch?.designNumber && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "var(--canvas)", color: "var(--ink)" }}>
                              Design {j.cuttingAssignment.rawClothBatch.designNumber}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
                            Given {formatDateShort(j.assignedDate)}
                            {j.dueDate ? ` · due ${formatDateShort(j.dueDate)}` : ""}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                          {j.piecesAssigned} pieces · {j.piecesCompleted} back
                        </div>
                        {(j.sizes?.length ?? 0) > 0 && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                            {j.sizes!.map(z => (
                              <span key={z.id} style={{
                                fontSize: 11, padding: "3px 9px", borderRadius: 7,
                                border: "1px solid var(--line)", background: "var(--canvas)",
                                fontVariantNumeric: "tabular-nums",
                              }}>
                                <strong>{z.size}</strong> {z.piecesCompleted}/{z.piecesAssigned}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>

      {settling && (
        <Modal
          title={`Settle ${settling.karigar.name}`}
          subtitle={`${formatMoney(settling.amountDue)} owed across their open jobs`}
          width={400}
          onClose={() => setSettling(null)}
          onSubmit={settle}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <Button type="submit" disabled={busy || !(+amount > 0)} style={{ flex: 1 }}>
              {busy ? "Recording…" : "Record payment"}
            </Button>
            <Button variant="secondary" onClick={() => setSettling(null)} style={{ flex: 1 }}>Cancel</Button>
          </div>}>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12 }}>
            Goes against their oldest jobs first, the way anybody settling a book would work.
            Paying part of it leaves the rest owing.
          </div>
          <Field label="Amount">
            <Input type="number" min="0" step="0.01" value={amount} autoFocus
              onChange={e => setAmount(e.target.value)} />
          </Field>
        </Modal>
      )}

      {workload.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
          <Users size={13} />
          Work is given out from the Stitching screen. This is the same work seen from the karigar&apos;s side.
        </div>
      )}
    </div>
  );
}
