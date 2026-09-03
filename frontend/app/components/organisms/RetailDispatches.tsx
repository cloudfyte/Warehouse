"use client";
import { useMemo, useState } from "react";
import { Truck, ScanLine, Package, Send, X, AlertTriangle, Link2, RefreshCw } from "lucide-react";
import type { FinishedProduct, WarehouseLocation } from "@/app/types";
import { formatMoney, productName } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Button from "@/app/components/atoms/Button";
import Modal from "@/app/components/atoms/Modal";
import BarcodeScanner from "@/app/components/atoms/BarcodeScanner";
import Field from "@/app/components/molecules/Field";
import PageHeader from "@/app/components/molecules/PageHeader";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";

interface Store { id: string; buildingId: number; name: string; active: boolean }
interface Channel { subsiteId: number; subsiteName: string; apiUrl: string; active: boolean }
interface DispatchItem {
  id: string; quantity: number; packedQuantity: number; unitCost: number;
  finishedProduct: FinishedProduct;
}
interface Dispatch {
  id: string; dispatchNumber: string; status: string; receiptId?: number | null;
  lastError?: string; attempts: number; dispatchDate?: string | null; notes?: string;
  transporterName?: string; lrNumber?: string; vehicleNumber?: string;
  store: Store; fromWarehouse: WarehouseLocation; items: DispatchItem[];
}

interface Props {
  channel?: Channel | null;
  stores: Store[];
  dispatches: Dispatch[];
  products: FinishedProduct[];
  unlinked: FinishedProduct[];
  warehouses: WarehouseLocation[];
  canManage: boolean;
  onRefresh?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>;
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "#64748b", PACKED: "#0ea5e9", SENT: "#f59e0b",
  ACKNOWLEDGED: "#10b981", FAILED: "#ef4444", CANCELLED: "#94a3b8",
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Being packed", PACKED: "Packed — ready to send", SENT: "Sent",
  ACKNOWLEDGED: "Received by shop", FAILED: "Failed — needs a look", CANCELLED: "Cancelled",
};

const DISPATCH_FIELDS =
  "id dispatchNumber status receiptId lastError attempts dispatchDate notes "
  + "transporterName lrNumber vehicleNumber "
  + "store{id buildingId name active} fromWarehouse{id name code} "
  + "items{id quantity packedQuantity unitCost "
  + "finishedProduct{id name sku barcode size quantity costPrice salePrice itemType{id name} clothColor{id name}}}";

/**
 * Consignments from this godown to the retail shop.
 *
 * Not sales. Moving goods to your own shop books no revenue and no debtor —
 * it is the same stock in a different building. What matters here is counting
 * once: the carton is scanned shut, stock leaves at that moment, and the shop
 * is told exactly once.
 */
