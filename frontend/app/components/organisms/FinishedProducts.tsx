"use client";
import { useState, useEffect } from "react";
import { Camera, Download, Printer, Bluetooth, Pencil, Grid3x3 } from "lucide-react";
import type { FinishedProduct, ItemType, WarehouseLocation } from "@/app/types";
import { formatDateShort, formatMoney, productName } from "@/app/lib/formatters";
import { downloadCsv } from "@/app/lib/csv";
import BarcodeScanner from "@/app/components/atoms/BarcodeScanner";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Button from "@/app/components/atoms/Button";
import { showToast } from "@/app/lib/toast";
import Badge from "@/app/components/atoms/Badge";
import PageHeader from "@/app/components/molecules/PageHeader";
import FilterBar from "@/app/components/molecules/FilterBar";
import Pagination from "@/app/components/atoms/Pagination";
import BluetoothPrintButton from "@/app/components/molecules/BluetoothPrintButton";
import { buildTagEscPos } from "@/app/lib/useBluetooth";

import { tagDocument, type TagSettings } from "@/app/lib/tagTemplate";
import Drawer from "@/app/components/atoms/Drawer";
import Field from "@/app/components/molecules/Field";
import BarcodeGenerator from "@/app/components/organisms/BarcodeGenerator";
import ProductMatrixBuilder from "@/app/components/organisms/ProductMatrixBuilder";

interface Props {
  products: FinishedProduct[]
  itemTypes?: ItemType[]
  warehouses?: WarehouseLocation[]
  /** Only products with one of these are ever reported as low or out of stock. */
  reorderPoints?: { id: string; itemKind: string; active: boolean; size?: string; thresholdPieces?: number | null; itemType?: { id: string } | null; warehouse: { id: string } }[]
  onRefresh?: () => void
  isAdmin: boolean; isSuperAdmin: boolean; isManager: boolean; isStoreKeeper: boolean
  onMutate: (q: string, v: Record<string, unknown>) => Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gql?: (q: string, v?: Record<string, unknown>) => Promise<any>
  systemSettings?: TagSettings
}

const PER_PAGE = 20;

// Layout lives in app/lib/tagTemplate.ts so the Settings preview and this
// printout can never drift apart.
function printTag(product: FinishedProduct, ts: TagSettings = {}) {
  const win = window.open("", "_blank");
  if (!win) { showToast("Allow popups for this site to print tags", "error"); return; }
  win.document.write(tagDocument(product, ts));
  win.document.close();
}

