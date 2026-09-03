"use client";
import { useState, useRef } from "react";

// Web Bluetooth API types (not in TS DOM lib by default)
type BluetoothDevice = { gatt?: { connect: () => Promise<BluetoothRemoteGATTServer>; connected: boolean }; addEventListener: (event: string, handler: () => void) => void };
type BluetoothRemoteGATTServer = { getPrimaryService: (uuid: string) => Promise<BluetoothRemoteGATTService> };
type BluetoothRemoteGATTService = { getCharacteristic: (uuid: string) => Promise<BluetoothRemoteGATTCharacteristic> };
type BluetoothRemoteGATTCharacteristic = { writeValueWithoutResponse: (v: BufferSource) => Promise<void> };

// Common BLE service/characteristic UUID pairs for 58mm/80mm thermal printers
const BT_PROFILES = [
  { service: "000018f0-0000-1000-8000-00805f9b34fb", char: "00002af1-0000-1000-8000-00805f9b34fb" },
  { service: "e7810a71-73ae-499d-8c15-faa9aef0c3f2", char: "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f" },
  { service: "49535343-fe7d-4ae5-8fa9-9fafd205e455", char: "49535343-8841-43f4-a8d4-ecbe34729bb3" },
];

export function useBluetooth() {
  const [btDevice, setBtDevice] = useState<BluetoothDevice | null>(null);
  const [btConnecting, setBtConnecting] = useState(false);
  const btCharRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  async function connectBluetooth(): Promise<BluetoothRemoteGATTCharacteristic | null> {
    try {
      setBtConnecting(true);
      const nav = navigator as any;
      if (!nav.bluetooth) {
        alert("Web Bluetooth not supported. Use Chrome on Android/desktop.");
        return null;
      }
      const device: BluetoothDevice = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BT_PROFILES.map(p => p.service),
      });
      device.addEventListener("gattserverdisconnected", () => {
        btCharRef.current = null;
      });
      const server = await device.gatt!.connect();
      setBtDevice(device);
      for (const profile of BT_PROFILES) {
        try {
          const service = await server.getPrimaryService(profile.service);
          const char = await service.getCharacteristic(profile.char);
          btCharRef.current = char;
          return char;
        } catch { /* try next profile */ }
      }
      alert("Printer connected but print service not found. Try pairing again.");
      return null;
    } catch (e: any) {
      if (e?.name !== "NotFoundError") alert("Bluetooth connection failed: " + (e?.message || ""));
      return null;
    } finally { setBtConnecting(false); }
  }

  async function reconnectBluetooth(device: BluetoothDevice): Promise<BluetoothRemoteGATTCharacteristic | null> {
    try {
      setBtConnecting(true);
      const server = await device.gatt!.connect();
      for (const profile of BT_PROFILES) {
        try {
          const service = await server.getPrimaryService(profile.service);
          const char = await service.getCharacteristic(profile.char);
          btCharRef.current = char;
          return char;
        } catch { /* try next profile */ }
      }
      return null;
    } catch { return null; }
    finally { setBtConnecting(false); }
  }

  async function btSend(data: Uint8Array): Promise<boolean> {
    let char = btCharRef.current;
    if (!char || !btDevice?.gatt?.connected) {
      char = btDevice ? await reconnectBluetooth(btDevice) : await connectBluetooth();
      if (!char) return false;
    }
    try {
      const chunkSize = 100;
      for (let i = 0; i < data.length; i += chunkSize) {
        await (char as any).writeValueWithoutResponse(data.slice(i, i + chunkSize));
        await new Promise(r => setTimeout(r, 30));
      }
      return true;
    } catch {
      alert("Bluetooth print failed. Try reconnecting.");
      btCharRef.current = null;
      setBtDevice(null);
      return false;
    }
  }

  const isConnected = !!btDevice?.gatt?.connected;

  return { btDevice, btConnecting, isConnected, connectBluetooth, btSend };
}

// ─── ESC/POS helpers ──────────────────────────────────────────────────────────

function encodeText(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code === 0x20B9) bytes.push(0x52, 0x73, 0x2E); // ₹ → Rs.
    else if (code < 256) bytes.push(code);
    else bytes.push(0x3F);
  }
  return bytes;
}

