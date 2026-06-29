"use client";

import { useCallback, useEffect, useState } from "react";
import { graphql, refreshAccessToken, DASHBOARD_QUERY, SETTINGS_QUERY } from "@/app/lib/graphql";
import { applyBrandColors, applyDarkMode } from "@/app/lib/theme";
import { TAB_TITLES } from "@/app/lib/constants";
import {
  LayoutDashboard, Truck, UserCheck, ShoppingCart, Package, Boxes,
  Scissors, Shirt, Tag, Receipt, Landmark, RefreshCcw,
  Users, Warehouse, Bell, Settings2, ChevronLeft, ChevronRight,
  Sun, Moon, LogOut, BarChart2, Menu, X, User, ClipboardList,
} from "lucide-react";

import Login from "@/app/components/organisms/Login";
import Dashboard from "@/app/components/organisms/Dashboard";
import Suppliers from "@/app/components/organisms/Suppliers";
import Buyers from "@/app/components/organisms/Buyers";
import PurchaseOrders from "@/app/components/organisms/PurchaseOrders";
import Cutting from "@/app/components/organisms/Cutting";
import Stitching from "@/app/components/organisms/Stitching";
import FinishedProducts from "@/app/components/organisms/FinishedProducts";
import SalesOrders from "@/app/components/organisms/SalesOrders";
import Credit from "@/app/components/organisms/Credit";
import Returns from "@/app/components/organisms/Returns";
import Employees from "@/app/components/organisms/Employees";
import Warehouses from "@/app/components/organisms/Warehouses";
import Notifications from "@/app/components/organisms/Notifications";
import Analytics from "@/app/components/organisms/Analytics";
import Settings from "@/app/components/organisms/Settings";
import Profile from "@/app/components/organisms/Profile";
import AuditLogs from "@/app/components/organisms/AuditLogs";

import CreatableSelect from "@/app/components/atoms/CreatableSelect";
import Modal from "@/app/components/atoms/Modal";
import { PageSkeleton } from "@/app/components/atoms/Skeleton";
import FcmManager from "@/app/components/atoms/FcmManager";
import SizeSelect from "@/app/components/atoms/SizeSelect";
import type { AppSettings, Tab } from "@/app/types";

// ─── Role-based tab visibility ────────────────────────────────────────────────

const ALL_TABS: Tab[] = [
  "dashboard", "analytics", "suppliers", "buyers", "purchase_orders",
  "raw_cloth", "readymade_stock", "cutting", "stitching",
  "finished_products", "sales_orders", "credit", "returns",
  "employees", "warehouses", "notifications", "audit_log", "settings", "profile",
];

function getVisibleTabs(role: string): Tab[] {
  const profileTab: Tab[] = ["profile"];
  if (role === "SUPER_ADMIN") return [...ALL_TABS.filter(t => t !== "profile"), ...profileTab];
  if (["ADMIN"].includes(role)) return [...ALL_TABS.filter(t => t !== "profile" && t !== "settings"), ...profileTab];
  if (["MANAGER"].includes(role)) return [...ALL_TABS.filter(t => t !== "profile" && t !== "settings" && t !== "audit_log"), ...profileTab];
  if (role === "CUTTING_MASTER") return ["dashboard", "cutting", "notifications", ...profileTab];
  if (role === "TAILOR") return ["dashboard", "stitching", "notifications", ...profileTab];
  if (role === "STORE_KEEPER") return ["dashboard", "raw_cloth", "readymade_stock", "finished_products", "notifications", ...profileTab];
  if (role === "AUDITOR") return ["dashboard", "analytics", "suppliers", "buyers", "purchase_orders", "raw_cloth", "readymade_stock", "finished_products", "sales_orders", "credit", "returns", "notifications", "audit_log", ...profileTab];
  return ["dashboard", "notifications", ...profileTab];
}

// ─── Sidebar section structure ────────────────────────────────────────────────

interface SidebarSection { label: string; tabs: Tab[] }

