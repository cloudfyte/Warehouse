"use client";
import { useMemo, useState } from "react";
import { Printer, Plus, X, Search, Pencil, RefreshCw } from "lucide-react";
import type { FinishedProduct } from "@/app/types";
import { formatMoney, productName } from "@/app/lib/formatters";
import { showToast } from "@/app/lib/toast";
import { tagSheetDocument, tagPreviewDocument, type TagSettings, type TagExtraLines } from "@/app/lib/tagTemplate";
import Input from "@/app/components/atoms/Input";
import Button from "@/app/components/atoms/Button";
import Field from "@/app/components/molecules/Field";

interface Props {
  products: FinishedProduct[];
  systemSettings?: TagSettings;
  /** Marks the printed products as tagged, the same call the single-tag print makes. */
  onMutate: (q: string, v: Record<string, unknown>) => Promise<unknown>;
}

interface QueueRow {
  product: FinishedProduct;
  copies: number;
  /**
   * A name for this print run only — nothing is written to the product.
   *
   * "Pintex Kurtha" on the shelf goes out as "Pintex Kurtha Daman" on one
   * batch of labels. Renaming the product for that would be wrong twice over:
   * every past tag would disagree with the record, and the next run would
   * inherit a name that was only ever meant for this one.
   */
  nameOverride?: string;
}

