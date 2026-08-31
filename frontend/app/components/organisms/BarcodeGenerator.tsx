"use client";
import { useMemo, useState } from "react";
import { Printer, Plus, X, Search } from "lucide-react";
import type { FinishedProduct } from "@/app/types";
import { formatMoney } from "@/app/lib/formatters";
import { showToast } from "@/app/lib/toast";
import { tagSheetDocument, tagPreviewDocument, type TagSettings } from "@/app/lib/tagTemplate";
import Input from "@/app/components/atoms/Input";
import Button from "@/app/components/atoms/Button";

interface Props {
  products: FinishedProduct[];
  systemSettings?: TagSettings;
  /** Marks the printed products as tagged, the same call the single-tag print makes. */
  onMutate: (q: string, v: Record<string, unknown>) => Promise<unknown>;
}

interface QueueRow {
  product: FinishedProduct;
  copies: number;
}

/**
 * Print a batch of tags in one go.
 *
 * The single-product drawer prints one tag at a time, which is fine for a
 * reprint and useless for a delivery of two hundred pieces. This is the bulk
 * path: find items, say how many labels each needs, print the lot.
 *
 * Copies default to the quantity in stock, because that is what you are
 * tagging almost every time.
 */
export default function BarcodeGenerator({ products, systemSettings, onMutate }: Props) {
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [printing, setPrinting] = useState(false);

  const queuedIds = useMemo(() => new Set(queue.map(r => r.product.id)), [queue]);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return products
      .filter(p => !queuedIds.has(p.id))
      .filter(p =>
        p.sku.toLowerCase().includes(term)
        || p.itemType.name.toLowerCase().includes(term)
        || p.barcode.toLowerCase().includes(term)
        || (p.size || "").toLowerCase().includes(term))
      .slice(0, 8);
  }, [products, search, queuedIds]);

  const totalLabels = queue.reduce((sum, r) => sum + (r.copies || 0), 0);

  function add(product: FinishedProduct) {
    setQueue(q => [...q, { product, copies: Math.max(1, product.quantity || 1) }]);
    setSearch("");
  }

  function setCopies(id: string, value: string) {
    const n = parseInt(value, 10);
    setQueue(q => q.map(r => r.product.id === id ? { ...r, copies: Number.isNaN(n) ? 0 : Math.max(0, n) } : r));
  }

  function addEverythingUntagged() {
    const untagged = products.filter(p => !p.tagsPrinted && !queuedIds.has(p.id));
    if (!untagged.length) { showToast("Every product already has its tags printed.", "success"); return; }
    setQueue(q => [...q, ...untagged.map(p => ({ product: p, copies: Math.max(1, p.quantity || 1) }))]);
  }

  async function print() {
    const printable = queue.filter(r => r.copies > 0);
    if (!printable.length) { showToast("Add at least one product to print.", "error"); return; }

    setPrinting(true);
    try {
      const win = window.open("", "_blank");
      if (!win) { showToast("Allow popups for this site to print tags.", "error"); return; }
      win.document.write(tagSheetDocument(
        printable.map(r => ({ product: r.product, copies: r.copies })),
        systemSettings || {},
      ));
      win.document.close();

      // Best effort — the tags are already printing, so a failure here must not
      // look like the print failed.
      await Promise.allSettled(printable.map(r => onMutate(
        `mutation M($id:ID!,$p:Boolean!){updateFinishedProduct(id:$id,tagsPrinted:$p){finishedProduct{id tagsPrinted}}}`,
        { id: r.product.id, p: true },
      )));
      showToast(`${totalLabels} label${totalLabels === 1 ? "" : "s"} sent to the printer.`, "success");
    } finally {
      setPrinting(false);
    }
  }

  const previewProduct = queue[0]?.product;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 260px", gap: 20, alignItems: "start" }}>
      <div>
        {/* Find */}
        <div style={{ position: "relative", marginBottom: 8 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }} />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, size, SKU or barcode…"
            style={{ paddingLeft: 34 }}
          />
          {matches.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 4,
              background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.10)", overflow: "hidden",
            }}>
              {matches.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => add(p)}
                  style={{
                    display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
                    gap: 12, padding: "10px 14px", background: "none", border: "none",
                    borderBottom: "1px solid var(--line)", textAlign: "left", color: "var(--ink)",
                  }}
                >
                  <span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.itemType.name}</span>
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>
                      {p.size ? ` · ${p.size}` : ""} · {p.quantity} pcs · {formatMoney(p.salePrice)}
                    </span>
                  </span>
                  <Plus size={15} style={{ color: "var(--primary)", flex: "none" }} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <Button variant="secondary" onClick={addEverythingUntagged} style={{ fontSize: 13, padding: "6px 12px" }}>
            Add everything not yet tagged
          </Button>
        </div>

        {/* Queue */}
        {queue.length === 0 ? (
          <div style={{
            border: "1px dashed var(--line)", borderRadius: 12, padding: "40px 20px",
            textAlign: "center", color: "var(--muted)", fontSize: 13,
          }}>
            Search for a product above to start a batch.
          </div>
        ) : (
          <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
            {queue.map(row => (
              <div key={row.product.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px", borderBottom: "1px solid var(--line)",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {row.product.itemType.name}
                    {row.product.size ? ` · ${row.product.size}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>
                    {row.product.barcode} · {formatMoney(row.product.salePrice)}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Labels</span>
                  <Input
                    type="number" min="0" step="1"
                    value={String(row.copies)}
                    onChange={e => setCopies(row.product.id, e.target.value)}
                    style={{ width: 72, textAlign: "center" }}
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${row.product.itemType.name}`}
                  onClick={() => setQueue(q => q.filter(r => r.product.id !== row.product.id))}
                  style={{ background: "none", border: "none", color: "var(--muted)", flex: "none", padding: 6 }}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview + print */}
      <div style={{ position: "sticky", top: 12 }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Preview</div>
        <div style={{
          border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden",
          background: "#fff", height: 220, marginBottom: 12,
        }}>
          {previewProduct ? (
            <iframe
              title="Tag preview"
              srcDoc={tagPreviewDocument(previewProduct, systemSettings || {})}
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          ) : (
            <div style={{
              height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              color: "#999", fontSize: 12, textAlign: "center", padding: 16,
            }}>
              Add a product to see its tag
            </div>
          )}
        </div>

        <div style={{ fontSize: 13, marginBottom: 10 }}>
          <strong>{totalLabels}</strong> label{totalLabels === 1 ? "" : "s"} across{" "}
          <strong>{queue.length}</strong> product{queue.length === 1 ? "" : "s"}
        </div>

        <Button
          variant="primary"
          onClick={print}
          disabled={printing || totalLabels === 0}
          style={{ width: "100%", padding: "11px" }}
        >
          <Printer size={15} /> {printing ? "Printing…" : "Print Tags"}
        </Button>
        {queue.length > 0 && (
          <Button variant="secondary" onClick={() => setQueue([])} style={{ width: "100%", marginTop: 8 }}>
            Clear batch
          </Button>
        )}
      </div>
    </div>
  );
}