const SIDEBAR_SECTIONS: SidebarSection[] = [
  { label: "Overview", tabs: ["dashboard", "analytics"] },
  { label: "Procurement", tabs: ["suppliers", "buyers", "purchase_orders"] },
  { label: "Inventory", tabs: ["raw_cloth", "readymade_stock"] },
  { label: "Production", tabs: ["cutting", "stitching", "finished_products"] },
  { label: "Sales", tabs: ["sales_orders", "credit", "returns"] },
  { label: "Admin", tabs: ["employees", "warehouses"] },
  { label: "System", tabs: ["notifications", "audit_log", "settings"] },
];

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  dashboard: <LayoutDashboard size={16} />,
  analytics: <BarChart2 size={16} />,
  suppliers: <Truck size={16} />,
  buyers: <UserCheck size={16} />,
  purchase_orders: <ShoppingCart size={16} />,
  raw_cloth: <Package size={16} />,
  readymade_stock: <Boxes size={16} />,
  cutting: <Scissors size={16} />,
  stitching: <Shirt size={16} />,
  finished_products: <Tag size={16} />,
  sales_orders: <Receipt size={16} />,
  credit: <Landmark size={16} />,
  returns: <RefreshCcw size={16} />,
  employees: <Users size={16} />,
  warehouses: <Warehouse size={16} />,
  notifications: <Bell size={16} />,
  audit_log: <ClipboardList size={16} />,
  settings: <Settings2 size={16} />,
  profile: <User size={16} />,
};

// ─── Direct stock entry modals (defined at module level to prevent focus loss)

interface DirectEntryProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  suppliers: any[]; warehouses: any[]; categories?: any[]; colors?: any[]; itemTypes?: any[]
  kind: "raw_cloth" | "readymade"
  onClose: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>
}

const fld: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontSize: 13 };
const inp2: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)", fontSize: 14, width: "100%", boxSizing: "border-box" };
const sel2: React.CSSProperties = { ...inp2 };