/** The product as this row will print it. */
function withPrintName(row: QueueRow): FinishedProduct {
  return row.nameOverride
    ? { ...row.product, name: row.nameOverride }
    : row.product;
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
  // Not saved to Settings — this is text for one run of labels.
  const [extra, setExtra] = useState<TagExtraLines>({ header: "", line1: "", line2: "" });

  // Fixing a wrong price without leaving the screen. Cost is the figure buried
  // in the barcode, so correcting it here re-mints the code — and you see the
  // new one in the preview before any label is printed.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", costPrice: "", salePrice: "", size: "" });
  /** Where an edited name goes: this batch of labels, or the product itself. */
  const [nameScope, setNameScope] = useState<"label" | "product">("label");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editErr, setEditErr] = useState("");

  function openEdit(row: QueueRow) {
    const product = row.product;
    setDraft({
      name: row.nameOverride ?? productName(product),
      costPrice: String(product.costPrice ?? ""),
      salePrice: String(product.salePrice ?? ""),
      size: product.size || "",
    });
    setNameScope(row.nameOverride ? "label" : "product");
    setEditErr("");
    setEditingId(product.id);
  }

  async function saveEdit(row: QueueRow) {
    const product = row.product;
    const typedName = draft.name.trim();
    const renaming = nameScope === "product" && typedName !== productName(product);
    // An empty box means "go back to the item type's name", which is a real
    // change to make and not the same as leaving the field alone.
    const nameArg = renaming ? (typedName === product.itemType.name ? "" : typedName) : undefined;

    const priced =
      (draft.costPrice !== "" && +draft.costPrice !== Number(product.costPrice))
      || (draft.salePrice !== "" && +draft.salePrice !== Number(product.salePrice))
      || (draft.size !== "" && draft.size !== (product.size || ""));

    // Label-only naming writes nothing, so there is no call to make.
    if (!priced && !renaming) {
      setQueue(q => q.map(r => r.product.id === product.id
        ? { ...r, nameOverride: nameScope === "label" && typedName !== productName(product) ? typedName : undefined }
        : r));
      setEditingId(null);
      return;
    }

    setSavingEdit(true); setEditErr("");
    try {
      const res = await onMutate(
        `mutation E($id:ID!,$cp:Float,$sp:Float,$size:String,$name:String){`
        + `updateFinishedProduct(id:$id,costPrice:$cp,salePrice:$sp,size:$size,name:$name)`
        + `{finishedProduct{id name costPrice salePrice size barcode barcodeSvg tagsPrinted}}}`,
        {
          id: product.id,
          cp: draft.costPrice === "" ? undefined : +draft.costPrice,
          sp: draft.salePrice === "" ? undefined : +draft.salePrice,
          size: draft.size || undefined,
          name: nameArg,
        },
      ) as { updateFinishedProduct?: { finishedProduct?: Partial<FinishedProduct> } };

      // Take the server's version: it decides whether the code was re-minted,
      // and the preview must show the code that will actually be printed.
      const updated = res?.updateFinishedProduct?.finishedProduct;
      setQueue(q => q.map(r => r.product.id === product.id
        ? {
            ...r,
            product: updated ? { ...r.product, ...updated } as FinishedProduct : r.product,
            // A saved rename replaces any label-only name; a label-only name
            // set alongside a price fix is kept.
            nameOverride: renaming
              ? undefined
              : (nameScope === "label" && typedName !== productName(product) ? typedName : r.nameOverride),
          }
        : r));
      setEditingId(null);
      showToast(renaming ? "Product renamed." : "Product updated.", "success");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save the change.";
      setEditErr(msg); showToast(msg, "error");
    } finally { setSavingEdit(false); }
  }

  const queuedIds = useMemo(() => new Set(queue.map(r => r.product.id)), [queue]);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return products
      .filter(p => !queuedIds.has(p.id))
      .filter(p =>
        p.sku.toLowerCase().includes(term)
        || productName(p).toLowerCase().includes(term)
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
        printable.map(r => ({ product: withPrintName(r), copies: r.copies })),
        systemSettings || {},
        extra,
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

  // Follow whatever is being edited, so a corrected price and its new barcode
  // are what you are looking at. Otherwise the first item in the batch.
  const previewRow = queue.find(r => r.product.id === editingId) ?? queue[0];
  const previewProduct = previewRow && withPrintName(
    // While the edit panel is open the preview follows the box, so the name
    // being typed is the name on the label in front of you.
    editingId === previewRow.product.id && draft.name.trim() !== productName(previewRow.product)
      ? { ...previewRow, nameOverride: draft.name.trim() }
      : previewRow,
  );

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
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{productName(p)}</span>
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

        <div style={{
          border: "1px solid var(--line)", borderRadius: 12,
          padding: "12px 14px", marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Extra text for this batch
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Header" hint="Top of the tag.">
              <Input value={extra.header ?? ""} placeholder="e.g. SRI WEDDING"
                onChange={e => setExtra(x => ({ ...x, header: e.target.value }))} />
            </Field>
            <Field label="Line 1">
              <Input value={extra.line1 ?? ""} placeholder="e.g. Wedding Collection"
                onChange={e => setExtra(x => ({ ...x, line1: e.target.value }))} />
            </Field>
            <Field label="Line 2">
              <Input value={extra.line2 ?? ""} placeholder="e.g. Season 2026"
                onChange={e => setExtra(x => ({ ...x, line2: e.target.value }))} />
            </Field>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
            Printed on this batch only — nothing here changes your saved tag layout.
          </div>
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
              <div key={row.product.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {row.nameOverride || productName(row.product)}
                      {row.product.size ? ` · ${row.product.size}` : ""}
                      {row.nameOverride && (
                        <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: "var(--accent)" }}>
                          this batch only
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>
                      {row.product.barcode} · MRP {formatMoney(row.product.salePrice)} · cost {formatMoney(row.product.costPrice)}
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
                    aria-label={`Edit ${productName(row.product)}`}
                    onClick={() => editingId === row.product.id ? setEditingId(null) : openEdit(row)}
                    style={{
                      background: "none", border: "none", flex: "none", padding: 6,
                      color: editingId === row.product.id ? "var(--primary)" : "var(--muted)",
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${productName(row.product)}`}
                    onClick={() => setQueue(q => q.filter(r => r.product.id !== row.product.id))}
                    style={{ background: "none", border: "none", color: "var(--muted)", flex: "none", padding: 6 }}
                  >
                    <X size={16} />
                  </button>
                </div>

                {editingId === row.product.id && (
                  <div style={{ background: "var(--bg)", padding: "12px 14px" }}>
                    <Field label="Name on the tag">
                      <Input
                        value={draft.name}
                        placeholder={row.product.itemType.name}
                        onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                      />
                    </Field>

                    {draft.name.trim() !== productName(row.product) && (
                      <div style={{ margin: "2px 0 12px" }}>
                        <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
                          {([["label", "Just this batch"], ["product", "Rename the product"]] as const).map(([key, text]) => (
                            <button
                              key={key} type="button" onClick={() => setNameScope(key)}
                              style={{
                                padding: "6px 12px", fontSize: 12, border: "none",
                                fontWeight: nameScope === key ? 700 : 500,
                                background: nameScope === key ? "var(--primary)" : "transparent",
                                color: nameScope === key ? "#fff" : "var(--muted)",
                              }}
                            >
                              {text}
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>
                          {nameScope === "label"
                            ? "Prints on this run of labels and is forgotten. Nothing about the product changes."
                            : `Renames it everywhere — lists, sales orders, every tag from now on. Clear the box to go back to "${row.product.itemType.name}".`}
                        </div>
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                      <Field label="Cost / pc" hint="This is the number inside the barcode.">
                        <Input type="number" min="0" step="0.01" value={draft.costPrice}
                          onChange={e => setDraft(d => ({ ...d, costPrice: e.target.value }))} />
                      </Field>
                      <Field label="MRP / pc" hint="Printed on the tag.">
                        <Input type="number" min="0" step="0.01" value={draft.salePrice}
                          onChange={e => setDraft(d => ({ ...d, salePrice: e.target.value }))} />
                      </Field>
                      <Field label="Size">
                        <Input value={draft.size} placeholder="e.g. 40"
                          onChange={e => setDraft(d => ({ ...d, size: e.target.value }))} />
                      </Field>
                    </div>

                    {draft.costPrice !== "" && +draft.costPrice !== Number(row.product.costPrice) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--accent)", marginBottom: 10 }}>
                        <RefreshCw size={13} />
                        Changing the cost mints a new barcode. Tags already on the rack keep scanning.
                      </div>
                    )}
                    {editErr && <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 10 }}>{editErr}</div>}

                    <div style={{ display: "flex", gap: 8 }}>
                      <Button variant="primary" onClick={() => saveEdit(row)} disabled={savingEdit}>
                        {savingEdit ? "Saving…" : "Save"}
                      </Button>
                      <Button variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                )}
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
              srcDoc={tagPreviewDocument(previewProduct, systemSettings || {}, extra)}
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