function padR(t: string, w: number) { return t.length >= w ? t.slice(0, w) : t + " ".repeat(w - t.length); }
function padL(t: string, w: number) { return t.length >= w ? t.slice(t.length - w) : " ".repeat(w - t.length) + t; }

function row(b: number[], left: string, right: string, W: number) {
  const spaces = Math.max(1, W - left.length - right.length);
  b.push(...encodeText(left + " ".repeat(spaces) + right + "\n"));
}

function divider(b: number[], W: number) {
  b.push(...encodeText("-".repeat(W) + "\n"));
}

function asciiBorder(b: number[], widths: number[]) {
  b.push(...encodeText("+" + widths.map(w => "-".repeat(w)).join("+") + "+\n"));
}

function asciiRow(b: number[], cells: string[], widths: number[], aligns: ("l" | "r")[]) {
  b.push(...encodeText("|" + cells.map((c, i) => aligns[i] === "r" ? padL(c, widths[i]) : padR(c, widths[i])).join("|") + "|\n"));
}

// ─── Purchase Bill ESC/POS ────────────────────────────────────────────────────

export interface BillEscData {
  billNumber: string
  supplierName: string
  billDate: string
  companyName: string
  gstin?: string
  items: { name: string; qty?: number; meters?: number; unitPrice: number; totalPrice: number; gstRate: number }[]
  taxableAmount: number
  taxAmount: number
  totalAmount: number
  amountPaid: number
  amountPending: number
  paymentStatus: string
}

export function buildBillEscPos(bill: BillEscData): Uint8Array {
  const b: number[] = [];
  const W = 32;
  const ITEM_W = [2, 12, 4, 6, 6];
  const TOTALS_W = [25, 5];

  // Init
  b.push(0x1B, 0x40);
  // Center align
  b.push(0x1B, 0x61, 0x01);
  // Bold + double height shop name
  b.push(0x1D, 0x21, 0x01, 0x1B, 0x45, 0x01);
  b.push(...encodeText(bill.companyName + "\n"));
  b.push(0x1B, 0x45, 0x00, 0x1D, 0x21, 0x00);

  if (bill.gstin) {
    b.push(0x1B, 0x45, 0x01);
    b.push(...encodeText("GSTIN: " + bill.gstin + "\n"));
    b.push(0x1B, 0x45, 0x00);
  }

  divider(b, W);
  b.push(0x1B, 0x45, 0x01);
  b.push(...encodeText("PURCHASE BILL\n"));
  b.push(0x1B, 0x45, 0x00);
  divider(b, W);

  // Left align — bill info
  b.push(0x1B, 0x61, 0x00);
  b.push(...encodeText("Bill: " + bill.billNumber + "\n"));
  b.push(...encodeText("Date: " + bill.billDate + "\n"));
  b.push(...encodeText("Supplier: " + bill.supplierName + "\n"));
  divider(b, W);

  // Items table
  asciiBorder(b, ITEM_W);
  asciiRow(b, ["#", "Item", "Qty", "Rate", "Total"], ITEM_W, ["l", "l", "r", "r", "r"]);
  asciiBorder(b, ITEM_W);
  bill.items.forEach((item, idx) => {
    const qty = item.qty != null ? String(item.qty) : (item.meters != null ? item.meters.toFixed(1) + "m" : "-");
    const name = item.name.length > ITEM_W[1] ? item.name.slice(0, ITEM_W[1] - 1) + "." : item.name;
    asciiRow(b, [String(idx + 1), name, qty, String(Math.round(item.unitPrice)), String(Math.round(item.totalPrice))], ITEM_W, ["l", "l", "r", "r", "r"]);
  });
  asciiBorder(b, ITEM_W);

  // Totals
  asciiBorder(b, TOTALS_W);
  asciiRow(b, ["Taxable", "Rs." + Math.round(bill.taxableAmount)], TOTALS_W, ["l", "r"]);
  if (bill.taxAmount > 0) {
    asciiBorder(b, TOTALS_W);
    asciiRow(b, ["GST", "Rs." + Math.round(bill.taxAmount)], TOTALS_W, ["l", "r"]);
  }
  asciiBorder(b, TOTALS_W);
  b.push(0x1B, 0x45, 0x01);
  asciiRow(b, ["TOTAL", "Rs." + Math.round(bill.totalAmount)], TOTALS_W, ["l", "r"]);
  b.push(0x1B, 0x45, 0x00);
  asciiBorder(b, TOTALS_W);

  divider(b, W);
  row(b, "Paid", "Rs." + Math.round(bill.amountPaid), W);
  if (bill.amountPending > 0) row(b, "Pending", "Rs." + Math.round(bill.amountPending), W);

  // Footer + cut
  b.push(0x1B, 0x61, 0x01);
  b.push(...encodeText("** Sri Warehouse **\n"));
  b.push(0x0A, 0x0A, 0x0A, 0x0A);
  b.push(0x1D, 0x56, 0x42, 0x00);

  return new Uint8Array(b);
}

