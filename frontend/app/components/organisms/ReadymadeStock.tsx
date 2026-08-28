"use client";
import { useState } from "react";
import { nameToColorHex } from "@/app/lib/colorUtils";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Modal from "@/app/components/atoms/Modal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StockItem = Record<string, any>;

interface Props {
  items: StockItem[];
  canAddStock: boolean;
  onMutate: (q: string, v: Record<string, unknown>) => Promise<unknown>;
}

export default function ReadymadeStock({ items, canAddStock, onMutate }: Props) {
  const [search, setSearch] = useState("");
  const [addToProducts, setAddToProducts] = useState<{ item: StockItem; salePrice: string; qty: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const q = search.toLowerCase();
  const filtered = items.filter(s =>
    !q ||
    s.itemType?.name?.toLowerCase().includes(q) ||
    s.clothCategory?.name?.toLowerCase().includes(q) ||
    s.clothColor?.name?.toLowerCase().includes(q) ||
    s.size?.toLowerCase().includes(q) ||
    s.warehouse?.name?.toLowerCase().includes(q)
  );

  async function addToProductsSubmit() {
    if (!addToProducts) return;
    const { item, salePrice, qty } = addToProducts;
    setAdding(true);
    try {
      await onMutate(
        `mutation A($rsId:ID!,$itId:ID!,$wId:ID!,$qty:Int!,$cp:Float!,$sp:Float!,$cat:ID,$col:ID,$sz:String){createFinishedProducts(readymadeStockId:$rsId,itemTypeId:$itId,warehouseId:$wId,quantity:$qty,costPrice:$cp,salePrice:$sp,clothCategoryId:$cat,clothColorId:$col,size:$sz){finishedProduct{id sku}}}`,
        {
          rsId: item.id, itId: item.itemType?.id, wId: item.warehouse?.id,
          qty: parseInt(qty), cp: parseFloat(item.costPrice), sp: parseFloat(salePrice),
          cat: item.clothCategory?.id || undefined,
          col: item.clothColor?.id || undefined,
          sz: item.size || undefined,
        }
      );
      setAddToProducts(null);
      showToast("Added to finished products.", "success");
    } catch (e: unknown) {
      showToast(friendlyError(e), "error");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: "0 0 16px" }}>
        Readymade Stock{" "}
        <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 16 }}>({items.length})</span>
      </h2>
      <input
        placeholder="Search item type, fabric, color, size or warehouse…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--ink)", fontSize: 14, width: "100%", boxSizing: "border-box", marginBottom: 16 }}
      />
      <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--border)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
              {["Item Type", "Fabric", "Color", "Size", "Received", "Available", "Cost/pc", "Warehouse", "Date", ""].map(h => (
                <th key={h} style={{ padding: "10px 14px", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "11px 14px", fontWeight: 600 }}>{s.itemType?.name}</td>
                <td style={{ padding: "11px 14px", fontSize: 12, color: "var(--muted)" }}>{s.clothCategory?.name || "—"}</td>
                <td style={{ padding: "11px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {s.clothColor && <span style={{ width: 12, height: 12, borderRadius: 3, background: nameToColorHex(s.clothColor.name, s.clothColor.hexCode), display: "inline-block", flexShrink: 0 }} />}
                    {s.clothColor?.name || "—"}
                  </div>
                </td>
                <td style={{ padding: "11px 14px" }}>{s.size || "—"}</td>
                <td style={{ padding: "11px 14px" }}>{s.quantityReceived} pcs</td>
                <td style={{ padding: "11px 14px", fontWeight: 700, color: s.quantityAvailable < 5 ? "#f44336" : "inherit" }}>{s.quantityAvailable} pcs</td>
                <td style={{ padding: "11px 14px" }}>₹{s.costPrice}</td>
                <td style={{ padding: "11px 14px" }}>{s.warehouse?.name}</td>
                <td style={{ padding: "11px 14px", fontSize: 12 }}>{s.receivedDate ? new Date(s.receivedDate).toLocaleDateString("en-IN") : "—"}</td>
                <td style={{ padding: "11px 14px" }}>
                  {canAddStock && s.quantityAvailable > 0 && (
                    <button type="button"
                      onClick={() => setAddToProducts({ item: s, salePrice: "", qty: String(s.quantityAvailable) })}
                      style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid var(--primary)", background: "transparent", color: "var(--primary)", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                      → Add to Products
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={10} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                  No readymade stock. Receive a Purchase Order or Purchase Bill to add readymade items.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {addToProducts && (
        <Modal
          title="Add to Finished Products"
          subtitle={[addToProducts.item.itemType?.name, addToProducts.item.clothColor?.name, addToProducts.item.size].filter(Boolean).join(" · ")}
          onClose={() => setAddToProducts(null)}
          width={420}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button"
                disabled={adding || !(parseFloat(addToProducts.salePrice) > 0) || !(parseInt(addToProducts.qty) > 0)}
                onClick={addToProductsSubmit}
                style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                {adding ? "Adding…" : "Add to Products"}
              </button>
              <button type="button" onClick={() => setAddToProducts(null)} style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--ink)", cursor: "pointer", fontSize: 14 }}>Cancel</button>
            </div>
          }>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "var(--canvas)", borderRadius: 9, padding: "10px 14px", fontSize: 13, color: "var(--muted)" }}>
              Cost price: <strong style={{ color: "var(--ink)" }}>₹{addToProducts.item.costPrice}</strong> · Available: <strong style={{ color: "var(--ink)" }}>{addToProducts.item.quantityAvailable} pcs</strong>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, textTransform: "uppercase" }}>
              Quantity to add *
              <input type="number" min="1" max={addToProducts.item.quantityAvailable} value={addToProducts.qty}
                onChange={e => setAddToProducts(p => p ? { ...p, qty: e.target.value } : p)}
                style={{ padding: "10px 13px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--input-bg)", color: "var(--ink)", fontSize: 14, outline: "none" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, textTransform: "uppercase" }}>
              Sale Price (₹) *
              <input type="number" min="0" step="0.01" placeholder="0.00" value={addToProducts.salePrice}
                onChange={e => setAddToProducts(p => p ? { ...p, salePrice: e.target.value } : p)}
                style={{ padding: "10px 13px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--input-bg)", color: "var(--ink)", fontSize: 14, outline: "none" }} autoFocus />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