function DirectStockModal({ suppliers, warehouses, categories, colors, itemTypes, kind, onClose, onMutate }: DirectEntryProps) {
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [colorId, setColorId] = useState("");
  const [meters, setMeters] = useState("");
  const [costPerMeter, setCostPerMeter] = useState("");
  const [binLocation, setBinLocation] = useState("");
  const [itemTypeId, setItemTypeId] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Batch size mode: each row = { size, qty }
  const [batchMode, setBatchMode] = useState(false);
  const [sizeRows, setSizeRows] = useState<{ size: string; qty: string }[]>([{ size: "", qty: "" }]);

  function addRow() { setSizeRows(r => [...r, { size: "", qty: "" }]); }
  function removeRow(i: number) { setSizeRows(r => r.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, patch: { size?: string; qty?: string }) {
    setSizeRows(r => r.map((row, idx) => idx === i ? { ...row, ...patch } : row));
  }

  async function createCategory(name: string): Promise<string> {
    const r = await onMutate(`mutation C($n:String!){createClothCategory(name:$n,description:""){category{id}}}`, { n: name });
    return r.createClothCategory.category.id;
  }
  async function createColor(name: string): Promise<string> {
    const r = await onMutate(`mutation C($n:String!){createClothColor(name:$n,hexCode:"#CCCCCC"){color{id}}}`, { n: name });
    return r.createClothColor.color.id;
  }
  async function createItemType(name: string): Promise<string> {
    const r = await onMutate(`mutation C($n:String!){createItemType(name:$n,category:"OTHER",clothLengthPerPiece:1.0){itemType{id}}}`, { n: name });
    return r.createItemType.itemType.id;
  }

  const RMD_MUTATION = `mutation C($sup:ID!,$it:ID!,$wh:ID!,$q:Int!,$cp:Float,$col:ID,$sz:String,$rd:Date,$notes:String){
    createReadymadeStock(supplierId:$sup,itemTypeId:$it,warehouseId:$wh,quantity:$q,costPrice:$cp,colorId:$col,size:$sz,receivedDate:$rd,notes:$notes){stock{id}}
  }`;

  async function submit() {
    if (!supplierId || !warehouseId) { setError("Select supplier and warehouse"); return; }
    if (kind === "raw_cloth" && (!categoryId || !colorId || !meters)) { setError("Category, color and meters are required"); return; }
    if (kind === "readymade") {
      if (!itemTypeId) { setError("Item type is required"); return; }
      if (batchMode) {
        const bad = sizeRows.find(r => !r.qty || +r.qty <= 0);
        if (bad) { setError("All size rows need a valid quantity"); return; }
        if (sizeRows.length === 0) { setError("Add at least one size row"); return; }
      }
    }
    setLoading(true); setError("");
    try {
      if (kind === "raw_cloth") {
        await onMutate(
          `mutation C($sup:ID!,$cat:ID!,$col:ID!,$wh:ID!,$m:Float!,$cpm:Float,$bin:String,$rd:Date,$notes:String){
            createRawClothBatch(supplierId:$sup,categoryId:$cat,colorId:$col,warehouseId:$wh,totalMeters:$m,costPerMeter:$cpm,binLocation:$bin,receivedDate:$rd,notes:$notes){batch{id batchNumber}}
          }`,
          { sup: supplierId, cat: categoryId, col: colorId, wh: warehouseId, m: +meters,
            cpm: costPerMeter ? +costPerMeter : undefined, bin: binLocation || undefined,
            rd: receivedDate || undefined, notes: notes || undefined }
        );
      } else if (batchMode) {
        for (const row of sizeRows) {
          await onMutate(RMD_MUTATION, {
            sup: supplierId, it: itemTypeId, wh: warehouseId, q: +row.qty,
            cp: costPrice ? +costPrice : undefined, col: colorId || undefined,
            sz: row.size || undefined, rd: receivedDate || undefined, notes: notes || undefined,
          });
        }
      } else {
        const singleSize = sizeRows[0]?.size || "";
        const singleQty = sizeRows[0]?.qty || "";
        if (!singleQty) { setError("Quantity is required"); setLoading(false); return; }
        await onMutate(RMD_MUTATION, {
          sup: supplierId, it: itemTypeId, wh: warehouseId, q: +singleQty,
          cp: costPrice ? +costPrice : undefined, col: colorId || undefined,
          sz: singleSize || undefined, rd: receivedDate || undefined, notes: notes || undefined,
        });
      }
      onClose();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  const totalBatchQty = batchMode ? sizeRows.reduce((s, r) => s + (+r.qty || 0), 0) : 0;

  return (
    <Modal
      title={kind === "raw_cloth" ? "Add Raw Cloth Batch" : "Add Readymade Stock"}
      subtitle={kind === "raw_cloth" ? "Enter existing cloth stock into inventory" : "Enter readymade garment stock into inventory"}
      onClose={onClose}
      width={600}
      footer={
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={submit} disabled={loading}
            style={{ flex: 1, padding: "11px", borderRadius: 9, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
            {loading ? "Saving…" : batchMode && kind === "readymade" ? `Add ${sizeRows.length} Size Entr${sizeRows.length === 1 ? "y" : "ies"}` : "Add to Inventory"}
          </button>
          <button onClick={onClose}
            style={{ padding: "11px 22px", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--ink)", cursor: "pointer", fontSize: 14 }}>
            Cancel
          </button>
        </div>
      }
    >
      {error && <div style={{ background: "#fff0ef", border: "1px solid #f1cbc8", color: "#8d3e39", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <label style={fld}>Supplier *<select value={supplierId} onChange={e => setSupplierId(e.target.value)} style={sel2}>
          <option value="">Select…</option>
          {suppliers.filter((s: { active: boolean }) => s.active).map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        <label style={fld}>Warehouse *<select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} style={sel2}>
          <option value="">Select…</option>
          {warehouses.filter((w: { active: boolean }) => w.active).map((w: { id: string; name: string }) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select></label>

        {kind === "raw_cloth" ? (<>
          <CreatableSelect label="Category *" options={categories || []} value={categoryId}
            onChange={setCategoryId} onCreate={createCategory} placeholder="Select…" required />
          <CreatableSelect label="Color *" options={colors || []} value={colorId}
            onChange={setColorId} onCreate={createColor} placeholder="Select color…" required />
          <label style={fld}>Total Meters *<input type="number" value={meters} onChange={e => setMeters(e.target.value)} style={inp2} placeholder="0" /></label>
          <label style={fld}>Cost / Meter ₹<input type="number" value={costPerMeter} onChange={e => setCostPerMeter(e.target.value)} style={inp2} placeholder="0" /></label>
          <label style={fld}>Bin / Shelf<input value={binLocation} onChange={e => setBinLocation(e.target.value)} style={inp2} placeholder="e.g. A-12" /></label>
        </>) : (<>
          <CreatableSelect label="Item Type *" options={itemTypes || []} value={itemTypeId}
            onChange={setItemTypeId} onCreate={createItemType} placeholder="Select type…" required />
          <CreatableSelect label="Color" options={colors || []} value={colorId}
            onChange={setColorId} onCreate={createColor} placeholder="Any / None" />
          <label style={fld}>Cost / Piece ₹<input type="number" value={costPrice} onChange={e => setCostPrice(e.target.value)} style={inp2} placeholder="0" /></label>
        </>)}

        <label style={fld}>Received Date<input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} style={inp2} /></label>
        <div style={{ position: "relative", gridColumn: "1/-1" }}>
          <label style={{ ...fld }}>Notes
            <input value={notes} onChange={e => setNotes(e.target.value.slice(0, 200))} style={inp2} placeholder="Optional notes" maxLength={200} />
          </label>
          <span style={{ position: "absolute", right: 0, bottom: -16, fontSize: 10, color: notes.length > 170 ? "#e07" : "var(--muted)" }}>{notes.length}/200</span>
        </div>
      </div>

      {/* ── Size / quantity rows (readymade only) ── */}
      {kind === "readymade" && (
        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Size &amp; Quantity
              {batchMode && totalBatchQty > 0 && (
                <span style={{ marginLeft: 8, color: "var(--primary)", fontWeight: 800 }}>({totalBatchQty} pcs total)</span>
              )}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
              <span>Batch mode</span>
              <div onClick={() => { setBatchMode(b => !b); setSizeRows([{ size: "", qty: "" }]); }}
                style={{ width: 36, height: 20, borderRadius: 99, background: batchMode ? "var(--primary)" : "var(--line)", position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
                <div style={{ position: "absolute", top: 3, left: batchMode ? 18 : 3, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
              </div>
            </label>
          </div>

          {sizeRows.map((row, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 110px auto", gap: 10, marginBottom: 8 }}>
              <SizeSelect value={row.size} onChange={v => updateRow(i, { size: v })} label={i === 0 ? "Size" : ""} />
              <label style={fld}>{i === 0 ? "Qty (pcs) *" : ""}
                <input type="number" value={row.qty} onChange={e => updateRow(i, { qty: e.target.value })} style={inp2} placeholder="0" min="1" />
              </label>
              {batchMode && (
                <div style={{ display: "flex", alignItems: i === 0 ? "flex-end" : "center", paddingBottom: i === 0 ? 2 : 0 }}>
                  <button onClick={() => removeRow(i)} disabled={sizeRows.length === 1}
                    style={{ width: 32, height: 34, borderRadius: 7, border: "1px solid var(--line)", background: "var(--paper)", cursor: sizeRows.length === 1 ? "not-allowed" : "pointer", fontSize: 16, color: "#e55", opacity: sizeRows.length === 1 ? 0.3 : 1 }}>−</button>
                </div>
              )}
            </div>
          ))}

          {batchMode && (
            <button onClick={addRow}
              style={{ width: "100%", padding: "9px", borderRadius: 8, border: "1px dashed var(--primary)", background: "transparent", color: "var(--primary)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              + Add Another Size
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppData = Record<string, any>;

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [directEntry, setDirectEntry] = useState<"raw_cloth" | "readymade" | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [rawClothSearch, setRawClothSearch] = useState("");
  const [readymadeSearch, setReadymadeSearch] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => { applyDarkMode(darkMode); }, [darkMode]);
  useEffect(() => {
    if (data?.systemSettings) applyBrandColors(data.systemSettings);
  }, [data?.systemSettings]);

  useEffect(() => {
    // Load public settings for login branding (fire-and-forget)
    graphql<{ systemSettings: AppSettings }>(SETTINGS_QUERY).catch(() => {});

    const stored = localStorage.getItem("jwt");
    if (stored) {
      setToken(stored);
    } else if (localStorage.getItem("refreshToken")) {
      refreshAccessToken().then(t => {
        if (t) setToken(t); else setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const loadData = useCallback(async (jwt: string) => {
    setLoading(true); setError("");
    try {
      const result = await graphql<AppData>(DASHBOARD_QUERY, {}, jwt);
      const latestToken = localStorage.getItem("jwt");
      if (latestToken && latestToken !== jwt) setToken(latestToken);
      setData(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "SESSION_EXPIRED" || msg.toLowerCase().includes("not authenticated")) {
        localStorage.removeItem("jwt"); localStorage.removeItem("refreshToken");
        setToken(null);
      } else {
        setError(msg || "Failed to load");
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (token) loadData(token); }, [token, loadData]);

  // Silent background refresh every 60 s — keeps multi-user data fresh without a manual button
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => { loadData(token).catch(() => {}); }, 60_000);
    return () => clearInterval(id);
  }, [token, loadData]);

  // Mobile detection — collapse sidebar by default on small screens
  useEffect(() => {
    function check() {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // PWA service worker registration
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/firebase-messaging-sw.js").catch(() => {});
    }
  }, []);

  function handleLogin(jwt: string, rt: string) {
    localStorage.setItem("jwt", jwt); localStorage.setItem("refreshToken", rt);
    setTab("dashboard");
    setConfirmLogout(false);
    setToken(jwt);
  }
  function handleLogout() {
    window.dispatchEvent(new Event("fcm:logout"));
    localStorage.removeItem("jwt"); localStorage.removeItem("refreshToken");
    setConfirmLogout(false);
    setTab("dashboard");
    setToken(null); setData(null);
  }

  // Returns GraphQL response data AND triggers a full data reload.
  // Callers that need the response ID (e.g. inline category creation) can use it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutate = useCallback(async (query: string, variables: Record<string, unknown>): Promise<any> => {
    if (!token) throw new Error("Not authenticated");
    const result = await graphql(query, variables, token);
    await loadData(token);
    return result;
  }, [token, loadData]);

  if (!token) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg)" }}>
        <Login onLogin={handleLogin} />
      </div>
    );
  }

  if (!data && loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex" }}>
        <div style={{ width: 220, background: "var(--paper)", borderRight: "1px solid var(--line)", padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ height: 32, borderRadius: 8, background: "linear-gradient(90deg, var(--line) 25%, var(--canvas) 50%, var(--line) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
          ))}
        </div>
        <div style={{ flex: 1 }}><PageSkeleton /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 12 }}>
        <div style={{ color: "#f44336", fontSize: 15 }}>{error}</div>
        <button onClick={() => token && loadData(token)} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer" }}>Retry</button>
        <button onClick={handleLogout} style={{ fontSize: 13, color: "var(--muted)", border: "none", background: "none", cursor: "pointer" }}>Log out</button>
      </div>
    );
  }

  const profile = data?.employeeProfile;
  const role: string = profile?.role || "STORE_KEEPER";
  const isSuperAdmin = role === "SUPER_ADMIN";
  const isAdmin = role === "ADMIN";
  const isManager = role === "MANAGER";
  const isStoreKeeper = role === "STORE_KEEPER";
  const isCuttingMaster = role === "CUTTING_MASTER";
  const isTailor = role === "TAILOR";

  const visibleTabs = getVisibleTabs(role);
  const currentTab: Tab = visibleTabs.includes(tab) ? tab : visibleTabs[0];
  const canAddStock = isSuperAdmin || isAdmin || isManager || isStoreKeeper;

  const unreadCount = (data?.notifications || []).filter((n: { read: boolean }) => !n.read).length;
  const cuttingMasters = (data?.employees || []).filter((e: { role: string }) => e.role === "CUTTING_MASTER");
  const tailors = (data?.employees || []).filter((e: { role: string }) => e.role === "TAILOR");

  const SIDEBAR_W = sidebarOpen ? 232 : 56;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      <FcmManager isAuthenticated={!!token} />

      {/* Mobile sidebar backdrop */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          zIndex: 9, backdropFilter: "blur(2px)",
        }} />
      )}

      {/* ── Sidebar ── */}
      <aside style={{
        width: isMobile ? 240 : SIDEBAR_W,
        flexShrink: 0,
        position: "fixed", inset: "0 auto 0 0",
        background: "var(--primary)", color: "#fff", display: "flex", flexDirection: "column",
        transition: "transform 0.25s, width 0.2s", overflow: "hidden", zIndex: 10,
        transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "translateX(0)",
      }}>
        {/* Logo / app name */}
        <div style={{ padding: "16px 12px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #ffffff22", minHeight: 56 }}>
          {sidebarOpen && (
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.3, whiteSpace: "nowrap" }}>
                {data?.systemSettings?.appName || "GarmentERP"}
              </div>
              {data?.systemSettings?.companyName && (
                <div style={{ fontSize: 11, color: "#ffffff88", whiteSpace: "nowrap" }}>{data.systemSettings.companyName}</div>
              )}
            </div>
          )}
          <button onClick={() => setSidebarOpen(o => !o)}
            style={{ background: "none", border: "none", color: "#ffffffaa", cursor: "pointer", padding: 4,
              marginLeft: sidebarOpen ? 4 : "auto", marginRight: sidebarOpen ? 0 : "auto", flexShrink: 0,
              display: "flex", alignItems: "center" }}>
            {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        {/* Nav sections */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {SIDEBAR_SECTIONS.map(section => {
            const sectionTabs = section.tabs.filter(t => visibleTabs.includes(t));
            if (sectionTabs.length === 0) return null;
            return (
              <div key={section.label}>
                {sidebarOpen && (
                  <div style={{ padding: "12px 14px 4px", fontSize: 10, fontWeight: 700, color: "#ffffff55", textTransform: "uppercase", letterSpacing: 1, userSelect: "none" }}>
                    {section.label}
                  </div>
                )}
                {sectionTabs.map(t => (
                  <button key={t} onClick={() => { setTab(t); if (isMobile) setSidebarOpen(false); }} title={!sidebarOpen ? TAB_TITLES[t] : undefined} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: sidebarOpen ? "8px 14px 8px 18px" : "9px", justifyContent: sidebarOpen ? "flex-start" : "center",
                    background: currentTab === t ? "#ffffff22" : "none",
                    border: "none", color: "#fff", cursor: "pointer",
                    fontWeight: currentTab === t ? 700 : 400, fontSize: 13,
                    borderLeft: currentTab === t ? "3px solid #fff" : "3px solid transparent",
                    transition: "background 0.15s",
                  }}>
                    <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{TAB_ICONS[t]}</span>
                    {sidebarOpen && (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                        {TAB_TITLES[t]}
                        {t === "notifications" && unreadCount > 0 && (
                          <span style={{ background: "#f44336", color: "#fff", borderRadius: 99, fontSize: 10, padding: "1px 5px", fontWeight: 700 }}>{unreadCount}</span>
                        )}
                      </span>
                    )}
                  </button>
                ))}
                {sidebarOpen && <div style={{ margin: "6px 14px", borderBottom: "1px solid #ffffff18" }} />}
              </div>
            );
          })}
        </nav>

        {/* Bottom: user profile + controls */}
        <div style={{ padding: "12px", borderTop: "1px solid #ffffff22" }}>

          {/* Profile row — click to open profile page */}
          <button
            onClick={() => { setTab("profile"); if (isMobile) setSidebarOpen(false); }}
            title="My Profile"
            style={{
              width: "100%", display: "flex", alignItems: "center",
              gap: sidebarOpen ? 10 : 0, justifyContent: sidebarOpen ? "flex-start" : "center",
              marginBottom: 10, background: currentTab === "profile" ? "rgba(255,255,255,0.12)" : "transparent",
              border: "none", borderRadius: 9, padding: "6px 4px", cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            {/* Avatar */}
            <div style={{
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
              background: "rgba(255,255,255,0.18)", border: "2px solid rgba(255,255,255,0.28)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: 14, color: "#fff", userSelect: "none",
            }}>
              {(profile?.username || "?")[0].toUpperCase()}
            </div>
            {sidebarOpen && (
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {profile?.username || "User"}
                </div>
                <div style={{
                  display: "inline-block", marginTop: 3, fontSize: 9, fontWeight: 700,
                  letterSpacing: 0.6, padding: "2px 7px", borderRadius: 99,
                  background: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.9)",
                  textTransform: "uppercase", whiteSpace: "nowrap",
                }}>
                  {role.replace(/_/g, " ")}
                </div>
              </div>
            )}
          </button>

          {/* Controls row */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setDarkMode(d => !d)} title={darkMode ? "Light mode" : "Dark mode"}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#ffffffcc", borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center" }}>
              {darkMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            {sidebarOpen ? (
              <button onClick={() => setConfirmLogout(true)}
                style={{ flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", color: "#ffffffaa", borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <LogOut size={13} /> Log Out
              </button>
            ) : (
              <button onClick={() => setConfirmLogout(true)} title="Log out"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", color: "#ffffffaa", borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center" }}>
                <LogOut size={14} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ── Logout confirmation overlay ── */}
      {confirmLogout && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setConfirmLogout(false)}>
          <div style={{
            background: "var(--paper)", borderRadius: 20, padding: "36px 40px",
            width: "100%", maxWidth: 380, margin: "0 16px",
            boxShadow: "0 24px 80px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.12)",
            border: "1px solid var(--line)", textAlign: "center",
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              width: 60, height: 60, borderRadius: "50%",
              background: "#fef2f2", display: "flex", alignItems: "center",
              justifyContent: "center", margin: "0 auto 20px", color: "#ef4444",
            }}>
              <LogOut size={26} />
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: 19, fontWeight: 800, color: "var(--ink)" }}>Log out?</h3>
            <p style={{ margin: "0 0 28px", color: "var(--muted)", fontSize: 14, lineHeight: 1.55 }}>
              Are you sure you want to log out of GarmentFlow ERP?
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setConfirmLogout(false)} style={{
                flex: 1, padding: "13px", borderRadius: 11,
                border: "1.5px solid var(--line)", background: "transparent",
                color: "var(--ink)", fontWeight: 600, fontSize: 14, cursor: "pointer",
              }}>
                Cancel
              </button>
              <button onClick={handleLogout} style={{
                flex: 1, padding: "13px", borderRadius: 11, border: "none",
                background: "#ef4444", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
              }}>
                Yes, log out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main style={{ marginLeft: isMobile ? 0 : SIDEBAR_W, flex: 1, minWidth: 0, transition: "margin-left 0.2s" }}>
        {/* Topbar */}
        <div style={{
          position: "sticky", top: 0, zIndex: 5,
          background: "var(--paper)", borderBottom: "1px solid var(--border)",
          padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {/* Hamburger — mobile only */}
            {isMobile && (
              <button onClick={() => setSidebarOpen(o => !o)}
                style={{ background: "none", border: "1px solid var(--line)", borderRadius: 8,
                  padding: "6px 8px", cursor: "pointer", color: "var(--ink)", display: "flex",
                  alignItems: "center", flexShrink: 0 }}>
                {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            )}
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{TAB_TITLES[currentTab]}</h1>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {currentTab === "raw_cloth" && canAddStock && (
              <button onClick={() => setDirectEntry("raw_cloth")}
                style={{ padding: "7px 16px", borderRadius: 7, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                + Add Stock
              </button>
            )}
            {currentTab === "readymade_stock" && canAddStock && (
              <button onClick={() => setDirectEntry("readymade")}
                style={{ padding: "7px 16px", borderRadius: 7, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                + Add Stock
              </button>
            )}
          </div>
        </div>

        {/* Direct stock entry modal */}
        {directEntry && (
          <DirectStockModal
            kind={directEntry}
            suppliers={data?.suppliers || []}
            warehouses={data?.warehouseLocations || []}
            categories={data?.clothCategories || []}
            colors={data?.clothColors || []}
            itemTypes={data?.itemTypes || []}
            onClose={() => setDirectEntry(null)}
            onMutate={mutate}
          />
        )}

        {/* ── Tab content ── */}
        {currentTab === "analytics" && (
          <Analytics gql={(q) => graphql(q, {}, token!)} />
        )}
        {currentTab === "dashboard" && (
          <Dashboard stats={data?.dashboardStats} profile={data?.employeeProfile} rawBatches={data?.rawClothBatches || []} readymadeStock={data?.readymadeStock || []} />
        )}
        {currentTab === "suppliers" && (
          <Suppliers suppliers={data?.suppliers || []} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager} onMutate={mutate} />
        )}
        {currentTab === "buyers" && (
          <Buyers buyers={data?.buyers || []} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager} onMutate={mutate} />
        )}
        {currentTab === "purchase_orders" && (
          <PurchaseOrders
            orders={data?.purchaseOrders || []}
            suppliers={data?.suppliers || []}
            warehouses={data?.warehouseLocations || []}
            categories={data?.clothCategories || []}
            colors={data?.clothColors || []}
            itemTypes={data?.itemTypes || []}
            isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager}
            onMutate={mutate}
          />
        )}
        {currentTab === "raw_cloth" && (
          <div style={{ padding: 24 }}>
            <h2 style={{ margin: "0 0 16px" }}>Raw Cloth Batches <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 16 }}>({(data?.rawClothBatches || []).length})</span></h2>
            <input placeholder="Search batch, category, color or warehouse…" value={rawClothSearch} onChange={e => setRawClothSearch(e.target.value)}
              style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--ink)", fontSize: 14, width: "100%", boxSizing: "border-box", marginBottom: 16 }} />
            <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
                    {["Batch #", "Category", "Color", "Total m", "Available m", "Cost/m", "Bin", "Warehouse", "Received"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.rawClothBatches || []).filter((b: AppData) => {
                    const q = rawClothSearch.toLowerCase();
                    return !q || b.batchNumber?.toLowerCase().includes(q) || b.clothCategory?.name?.toLowerCase().includes(q) || b.clothColor?.name?.toLowerCase().includes(q) || b.warehouse?.name?.toLowerCase().includes(q);
                  }).map((b: AppData) => (
                    <tr key={b.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "11px 14px", fontWeight: 600 }}>{b.batchNumber}</td>
                      <td style={{ padding: "11px 14px" }}>{b.clothCategory?.name}</td>
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {b.clothColor?.hexCode && <span style={{ width: 12, height: 12, borderRadius: 3, background: b.clothColor.hexCode, display: "inline-block", flexShrink: 0 }} />}
                          {b.clothColor?.name}
                        </div>
                      </td>
                      <td style={{ padding: "11px 14px" }}>{b.totalMeters}m</td>
                      <td style={{ padding: "11px 14px", fontWeight: 700, color: b.availableMeters < 5 ? "#f44336" : "inherit" }}>{b.availableMeters}m</td>
                      <td style={{ padding: "11px 14px" }}>₹{b.costPerMeter}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: "var(--muted)" }}>{b.binLocation || "—"}</td>
                      <td style={{ padding: "11px 14px" }}>{b.warehouse?.name}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12 }}>{b.receivedDate ? new Date(b.receivedDate).toLocaleDateString("en-IN") : "—"}</td>
                    </tr>
                  ))}
                  {!(data?.rawClothBatches?.length) && (
                    <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                      No raw cloth batches. Click "+ Add Stock" above to add existing inventory.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {currentTab === "readymade_stock" && (
          <div style={{ padding: 24 }}>
            <h2 style={{ margin: "0 0 16px" }}>Readymade Stock <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 16 }}>({(data?.readymadeStock || []).length})</span></h2>
            <input placeholder="Search item type, color, size or warehouse…" value={readymadeSearch} onChange={e => setReadymadeSearch(e.target.value)}
              style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--ink)", fontSize: 14, width: "100%", boxSizing: "border-box", marginBottom: 16 }} />
            <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
                    {["Item Type", "Color", "Size", "Received", "Available", "Cost/pc", "Warehouse", "Date"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.readymadeStock || []).filter((s: AppData) => {
                    const q = readymadeSearch.toLowerCase();
                    return !q || s.itemType?.name?.toLowerCase().includes(q) || s.clothColor?.name?.toLowerCase().includes(q) || s.size?.toLowerCase().includes(q) || s.warehouse?.name?.toLowerCase().includes(q);
                  }).map((s: AppData) => (
                    <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "11px 14px", fontWeight: 600 }}>{s.itemType?.name}</td>
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {s.clothColor?.hexCode && <span style={{ width: 12, height: 12, borderRadius: 3, background: s.clothColor.hexCode, display: "inline-block", flexShrink: 0 }} />}
                          {s.clothColor?.name || "—"}
                        </div>
                      </td>
                      <td style={{ padding: "11px 14px" }}>{s.size || "—"}</td>
                      <td style={{ padding: "11px 14px" }}>{s.quantityReceived} pcs</td>
                      <td style={{ padding: "11px 14px", fontWeight: 700, color: s.quantityAvailable < 5 ? "#f44336" : "inherit" }}>{s.quantityAvailable} pcs</td>
                      <td style={{ padding: "11px 14px" }}>₹{s.costPrice}</td>
                      <td style={{ padding: "11px 14px" }}>{s.warehouse?.name}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12 }}>{s.receivedDate ? new Date(s.receivedDate).toLocaleDateString("en-IN") : "—"}</td>
                    </tr>
                  ))}
                  {!(data?.readymadeStock?.length) && (
                    <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                      No readymade stock. Click "+ Add Stock" above to add existing inventory.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {currentTab === "cutting" && (
          <Cutting
            assignments={data?.cuttingAssignments || []}
            batches={data?.rawClothBatches || []}
            cuttingMasters={cuttingMasters}
            itemTypes={data?.itemTypes || []}
            isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager} isCuttingMaster={isCuttingMaster}
            onMutate={mutate}
          />
        )}
        {currentTab === "stitching" && (
          <Stitching
            jobs={data?.stitchingJobs || []}
            assignments={data?.cuttingAssignments || []}
            tailors={tailors}
            isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager} isTailor={isTailor}
            onMutate={mutate}
          />
        )}
        {currentTab === "finished_products" && (
          <FinishedProducts
            products={data?.finishedProducts || []}
            isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager} isStoreKeeper={isStoreKeeper}
            onMutate={mutate}
            gql={(q, v) => graphql(q, v || {}, token!)}
          />
        )}
        {currentTab === "sales_orders" && (
          <SalesOrders
            orders={data?.salesOrders || []}
            buyers={data?.buyers || []}
            warehouses={data?.warehouseLocations || []}
            finishedProducts={data?.finishedProducts || []}
            isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager}
            onMutate={mutate}
          />
        )}
        {currentTab === "credit" && (
          <Credit credits={data?.creditTransactions || []} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager} onMutate={mutate} />
        )}
        {currentTab === "returns" && (
          <Returns buyerReturns={data?.buyerReturns || []} supplierReturns={data?.supplierReturns || []} />
        )}
        {currentTab === "employees" && (
          <Employees
            employees={data?.employees || []}
            warehouses={data?.warehouseLocations || []}
            isSuperAdmin={isSuperAdmin} isAdmin={isAdmin}
            currentUserId={profile?.id || ""}
            onMutate={mutate}
          />
        )}
        {currentTab === "warehouses" && (
          <Warehouses warehouses={data?.warehouseLocations || []} isSuperAdmin={isSuperAdmin} isAdmin={isAdmin} onMutate={mutate} />
        )}
        {currentTab === "notifications" && (
          <Notifications notifications={data?.notifications || []} onMutate={mutate} onNavigate={(t) => setTab(t as Tab)} />
        )}
        {currentTab === "audit_log" && (
          <AuditLogs logs={data?.allAuditLogs || []} />
        )}
        {currentTab === "settings" && (
          <Settings settings={data?.systemSettings || {}} isSuperAdmin={isSuperAdmin} onMutate={mutate} />
        )}
        {currentTab === "profile" && (
          <Profile
            profile={data?.employeeProfile || null}
            token={token!}
            onMutate={mutate}
            onProfileUpdated={() => loadData(token!)}
          />
        )}
      </main>
    </div>
  );
}