export default function FinishedProducts({ products, itemTypes = [], warehouses = [], reorderPoints = [], onRefresh, isAdmin, isSuperAdmin, isManager, isStoreKeeper, onMutate, gql, systemSettings }: Props) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, sourceFilter]);
  const [selected, setSelected] = useState<FinishedProduct | null>(null);
  const [markingPrinted, setMarkingPrinted] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [view, setView] = useState<"list" | "tags">("list");
  const [showMatrix, setShowMatrix] = useState(false);
  const [scanResult, setScanResult] = useState<{ found: boolean; product?: FinishedProduct } | null>(null);

  const canManage = isSuperAdmin || isAdmin || isManager || isStoreKeeper;
  // Repricing is an admin/manager call; a store keeper can still fix a size or
  // colour that was picked wrong on the way in. Mirrors the service's own gate.
  const canReprice = isSuperAdmin || isAdmin || isManager;

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", salePrice: "", costPrice: "", size: "", ageGroup: "", minStock: "" });

  /** The minimum already set for a product, or "" when it has none. */
  function currentMinimum(p: FinishedProduct) {
    const rp = reorderPoints.find(r =>
      r.itemKind === "FINISHED" && r.active &&
      r.itemType?.id === p.itemType.id &&
      r.warehouse.id === p.warehouse.id &&
      (!r.size || r.size === p.size));
    return rp?.thresholdPieces != null ? String(rp.thresholdPieces) : "";
  }
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState("");

  function openEdit(p: FinishedProduct) {
    setEditForm({
      name: p.name || "",
      salePrice: String(p.salePrice ?? ""),
      costPrice: String(p.costPrice ?? ""),
      size: p.size || "",
      ageGroup: p.ageGroup || "",
      minStock: currentMinimum(p),
    });
    setEditErr(""); setEditing(true);
  }

  async function saveEdit() {
    if (!selected) return;
    setEditSaving(true); setEditErr("");
    try {
      // Only send what the user may change — the service refuses pricing from a
      // store keeper, so offering it and then failing would be a worse message.
      const vars: Record<string, unknown> = {
        id: selected.id,
        size: editForm.size || undefined,
        ageGroup: editForm.ageGroup || undefined,
        // Always sent: an empty box is how the product goes back to being
        // called by its item type, which is a change, not a no-op.
        name: editForm.name.trim() === selected.itemType.name ? "" : editForm.name.trim(),
        // Sent even when blank-to-zero: that is how an alert is switched off.
        minStock: editForm.minStock === "" ? undefined : parseInt(editForm.minStock, 10) || 0,
      };
      if (canReprice) {
        vars.salePrice = editForm.salePrice === "" ? undefined : +editForm.salePrice;
        vars.costPrice = editForm.costPrice === "" ? undefined : +editForm.costPrice;
      }
      await onMutate(
        `mutation E($id:ID!,$salePrice:Float,$costPrice:Float,$size:String,$ageGroup:String,$minStock:Int,$name:String){`
        + `updateFinishedProduct(id:$id,salePrice:$salePrice,costPrice:$costPrice,size:$size,ageGroup:$ageGroup,minStock:$minStock,name:$name)`
        + `{finishedProduct{id name salePrice costPrice size ageGroup profitMargin}}}`,
        vars,
      );
      setSelected(prev => prev ? {
        ...prev,
        salePrice: canReprice && editForm.salePrice !== "" ? +editForm.salePrice : prev.salePrice,
        costPrice: canReprice && editForm.costPrice !== "" ? +editForm.costPrice : prev.costPrice,
        size: editForm.size || prev.size,
        ageGroup: editForm.ageGroup || prev.ageGroup,
        name: editForm.name.trim() === selected.itemType.name ? "" : editForm.name.trim(),
      } : prev);
      setEditing(false);
      showToast("Product updated.", "success");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save the changes.";
      setEditErr(msg); showToast(msg, "error");
    } finally { setEditSaving(false); }
  }
  const filtered = products.filter(p =>
    (p.sku.toLowerCase().includes(search.toLowerCase()) || productName(p).toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search)) &&
    (!sourceFilter || p.source === sourceFilter)
  );
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  async function markPrinted(id: string) {
    setMarkingPrinted(true);
    try {
      await onMutate(
        `mutation M($id:ID!,$p:Boolean!){updateFinishedProduct(id:$id,tagsPrinted:$p){finishedProduct{id tagsPrinted}}}`,
        { id, p: true }
      );
      showToast("Tag printed and marked.", "success");
    } catch { /* silent — don't block the print flow */ }
    finally { setMarkingPrinted(false); }
  }

  async function handleBarcode(code: string) {
    setShowScanner(false);
    const local = products.find(p => p.barcode === code || p.sku === code);
    if (local) { setSelected(local); return; }
    if (gql) {
      const res = await gql(
        `query L($b:String!){productByBarcode(barcode:$b){id name sku quantity salePrice costPrice ageGroup size source barcode barcodeSvg tagsPrinted createdAt itemType{id name} clothColor{id name hexCode} clothCategory{id name} warehouse{id name}}}`,
        { b: code }
      ).catch(() => null);
      if (res?.productByBarcode) { setSelected(res.productByBarcode); return; }
    }
    setScanResult({ found: false });
    setTimeout(() => setScanResult(null), 3500);
  }

  return (
    <div style={{ padding: 24 }}>
      {showScanner && <BarcodeScanner onDetected={handleBarcode} onClose={() => setShowScanner(false)} />}

      {showMatrix && (
        <ProductMatrixBuilder
          itemTypes={itemTypes}
          warehouses={warehouses}
          onMutate={onMutate}
          onCreated={() => onRefresh?.()}
          onClose={() => setShowMatrix(false)}
        />
      )}

      {scanResult && !scanResult.found && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a1a2e", color: "#fff", padding: "14px 24px", borderRadius: 12, zIndex: 100, fontSize: 14, fontWeight: 600, boxShadow: "0 8px 32px #0006" }}>
          No product found for that barcode
        </div>
      )}

      <PageHeader
        title="Finished Goods"
        sub={`${products.length} SKUs`}
        actions={
          <>
            <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", marginRight: 4 }}>
              {([["list", "Products"], ["tags", "Barcode Tags"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  style={{
                    padding: "7px 14px", fontSize: 13, fontWeight: view === key ? 700 : 500,
                    border: "none", background: view === key ? "var(--primary)" : "transparent",
                    color: view === key ? "#fff" : "var(--muted)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {canManage && (
              <Button variant="secondary" onClick={() => setShowMatrix(true)}
                title="For stock already on the shelf when you started using this system. Anything bought since then arrives through a purchase order or a supplier invoice.">
                <Grid3x3 size={14} /> Opening Stock
              </Button>
            )}
            <Button variant="ghost" onClick={() => setShowScanner(true)}>
              <Camera size={14} /> Scan Barcode
            </Button>
            <Button variant="secondary" onClick={() => downloadCsv(
              `finished_goods_${new Date().toISOString().slice(0, 10)}.csv`,
              filtered.map(p => ({
                "SKU": p.sku, "Name": productName(p), "Item Type": p.itemType.name, "Age Group": p.ageGroup || "", "Size": p.size || "", "Color": p.clothColor?.name || "",
                "Source": p.source, "Quantity": p.quantity, "Sale Price (₹)": p.salePrice,
                "Cost Price (₹)": p.costPrice, "Warehouse": p.warehouse?.name || "",
                "Barcode": p.barcode, "Created": formatDateShort(p.createdAt),
              }))
            )}>
              <Download size={14} /> Export CSV
            </Button>
          </>
        }
      />

      {view === "tags" ? (
        <BarcodeGenerator products={products} systemSettings={systemSettings} onMutate={onMutate} />
      ) : (
      <>
      <FilterBar>
        <Input
          placeholder="Search SKU, item type, or barcode…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, width: "auto" }}
        />
        <Select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="">All sources</option>
          <option value="IN_HOUSE">In-house (Stitched)</option>
          <option value="IMPORTED">Imported (Readymade)</option>
        </Select>
      </FilterBar>

      {/* Detail / tag print panel */}
      {selected && (
        <Drawer
          title={selected.sku}
          subtitle={productName(selected)}
          width={460}
          zIndex={100}
          onClose={() => { setSelected(null); setEditing(false); }}
        >
            <div style={{ background: "var(--bg)", borderRadius: 10, padding: 16, marginBottom: 16, fontSize: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  ["Color", selected.clothColor?.name || "—"],
                  ["Age Group", selected.ageGroup || "—"],
                  ["Size", selected.size || "—"],
                  ["Source", selected.source === "IN_HOUSE" ? "Stitched" : "Imported"],
                  ["Quantity", `${selected.quantity} pcs`],
                  ["Cost Price", formatMoney(selected.costPrice)],
                  ["Sale Price / pc", formatMoney(selected.salePrice)],
                  ["Profit", formatMoney(selected.profitMargin)],
                  ["Warehouse", selected.warehouse.name],
                  ["Tags Printed", selected.tagsPrinted ? "Yes" : "No"],
                  ["Added", formatDateShort(selected.createdAt)],
                ].map(([k, v]) => (
                  <div key={k}><div style={{ fontSize: 11, color: "var(--muted)" }}>{k}</div><div style={{ fontWeight: 600 }}>{v}</div></div>
                ))}
              </div>
            </div>

            {canManage && !editing && (
              <Button variant="secondary" onClick={() => openEdit(selected)}
                style={{ width: "100%", marginBottom: 16 }}>
                <Pencil size={14} /> Edit Details
              </Button>
            )}

            {canManage && editing && (
              <div style={{ background: "var(--bg)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <Field
                  label="Product name"
                  hint={`What this one product is called. Leave it blank and it is called "${selected.itemType.name}", like every other ${selected.itemType.name}.`}
                >
                  <Input value={editForm.name} placeholder={selected.itemType.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {canReprice && (
                    <>
                      <Field label="Sale Price / pc" hint="What one piece sells for. This is the price printed on the tag.">
                        <Input type="number" min="0" step="0.01" value={editForm.salePrice}
                          onChange={e => setEditForm(f => ({ ...f, salePrice: e.target.value }))} />
                      </Field>
                      <Field label="Cost Price / pc">
                        <Input type="number" min="0" step="0.01" value={editForm.costPrice}
                          onChange={e => setEditForm(f => ({ ...f, costPrice: e.target.value }))} />
                      </Field>
                    </>
                  )}
                  <Field label="Size">
                    <Input value={editForm.size} placeholder="e.g. 40"
                      onChange={e => setEditForm(f => ({ ...f, size: e.target.value }))} />
                  </Field>
                  <Field label="Age Group">
                    <Input value={editForm.ageGroup} placeholder="e.g. ADULT"
                      onChange={e => setEditForm(f => ({ ...f, ageGroup: e.target.value }))} />
                  </Field>
                  <Field label="Minimum Stock" hint="Warn me below this. Blank or 0 means never warn about this product.">
                    <Input type="number" min="0" value={editForm.minStock} placeholder="—"
                      onChange={e => setEditForm(f => ({ ...f, minStock: e.target.value }))} />
                  </Field>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 12px" }}>
                  Quantity is not editable here — it comes from the stitching job or
                  batch these pieces were moved from. Use a stock adjustment to correct it.
                </div>
                {editErr && <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 10 }}>{editErr}</div>}
                <div style={{ display: "flex", gap: 10 }}>
                  <Button variant="primary" onClick={saveEdit} disabled={editSaving} style={{ flex: 1 }}>
                    {editSaving ? "Saving…" : "Save Changes"}
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            )}
            {selected.barcodeSvg && (
              <div style={{ background: "#fff", borderRadius: 8, padding: 12, marginBottom: 16 }}
                dangerouslySetInnerHTML={{ __html: selected.barcodeSvg }} />
            )}
            <div style={{ fontFamily: "monospace", fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>{selected.barcode}</div>
            <Button
              variant="primary"
              onClick={() => { printTag(selected, systemSettings || {}); markPrinted(selected.id); }}
              disabled={markingPrinted}
              style={{ width: "100%", padding: "11px", background: "var(--accent)", marginBottom: 8 }}
            >
              <Printer size={14} /> Print Tag
            </Button>
            <BluetoothPrintButton
              label="Bluetooth Print"
              size="md"
              getData={() => buildTagEscPos({
                sku: selected.sku,
                itemName: productName(selected),
                size: selected.size,
                ageGroup: selected.ageGroup || undefined,
                salePrice: selected.salePrice,
                barcode: selected.barcode,
                companyName: systemSettings?.tagBrandName || systemSettings?.companyName || "Sri Warehouse",
                tagline: systemSettings?.tagTagline || undefined,
                showBarcode: systemSettings?.tagShowBarcode !== false,
                showSku: systemSettings?.tagShowSku !== false,
                showColor: systemSettings?.tagShowColor !== false,
                showAgeGroup: systemSettings?.tagShowAgeGroup !== false,
                footerText: systemSettings?.tagFooterText || undefined,
                printerWidth: systemSettings?.tagPrinterWidth,
              })}
            />
        </Drawer>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {paged.map(p => (
          <div key={p.id} onClick={() => setSelected(p)} style={{
            background: "var(--paper)", border: "1px solid var(--border)", borderRadius: 12, padding: 16,
            cursor: "pointer", transition: "box-shadow 0.15s, transform 0.1s",
            borderLeft: p.source === "IN_HOUSE" ? "4px solid var(--primary)" : "4px solid var(--accent)",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = ""; (e.currentTarget as HTMLDivElement).style.transform = ""; }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{productName(p)}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{p.sku}</div>
              </div>
              <Badge
                label={p.source === "IN_HOUSE" ? "Stitched" : "Imported"}
                color={p.source === "IN_HOUSE" ? "var(--primary)" : "var(--accent)"}
                bg={p.source === "IN_HOUSE" ? "var(--primary)22" : "var(--accent)22"}
              />
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
              {[p.clothColor?.name, p.ageGroup, p.size].filter(Boolean).join(" · ") || "—"} · {p.warehouse.code}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>Sale Price</div>
                <div style={{ fontWeight: 700, color: "var(--accent)" }}>{formatMoney(p.salePrice)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>In Stock</div>
                <div style={{ fontWeight: 700 }}>{p.quantity} pcs</div>
              </div>
            </div>
            {!p.tagsPrinted && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#c07020", fontWeight: 600, background: "#fff3e0", borderRadius: 4, padding: "2px 7px" }}>Tag pending</div>
                <button type="button"
                  onClick={e => { e.stopPropagation(); printTag(p, systemSettings || {}); markPrinted(p.id); }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px solid #c07020", background: "transparent", color: "#c07020", fontWeight: 600, cursor: "pointer" }}>
                  Print Tag
                </button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 60, color: "var(--muted)" }}>No finished products found</div>
        )}
      </div>
      <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
      </>
      )}
    </div>
  );
}