// ─── Product Tag ESC/POS ──────────────────────────────────────────────────────

export interface TagEscData {
  sku: string
  itemName: string
  size: string
  ageGroup?: string
  salePrice: number
  barcode: string
  companyName: string
  tagline?: string
  showBarcode?: boolean
  showSku?: boolean
  showColor?: boolean
  showAgeGroup?: boolean
  footerText?: string
  printerWidth?: string
  /** The word before the price and what follows it, same as the paper tag. */
  priceLabel?: string | null
  priceSuffix?: string | null
}

export function buildTagEscPos(tag: TagEscData): Uint8Array {
  const b: number[] = [];
  const W = tag.printerWidth === "80mm" ? 48 : 32;

  b.push(0x1B, 0x40);
  b.push(0x1B, 0x61, 0x01); // center

  // Company / brand
  b.push(0x1B, 0x45, 0x01, 0x1D, 0x21, 0x01);
  b.push(...encodeText(tag.companyName + "\n"));
  b.push(0x1B, 0x45, 0x00, 0x1D, 0x21, 0x00);

  if (tag.tagline) b.push(...encodeText(tag.tagline + "\n"));

  divider(b, W);

  // Item name
  b.push(0x1B, 0x45, 0x01);
  const truncName = tag.itemName.length > W ? tag.itemName.slice(0, W - 1) + "." : tag.itemName;
  b.push(...encodeText(truncName + "\n"));
  b.push(0x1B, 0x45, 0x00);

  // Size / age group
  const agePart = tag.showAgeGroup !== false ? tag.ageGroup : null;
  const sizeLabel = [agePart, tag.size].filter(Boolean).join(" / ");
  if (sizeLabel) b.push(...encodeText(sizeLabel + "\n"));

  if (tag.showSku !== false) b.push(...encodeText("SKU: " + tag.sku + "\n"));

  divider(b, W);

  // Price — double height
  b.push(0x1D, 0x21, 0x01, 0x1B, 0x45, 0x01);
  // Absent falls back to the built-in word; blank and null both mean "no word".
  const priceWord = (tag.priceLabel === undefined ? "MRP" : (tag.priceLabel ?? "")).trim();
  const priceSuffix = (tag.priceSuffix ?? "").trim();
  b.push(...encodeText(
    (priceWord ? priceWord + " " : "") + "Rs." + Math.round(tag.salePrice) + priceSuffix + "\n"));
  b.push(0x1B, 0x45, 0x00, 0x1D, 0x21, 0x00);

  if (tag.showBarcode !== false) {
    // Set barcode text below, height 60 dots, module width 2
    b.push(0x1D, 0x48, 0x02); // GS H 2 — text below
    b.push(0x1D, 0x68, 0x3C); // GS h 60 — height 60 dots
    b.push(0x1D, 0x77, 0x02); // GS w 2 — module width
    // GS k format-1: type byte then data then NUL (no length byte)
    b.push(0x1D, 0x6B, 0x04); // CODE39
    b.push(...encodeText(tag.barcode));
    b.push(0x00); // NUL terminator
  }

  if (tag.footerText) {
    divider(b, W);
    b.push(...encodeText(tag.footerText + "\n"));
  }

  b.push(0x0A, 0x0A, 0x0A, 0x0A);
  b.push(0x1D, 0x56, 0x42, 0x00); // partial cut

  return new Uint8Array(b);
}