export default function RetailDispatches({
  channel, stores, dispatches, products, unlinked, warehouses, canManage, onRefresh, onMutate,
}: Props) {
  const [showNew, setShowNew] = useState(false);
  const [open, setOpen] = useState<Dispatch | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [linking, setLinking] = useState<FinishedProduct | null>(null);
  const [linkForm, setLinkForm] = useState({ productId: "", variantId: "" });

  // New consignment form
  const [storeId, setStoreId] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [lines, setLines] = useState<{ productId: string; quantity: string }[]>([]);
  const [lr, setLr] = useState({ transporterName: "", lrNumber: "", vehicleNumber: "", driverPhone: "" });

  const live = useMemo(
    () => (open ? dispatches.find(d => d.id === open.id) ?? open : null),
    [dispatches, open],
  );

  const configured = !!channel?.active && stores.some(s => s.active);

  async function run<T>(fn: () => Promise<T>, done?: string): Promise<T | undefined> {
    setBusy(true); setErr("");
    try {
      const out = await fn();
      if (done) showToast(done, "success");
      onRefresh?.();
      return out;
    } catch (e: unknown) {
      const msg = friendlyError(e);
      setErr(msg); showToast(msg, "error");
    } finally { setBusy(false); }
  }

  async function createDispatch() {
    const payload = lines
      .filter(l => l.productId && parseInt(l.quantity, 10) > 0)
      .map(l => ({ finishedProductId: l.productId, quantity: parseInt(l.quantity, 10) }));
    if (!storeId) { setErr("Which shop is this going to?"); return; }
    if (!payload.length) { setErr("Add at least one product."); return; }

    const res = await run(() => onMutate(
      `mutation C($s:ID!,$w:ID!,$l:[DispatchLineInput!]!,$t:String,$lr:String,$v:String,$d:String){`
      + `createRetailDispatch(storeId:$s,warehouseId:$w,lines:$l,transporterName:$t,lrNumber:$lr,vehicleNumber:$v,driverPhone:$d)`
      + `{dispatch{${DISPATCH_FIELDS}}}}`,
      {
        s: storeId, w: warehouseId, l: payload,
        t: lr.transporterName || undefined, lr: lr.lrNumber || undefined,
        v: lr.vehicleNumber || undefined, d: lr.driverPhone || undefined,
      },
    ), "Consignment opened. Scan the garments into the carton.");
    const made = res?.createRetailDispatch?.dispatch;
    if (made) {
      setShowNew(false); setLines([]); setLr({ transporterName: "", lrNumber: "", vehicleNumber: "", driverPhone: "" });
      setOpen(made);
    }
  }

  async function scan(code: string) {
    if (!live || !code.trim()) return;
    const res = await run(() => onMutate(
      `mutation S($id:ID!,$b:String!){scanIntoRetailDispatch(id:$id,barcode:$b)`
      + `{item{id packedQuantity quantity finishedProduct{id sku}}}}`,
      { id: live.id, b: code.trim() },
    ));
    const item = res?.scanIntoRetailDispatch?.item;
    if (item) {
      showToast(`${item.finishedProduct.sku} — ${item.packedQuantity} of ${item.quantity} packed.`, "success");
      setManualCode("");
    }
  }

  async function pack(allowShort: boolean) {
    if (!live) return;
    await run(() => onMutate(
      `mutation P($id:ID!,$short:Boolean){packRetailDispatch(id:$id,allowShort:$short){dispatch{${DISPATCH_FIELDS}}}}`,
      { id: live.id, short: allowShort },
    ), "Cartons closed. The stock has left the godown.");
  }

  async function send() {
    if (!live) return;
    await run(() => onMutate(
      `mutation S($id:ID!){sendRetailDispatch(id:$id){dispatch{${DISPATCH_FIELDS}}}}`,
      { id: live.id },
    ), "The shop has been told.");
  }

  async function cancel() {
    if (!live) return;
    await run(() => onMutate(
      `mutation C($id:ID!){cancelRetailDispatch(id:$id){dispatch{${DISPATCH_FIELDS}}}}`,
      { id: live.id },
    ), "Consignment cancelled. Stock is back in the godown.");
  }

  /** The shop's store list, fetched rather than typed. */
  async function pullStores() {
    const res = await run(() => onMutate(
      `mutation P{pullRetailStores{stores{id buildingId name active}}}`, {},
    ));
    const found = res?.pullRetailStores?.stores?.filter((s: Store) => s.active).length ?? 0;
    if (found) showToast(`${found} store${found === 1 ? "" : "s"} found at the shop.`, "success");
  }

  /** Match by barcode. Whatever it cannot settle stays in the unlinked list. */
  async function pullCatalogue() {
    const res = await run(() => onMutate(
      `mutation P{pullRetailCatalogue{linked unmatched{id sku}}}`, {},
    ));
    const out = res?.pullRetailCatalogue;
    if (out) {
      showToast(
        out.linked
          ? `${out.linked} matched by barcode. ${out.unmatched.length} still need a person.`
          : `Nothing matched by barcode. ${out.unmatched.length} need linking by hand.`,
        out.linked ? "success" : "error",
      );
    }
  }

  async function saveLink() {
    if (!linking) return;
    await run(() => onMutate(
      `mutation L($fp:ID!,$p:Int!,$v:Int){linkRetailProduct(finishedProductId:$fp,productId:$p,variantId:$v){link{id productId variantId}}}`,
      {
        fp: linking.id, p: parseInt(linkForm.productId, 10),
        v: linkForm.variantId ? parseInt(linkForm.variantId, 10) : undefined,
      },
    ), `${productName(linking)} linked to the shop's catalogue.`);
    setLinking(null); setLinkForm({ productId: "", variantId: "" });
  }

  const packedAll = !!live?.items.every(i => i.packedQuantity >= i.quantity);
  const packedSome = !!live?.items.some(i => i.packedQuantity > 0);

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="To the Shop"
        sub={channel
          ? `Consignments to ${channel.subsiteName}`
          : "No shop connected yet"}
        actions={canManage && configured ? (
          <>
            <Button variant="ghost" onClick={pullStores} disabled={busy} title="Re-read the shop's store list">
              <RefreshCw size={14} /> Sync stores
            </Button>
            <Button variant="primary" onClick={() => { setShowNew(true); setErr(""); setLines([{ productId: "", quantity: "" }]); }}>
              <Truck size={14} /> New Consignment
            </Button>
          </>
        ) : undefined}
      />

      {!configured && (
        <div style={{
          display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px",
          borderRadius: 10, background: "#f59e0b18", border: "1px solid #f59e0b55",
          fontSize: 13, lineHeight: 1.6, marginBottom: 16,
        }}>
          <AlertTriangle size={16} style={{ flex: "none", marginTop: 2, color: "#b45309" }} />
          <div>
            <strong>Not connected to the shop yet.</strong>{" "}
            {!channel?.active
              ? "Set the retail subsite under Settings — its id, its address, and a service login of its own."
              : "The subsite is set. Fetch its stores and nothing has to be typed."}
            {channel?.active && canManage && (
              <div style={{ marginTop: 8 }}>
                <Button variant="secondary" onClick={pullStores} disabled={busy}>
                  <RefreshCw size={13} /> Fetch the shop&apos;s stores
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {unlinked.length > 0 && (
        <div style={{
          borderRadius: 10, border: "1px solid var(--line)", padding: "12px 14px", marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            {unlinked.length} product{unlinked.length === 1 ? "" : "s"} cannot be sent yet
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.55 }}>
            Nobody has said which product at the shop these are. They are not created over there
            automatically — two catalogues that mint each other&apos;s rows fork quietly and are never
            reconciled again. Their variants carry a barcode of their own, so most of this settles
            itself.
          </div>
          {canManage && (
            <div style={{ marginBottom: 10 }}>
              <Button variant="primary" onClick={pullCatalogue} disabled={busy}>
                <RefreshCw size={13} /> Match by barcode
              </Button>
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {unlinked.slice(0, 12).map(p => (
              <button key={p.id} type="button" disabled={!canManage}
                onClick={() => { setLinking(p); setLinkForm({ productId: "", variantId: "" }); setErr(""); }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px",
                  borderRadius: 7, border: "1px solid var(--line)", background: "transparent",
                  color: "var(--ink)", fontSize: 12, cursor: canManage ? "pointer" : "default",
                }}>
                <Link2 size={12} /> {productName(p)}{p.size ? ` · ${p.size}` : ""}
              </button>
            ))}
            {unlinked.length > 12 && (
              <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>
                +{unlinked.length - 12} more
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
        {dispatches.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            Nothing has gone to the shop yet.
          </div>
        ) : dispatches.map(d => (
          <button key={d.id} type="button" onClick={() => { setOpen(d); setErr(""); }}
            style={{
              display: "flex", width: "100%", alignItems: "center", gap: 12, padding: "12px 14px",
              borderBottom: "1px solid var(--line)", background: "transparent",
              border: "none", borderBottomStyle: "solid", textAlign: "left", cursor: "pointer",
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {d.dispatchNumber} → {d.store.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {d.items.length} line{d.items.length === 1 ? "" : "s"}
                {" · "}{d.items.reduce((n, i) => n + i.quantity, 0)} pcs
                {d.lrNumber ? ` · LR ${d.lrNumber}` : ""}
                {d.receiptId ? ` · their receipt #${d.receiptId}` : ""}
              </div>
            </div>
            <span style={{
              padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600,
              background: (STATUS_COLOR[d.status] || "#888") + "22",
              color: STATUS_COLOR[d.status] || "#888", whiteSpace: "nowrap",
            }}>
              {STATUS_LABEL[d.status] || d.status}
            </span>
          </button>
        ))}
      </div>

      {/* ── new consignment ── */}
      {showNew && (
        <Modal title="New Consignment" subtitle="A packing list. Nothing moves until the cartons are scanned shut."
          width={640} onClose={() => setShowNew(false)} onSubmit={createDispatch}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="primary" type="submit" disabled={busy} style={{ flex: 1 }}>
                {busy ? "Opening…" : "Open consignment"}
              </Button>
              <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            </div>
          }>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Shop *">
              <Select value={storeId} onChange={e => setStoreId(e.target.value)}>
                <option value="">Select…</option>
                {stores.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="From warehouse *">
              <Select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", margin: "12px 0 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Products
          </div>
          {lines.map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <Select value={line.productId} style={{ flex: 1 }}
                onChange={e => setLines(ls => ls.map((l, j) => j === i ? { ...l, productId: e.target.value } : l))}>
                <option value="">Select a product…</option>
                {products.filter(p => p.quantity > 0).map(p => (
                  <option key={p.id} value={p.id}>
                    {productName(p)}{p.size ? ` · ${p.size}` : ""} — {p.quantity} in stock
                  </option>
                ))}
              </Select>
              <Input type="number" min="1" placeholder="Qty" value={line.quantity} style={{ width: 90 }}
                onChange={e => setLines(ls => ls.map((l, j) => j === i ? { ...l, quantity: e.target.value } : l))} />
              <button type="button" aria-label={`Remove line ${i + 1}`}
                onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", color: "var(--muted)", padding: 6 }}>
                <X size={15} />
              </button>
            </div>
          ))}
          <Button variant="secondary" onClick={() => setLines(ls => [...ls, { productId: "", quantity: "" }])}
            style={{ fontSize: 12, padding: "5px 10px" }}>
            + Add product
          </Button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
            <Field label="Transporter"><Input value={lr.transporterName} onChange={e => setLr(p => ({ ...p, transporterName: e.target.value }))} /></Field>
            <Field label="LR number"><Input value={lr.lrNumber} onChange={e => setLr(p => ({ ...p, lrNumber: e.target.value }))} /></Field>
            <Field label="Vehicle"><Input value={lr.vehicleNumber} onChange={e => setLr(p => ({ ...p, vehicleNumber: e.target.value }))} /></Field>
            <Field label="Driver phone"><Input value={lr.driverPhone} onChange={e => setLr(p => ({ ...p, driverPhone: e.target.value }))} /></Field>
          </div>
          {err && <ErrorBanner msg={err} />}
        </Modal>
      )}

      {/* ── one consignment ── */}
      {live && (
        <Modal title={live.dispatchNumber}
          subtitle={`${live.store.name} · ${STATUS_LABEL[live.status] || live.status}`}
          width={680} onClose={() => setOpen(null)}
          footer={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {live.status === "DRAFT" && canManage && (
                <>
                  <Button variant="primary" onClick={() => pack(false)} disabled={busy || !packedAll}>
                    <Package size={14} /> Close cartons
                  </Button>
                  {!packedAll && packedSome && (
                    <Button variant="secondary" onClick={() => pack(true)} disabled={busy}>
                      Pack short on purpose
                    </Button>
                  )}
                </>
              )}
              {(live.status === "PACKED" || live.status === "FAILED") && canManage && (
                <Button variant="primary" onClick={send} disabled={busy}>
                  <Send size={14} /> {live.status === "FAILED" ? "Try the shop again" : "Tell the shop"}
                </Button>
              )}
              {["DRAFT", "PACKED", "FAILED"].includes(live.status) && canManage && (
                <Button variant="danger" onClick={cancel} disabled={busy}>Cancel</Button>
              )}
              <Button variant="secondary" onClick={() => setOpen(null)}>Close</Button>
            </div>
          }>
          {live.status === "ACKNOWLEDGED" && (
            <div style={{ padding: "10px 12px", borderRadius: 9, background: "#10b98118", fontSize: 13, marginBottom: 12 }}>
              The shop booked this in as receipt <strong>#{live.receiptId}</strong>. It will not be sent again —
              sending twice would add the stock a second time.
            </div>
          )}
          {live.status === "FAILED" && (
            <div style={{ padding: "10px 12px", borderRadius: 9, background: "#ef444418", fontSize: 13, marginBottom: 12, lineHeight: 1.6 }}>
              <strong>Did not get through.</strong> {live.lastError}
              <div style={{ color: "var(--muted)", marginTop: 6 }}>
                It is not retried on its own: a call that timed out may already have landed. Check the
                shop&apos;s goods-in log for <strong>{live.dispatchNumber}</strong> before trying again.
              </div>
            </div>
          )}

          {live.status === "DRAFT" && canManage && (
            <div style={{ border: "1px dashed var(--line)", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Scan into the carton
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="primary" onClick={() => setScanning(true)}>
                  <ScanLine size={14} /> Scan
                </Button>
                <Input placeholder="…or type the barcode" value={manualCode} style={{ flex: 1, minWidth: 180 }}
                  onChange={e => setManualCode(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); scan(manualCode); } }} />
                <Button variant="secondary" onClick={() => scan(manualCode)} disabled={busy || !manualCode.trim()}>
                  Add
                </Button>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                The manifest becomes what was actually scanned, so a short consignment is found here —
                with the goods still in reach — instead of at the shop tomorrow.
              </div>
            </div>
          )}

          <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 8, padding: "8px 12px",
              background: "var(--canvas)", fontSize: 11, fontWeight: 700, color: "var(--muted)",
              textTransform: "uppercase", letterSpacing: 0.5,
            }}>
              <span>Product</span><span>Packed</span><span>Cost</span>
            </div>
            {live.items.map(item => {
              const short = item.packedQuantity < item.quantity;
              return (
                <div key={item.id} style={{
                  display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 8,
                  padding: "9px 12px", alignItems: "center", borderTop: "1px solid var(--line)",
                }}>
                  <span style={{ fontSize: 13 }}>
                    {productName(item.finishedProduct)}
                    {item.finishedProduct.size ? ` · ${item.finishedProduct.size}` : ""}
                    <span style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: 11 }}>
                      {" "}{item.finishedProduct.barcode}
                    </span>
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: short && live.status === "DRAFT" ? "#b45309" : "inherit",
                  }}>
                    {item.packedQuantity} / {item.quantity}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>{formatMoney(item.unitCost)}</span>
                </div>
              );
            })}
          </div>
          {err && <ErrorBanner msg={err} />}
        </Modal>
      )}

      {scanning && (
        <BarcodeScanner onDetected={code => { setScanning(false); scan(code); }} onClose={() => setScanning(false)} />
      )}

      {/* ── link a product to the shop's catalogue ── */}
      {linking && (
        <Modal title="Link to the shop's catalogue"
          subtitle={`${productName(linking)}${linking.size ? ` · ${linking.size}` : ""} — ${linking.sku}`}
          width={460} onClose={() => setLinking(null)} onSubmit={saveLink}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="primary" type="submit" disabled={busy || !linkForm.productId} style={{ flex: 1 }}>
                {busy ? "Linking…" : "Link"}
              </Button>
              <Button variant="secondary" onClick={() => setLinking(null)}>Cancel</Button>
            </div>
          }>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12 }}>
            Only for what <strong>Match by barcode</strong> could not settle — because the shop has no
            barcode on it, or has used the same one twice. Take the ids from the shop&apos;s own product
            screen, and give the variant id when the product has sizes or colours over there: that is
            the thing their till actually sells.
          </div>
          <Field label="Product id *">
            <Input type="number" min="1" value={linkForm.productId} autoFocus
              onChange={e => setLinkForm(f => ({ ...f, productId: e.target.value }))} />
          </Field>
          <Field label="Variant id" hint="Leave blank if the product has no variants over there.">
            <Input type="number" min="1" value={linkForm.variantId}
              onChange={e => setLinkForm(f => ({ ...f, variantId: e.target.value }))} />
          </Field>
          {err && <ErrorBanner msg={err} />}
        </Modal>
      )}
    </div>
  );
}
