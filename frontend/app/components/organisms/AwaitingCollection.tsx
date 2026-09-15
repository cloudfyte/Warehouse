"use client";
import { useMemo, useState } from "react";
import { HandHeart } from "lucide-react";
import type { FinishedProduct } from "@/app/types";
import { formatMoney, productName } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Input from "@/app/components/atoms/Input";
import Button from "@/app/components/atoms/Button";
import Modal from "@/app/components/atoms/Modal";
import Field from "@/app/components/molecules/Field";
import PageHeader from "@/app/components/molecules/PageHeader";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import CustomerBill from "@/app/components/molecules/CustomerBill";

interface Props {
  products: FinishedProduct[];
  canManage: boolean;
  onRefresh?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>;
}

/**
 * Readymade garments somebody is waiting for.
 *
 * A readymade piece is not finished when it is tagged — it is finished when
 * the person who asked for it is holding it. Grouped by their bill, because
 * that is how a customer arrives: with a bill number, asking what of theirs
 * is ready.
 */
export default function AwaitingCollection({ products, canManage, onRefresh, onMutate }: Props) {
  const [search, setSearch] = useState("");
  const [handing, setHanding] = useState<FinishedProduct | null>(null);
  const [form, setForm] = useState({ to: "", quantity: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const bills = useMemo(() => {
    const q = search.trim().toLowerCase();
    const groups = new Map<string, FinishedProduct[]>();
    for (const p of products) {
      const bill = p.customerBillNumber || "";
      if (q && !bill.toLowerCase().includes(q) && !productName(p).toLowerCase().includes(q)) continue;
      const found = groups.get(bill);
      if (found) found.push(p); else groups.set(bill, [p]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [products, search]);

  const waiting = products.reduce((t, p) => t + p.quantity, 0);

  async function handOver() {
    if (!handing) return;
    setBusy(true); setErr("");
    try {
      await onMutate(
        `mutation H($id:ID!,$to:String,$qty:Int){handOverReadymade(id:$id,handedOverTo:$to,quantity:$qty){finishedProduct{id}}}`,
        {
          id: handing.id, to: form.to || undefined,
          qty: form.quantity === "" ? undefined : +form.quantity,
        },
      );
      showToast("Handed over.", "success");
      setHanding(null); setForm({ to: "", quantity: "" });
      onRefresh?.();
    } catch (e: unknown) {
      const msg = friendlyError(e); setErr(msg); showToast(msg, "error");
    } finally { setBusy(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Ready for Customers"
        sub={`${waiting} piece${waiting === 1 ? "" : "s"} made to order, waiting to be collected`}
      />

      <Input placeholder="Search bill number or garment…" value={search}
        onChange={e => setSearch(e.target.value)} style={{ marginBottom: 14 }} />

      {bills.length === 0 ? (
        <div style={{
          border: "1px dashed var(--line)", borderRadius: 12, padding: "44px 20px",
          textAlign: "center", color: "var(--muted)", fontSize: 13, lineHeight: 1.7,
        }}>
          {products.length === 0
            ? <>Nothing is waiting. Readymade work appears here once it is stitched and tagged —
                wholesale stock never does, because nobody is waiting for it.</>
            : "Nothing matches that search."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {bills.map(([bill, items]) => (
            <div key={bill} style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{
                display: "flex", alignItems: "baseline", gap: 10, padding: "11px 16px",
                background: "var(--canvas)", borderBottom: "1px solid var(--line)",
              }}>
                <CustomerBill order={items[0]?.customerOrder} billNumber={bill || "No bill number"} />
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {items.reduce((t, p) => t + p.quantity, 0)} piece
                  {items.reduce((t, p) => t + p.quantity, 0) === 1 ? "" : "s"}
                  {" · "}{items.length} line{items.length === 1 ? "" : "s"}
                </span>
              </div>
              {items.map(p => (
                <div key={p.id} style={{
                  display: "grid", gridTemplateColumns: "1fr 90px 110px 120px",
                  gap: 12, alignItems: "center", padding: "10px 16px", borderTop: "1px solid var(--line)",
                }}>
                  <span style={{ fontSize: 13 }}>
                    {productName(p)}
                    {p.size ? <span style={{ color: "var(--muted)" }}> · {p.size}</span> : null}
                    {p.clothColor?.name ? <span style={{ color: "var(--muted)" }}> · {p.clothColor.name}</span> : null}
                  </span>
                  <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                    <strong>{p.quantity}</strong> pc
                  </span>
                  <span style={{ fontSize: 13, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                    {formatMoney(p.salePrice)}
                  </span>
                  {canManage && (
                    <Button size="sm" variant="secondary"
                      onClick={() => { setHanding(p); setForm({ to: "", quantity: String(p.quantity) }); setErr(""); }}>
                      <HandHeart size={13} /> Hand over
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {handing && (
        <Modal
          title="Hand over"
          subtitle={`${handing.customerBillNumber} · ${productName(handing)}${handing.size ? ` · ${handing.size}` : ""}`}
          width={420}
          onClose={() => setHanding(null)}
          onSubmit={handOver}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <Button type="submit" disabled={busy} style={{ flex: 1 }}>
              {busy ? "Recording…" : "Handed over"}
            </Button>
            <Button variant="secondary" onClick={() => setHanding(null)}>Cancel</Button>
          </div>}>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12 }}>
            This takes the garment out of stock — once the customer has it, it is no longer
            yours to sell. Collecting part of a line leaves the rest waiting under the same bill.
          </div>
          <Field label="How many collected" hint={`${handing.quantity} waiting.`}>
            <Input type="number" min="1" max={handing.quantity} value={form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
          </Field>
          <Field label="Collected by">
            <Input value={form.to} placeholder="Who picked it up" autoFocus
              onChange={e => setForm(f => ({ ...f, to: e.target.value }))} />
          </Field>
          {err && <ErrorBanner msg={err} />}
        </Modal>
      )}
    </div>
  );
}
