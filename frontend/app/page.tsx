"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToasts, showToast, type ToastItem } from "@/app/lib/toast";
import { graphql, refreshAccessToken, DASHBOARD_QUERY, SETTINGS_QUERY } from "@/app/lib/graphql";
import { nameToColorHex } from "@/app/lib/colorUtils";
import { friendlyError } from "@/app/lib/errors";
import { applyBrandColors, applyDarkMode } from "@/app/lib/theme";
import { TAB_TITLES } from "@/app/lib/constants";
import {
  LayoutDashboard, Truck, UserCheck, ShoppingCart, Package, Boxes,
  Scissors, Shirt, Tag, Receipt, Landmark, RefreshCcw,
  Users, Warehouse, Bell, Settings2, ChevronLeft, ChevronRight,
  Sun, Moon, LogOut, BarChart2, Menu, X, User, ClipboardList,
  ArrowLeftRight, AlertCircle, FileText, TrendingUp, BookOpen, List, ShieldCheck,
} from "lucide-react";

import Login from "@/app/components/organisms/Login";
import Dashboard from "@/app/components/organisms/Dashboard";
import Suppliers from "@/app/components/organisms/Suppliers";
import Buyers from "@/app/components/organisms/Buyers";
import PurchaseOrders from "@/app/components/organisms/PurchaseOrders";
import PurchaseBills from "@/app/components/organisms/PurchaseBills";
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
import Expenses from "@/app/components/organisms/Expenses";
import StockAdjustments from "@/app/components/organisms/StockAdjustments";
import StockTransfers from "@/app/components/organisms/StockTransfers";
import ReorderPoints from "@/app/components/organisms/ReorderPoints";
import Quotations from "@/app/components/organisms/Quotations";
import Reports from "@/app/components/organisms/Reports";
import Ledger from "@/app/components/organisms/Ledger";
import ItemTypes from "@/app/components/organisms/ItemTypes";
import QuickSearch from "@/app/components/organisms/QuickSearch";
import Roles from "@/app/components/organisms/Roles";

import CreatableSelect from "@/app/components/atoms/CreatableSelect";
import Modal from "@/app/components/atoms/Modal";
import { PageSkeleton } from "@/app/components/atoms/Skeleton";
import FcmManager from "@/app/components/atoms/FcmManager";
import SizeSelect from "@/app/components/atoms/SizeSelect";
import type { AppSettings, CustomRole, Tab } from "@/app/types";

// ─── Role-based tab visibility ────────────────────────────────────────────────

const ALL_TABS: Tab[] = [
  "dashboard", "analytics", "suppliers", "buyers", "purchase_orders", "purchase_bills",
  "raw_cloth", "readymade_stock", "cutting", "stitching",
  "finished_products", "sales_orders", "credit", "returns", "expenses",
  "stock_adjustments", "stock_transfers", "reorder_points",
  "quotations", "reports", "ledger",
  "item_types", "employees", "warehouses", "roles", "notifications", "audit_log", "settings", "profile",
];

function getVisibleTabs(role: string, customRole?: CustomRole | null): Tab[] {
  const profileTab: Tab[] = ["profile"];
  // Custom role: use tabPermissions from the database
  if (customRole?.tabPermissions) {
    const perms = customRole.tabPermissions;
    const allowed = ALL_TABS.filter(t => t !== "profile" && t !== "roles" && perms[t] === true) as Tab[];
    return [...allowed, ...profileTab];
  }
  if (role === "SUPER_ADMIN") return [...ALL_TABS.filter(t => t !== "profile"), ...profileTab];
  if (["ADMIN"].includes(role)) return [...ALL_TABS.filter(t => t !== "profile" && t !== "settings" && t !== "roles"), ...profileTab];
  if (["MANAGER"].includes(role)) return [...ALL_TABS.filter(t => t !== "profile" && t !== "settings" && t !== "audit_log" && t !== "roles"), ...profileTab];
  if (role === "CUTTING_MASTER") return ["dashboard", "cutting", "notifications", ...profileTab];
  if (role === "TAILOR") return ["dashboard", "stitching", "notifications", ...profileTab];
  if (role === "STORE_KEEPER") return ["dashboard", "purchase_bills", "raw_cloth", "readymade_stock", "finished_products", "stock_adjustments", "stock_transfers", "notifications", ...profileTab];
  if (role === "AUDITOR") return ["dashboard", "analytics", "suppliers", "buyers", "purchase_orders", "purchase_bills", "raw_cloth", "readymade_stock", "finished_products", "sales_orders", "credit", "returns", "notifications", "audit_log", ...profileTab];
  return ["dashboard", "notifications", ...profileTab];
}

// ─── Sidebar section structure ────────────────────────────────────────────────

interface SidebarSection { label: string; tabs: Tab[] }

const SIDEBAR_SECTIONS: SidebarSection[] = [
  { label: "Overview", tabs: ["dashboard", "analytics"] },
  { label: "Purchasing", tabs: ["suppliers", "purchase_orders", "purchase_bills"] },
  { label: "Inventory", tabs: ["raw_cloth", "readymade_stock", "stock_adjustments", "stock_transfers", "reorder_points"] },
  { label: "Production", tabs: ["cutting", "stitching", "finished_products"] },
  { label: "Sales", tabs: ["buyers", "quotations", "sales_orders", "credit", "returns"] },
  { label: "Finance", tabs: ["expenses", "reports", "ledger"] },
  { label: "Admin", tabs: ["item_types", "employees", "warehouses", "roles"] },
  { label: "System", tabs: ["notifications", "audit_log", "settings"] },
];

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  dashboard: <LayoutDashboard size={16} />,
  analytics: <BarChart2 size={16} />,
  suppliers: <Truck size={16} />,
  buyers: <UserCheck size={16} />,
  purchase_orders: <ShoppingCart size={16} />,
  purchase_bills: <ShoppingCart size={16} />,
  raw_cloth: <Package size={16} />,
  readymade_stock: <Boxes size={16} />,
  cutting: <Scissors size={16} />,
  stitching: <Shirt size={16} />,
  finished_products: <Tag size={16} />,
  sales_orders: <Receipt size={16} />,
  credit: <Landmark size={16} />,
  returns: <RefreshCcw size={16} />,
  expenses: <Receipt size={16} />,
  stock_adjustments: <Package size={16} />,
  stock_transfers: <ArrowLeftRight size={16} />,
  reorder_points: <AlertCircle size={16} />,
  quotations: <FileText size={16} />,
  reports: <TrendingUp size={16} />,
  ledger: <BookOpen size={16} />,
  item_types: <List size={16} />,
  employees: <Users size={16} />,
  warehouses: <Warehouse size={16} />,
  roles: <ShieldCheck size={16} />,
  notifications: <Bell size={16} />,
  audit_log: <ClipboardList size={16} />,
  settings: <Settings2 size={16} />,
  profile: <User size={16} />,
};


function ToastContainer() {
  const toasts = useToasts();
  const timerRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const COLORS: Record<ToastItem["level"], { bg: string; icon: string }> = {
    success: { bg: "#16a34a", icon: "✓" },
    error:   { bg: "#dc2626", icon: "✕" },
    warn:    { bg: "#d97706", icon: "⚠" },
    info:    { bg: "#2563eb", icon: "ℹ" },
  };
  if (!toasts.length) return null;
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 99999,
      display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
      {toasts.map(t => {
        const c = COLORS[t.level];
        return (
          <div key={t.id} style={{
            background: c.bg, color: "#fff", padding: "12px 18px 12px 14px",
            borderRadius: 10, fontSize: 13.5, fontWeight: 600,
            boxShadow: "0 4px 16px rgba(0,0,0,0.22)", maxWidth: 340,
            display: "flex", alignItems: "center", gap: 9,
            animation: "toastIn 0.22s cubic-bezier(.22,1,.36,1)",
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{c.icon}</span>
            <span style={{ lineHeight: 1.4 }}>{t.msg}</span>
          </div>
        );
      })}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppData = Record<string, any>;

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "dashboard";
    const h = window.location.hash.slice(1) as Tab;
    return ALL_TABS.includes(h) ? h : "dashboard";
  });
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [rawClothSearch, setRawClothSearch] = useState("");
  const [readymadeSearch, setReadymadeSearch] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [addToProducts, setAddToProducts] = useState<{ item: any; salePrice: string; qty: string } | null>(null);
  const [addingToProducts, setAddingToProducts] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { applyDarkMode(darkMode); }, [darkMode]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const notInput = document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA";
      if (e.key === "/" && !showSearch && notInput) { e.preventDefault(); setShowSearch(true); }
      if (e.key === "k" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setShowSearch(s => !s); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSearch]);
  useEffect(() => {
    if (data?.systemSettings) {
      applyBrandColors(data.systemSettings);
      if (data.systemSettings.appName) {
        document.title = data.systemSettings.appName;
      }
    }
  }, [data?.systemSettings]);

  useEffect(() => {
    // Load public settings for login branding (fire-and-forget)
    graphql<{ systemSettings: AppSettings }>(SETTINGS_QUERY).catch(() => {});

    const stored = localStorage.getItem("jwt");
    if (stored) {
      setToken(stored);
      setInitializing(false);
    } else if (localStorage.getItem("refreshToken")) {
      refreshAccessToken().then(t => {
        if (t) setToken(t); else setLoading(false);
        setInitializing(false);
      });
    } else {
      setLoading(false);
      setInitializing(false);
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
        setError(friendlyError(e));
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

  // Hash-based routing — sync tab ↔ URL hash
  const navigateTo = useCallback((t: Tab) => {
    setTab(t);
    window.location.hash = t;
  }, []);

  useEffect(() => {
    function onHashChange() {
      const h = window.location.hash.slice(1) as Tab;
      if (ALL_TABS.includes(h)) setTab(h);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function handleLogin(jwt: string, rt: string) {
    localStorage.setItem("jwt", jwt); localStorage.setItem("refreshToken", rt);
    setTab("dashboard");
    window.location.hash = "dashboard";
    setConfirmLogout(false);
    setToken(jwt);
  }
  function handleLogout() {
    window.dispatchEvent(new Event("fcm:logout"));
    localStorage.removeItem("jwt"); localStorage.removeItem("refreshToken");
    setConfirmLogout(false);
    setTab("dashboard");
    window.location.hash = "dashboard";
    setToken(null); setData(null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutate = useCallback(async (query: string, variables: Record<string, unknown>): Promise<any> => {
    if (!token) throw new Error("Not authenticated");
    setSaving(true);
    try {
      const result = await graphql(query, variables, token);
      await loadData(token);
      return result;
    } finally {
      setSaving(false);
    }
  }, [token, loadData]);

  const AppSkeleton = () => (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex" }}>
      <div style={{ width: 220, background: "var(--paper)", borderRight: "1px solid var(--line)", padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ height: 32, borderRadius: 8, background: "linear-gradient(90deg, var(--line) 25%, var(--canvas) 50%, var(--line) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
        ))}
      </div>
      <div style={{ flex: 1 }}><PageSkeleton /></div>
    </div>
  );

  if (initializing) return <AppSkeleton />;

  if (!token) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg)" }}>
        <Login onLogin={handleLogin} />
      </div>
    );
  }

  if (!data && loading) return <AppSkeleton />;

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

  const visibleTabs = getVisibleTabs(role, profile?.customRole);
  const currentTab: Tab = visibleTabs.includes(tab) ? tab : visibleTabs[0];
  const canAddStock = isSuperAdmin || isAdmin || isManager || isStoreKeeper;

  const unreadCount = (data?.notifications || []).filter((n: { read: boolean }) => !n.read).length;
  const cuttingMasters = (data?.employees || []).filter((e: { role: string }) => e.role === "CUTTING_MASTER");
  const tailors = (data?.employees || []).filter((e: { role: string }) => e.role === "TAILOR");

  const SIDEBAR_W = sidebarOpen ? 232 : 56;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      <ToastContainer />
      <FcmManager isAuthenticated={!!token} />

      {/* Global save progress bar — visible for every mutation + reload */}
      {saving && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 9999, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
          <div style={{ position: "absolute", height: "100%", background: "var(--accent)", animation: "topbarProgress 1.3s ease-in-out infinite" }} />
        </div>
      )}

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
                {data?.systemSettings?.appName || "Warehouse ERP"}
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
                  <a key={t} href={`#${t}`} onClick={() => { if (isMobile) setSidebarOpen(false); }} title={!sidebarOpen ? TAB_TITLES[t] : undefined} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: sidebarOpen ? "8px 14px 8px 18px" : "9px", justifyContent: sidebarOpen ? "flex-start" : "center",
                    background: currentTab === t ? "#ffffff22" : "none",
                    color: "#fff", cursor: "pointer", textDecoration: "none",
                    fontWeight: currentTab === t ? 700 : 400, fontSize: 13,
                    borderLeft: currentTab === t ? "3px solid #fff" : "3px solid transparent",
                    transition: "background 0.15s",
                  }}>
                    <span style={{ flexShrink: 0, display: "flex", alignItems: "center", position: "relative" }}>
                      {TAB_ICONS[t]}
                      {!sidebarOpen && t === "notifications" && unreadCount > 0 && (
                        <span aria-label={`${unreadCount} unread notifications`} style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: "50%", background: "#f44336", border: "1.5px solid var(--primary)" }} />
                      )}
                    </span>
                    {sidebarOpen && (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                        {TAB_TITLES[t]}
                        {t === "notifications" && unreadCount > 0 && (
                          <span role="status" aria-atomic="true" aria-label={`${unreadCount} unread notifications`} style={{ background: "#f44336", color: "#fff", borderRadius: 99, fontSize: 10, padding: "1px 5px", fontWeight: 700 }}>{unreadCount}</span>
                        )}
                        {t === "credit" && (() => { const n = (data?.creditTransactions ?? []).filter((c: {status:string}) => c.status === "OVERDUE").length; return n > 0 ? <span style={{ background: "#ef4444", color: "#fff", borderRadius: 99, fontSize: 10, padding: "1px 5px", fontWeight: 700 }}>{n}</span> : null; })()}
                        {t === "purchase_orders" && (() => { const n = (data?.purchaseOrders ?? []).filter((p: {status:string}) => p.status === "PLACED" || p.status === "DISPATCHED").length; return n > 0 ? <span style={{ background: "#f59e0b", color: "#fff", borderRadius: 99, fontSize: 10, padding: "1px 5px", fontWeight: 700 }}>{n}</span> : null; })()}
                      </span>
                    )}
                  </a>
                ))}
                {sidebarOpen && <div style={{ margin: "6px 14px", borderBottom: "1px solid #ffffff18" }} />}
              </div>
            );
          })}
        </nav>

        {/* Bottom: user profile + controls */}
        <div style={{ padding: "12px", borderTop: "1px solid #ffffff22" }}>

          {/* Profile row — click to open profile page */}
          <a
            href="#profile"
            onClick={() => { if (isMobile) setSidebarOpen(false); }}
            title="My Profile"
            style={{
              width: "100%", display: "flex", alignItems: "center",
              gap: sidebarOpen ? 10 : 0, justifyContent: sidebarOpen ? "flex-start" : "center",
              marginBottom: 10, background: currentTab === "profile" ? "rgba(255,255,255,0.12)" : "transparent",
              borderRadius: 9, padding: "6px 4px", cursor: "pointer", textDecoration: "none",
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
          </a>

          {/* Controls row — stacks vertically when collapsed so buttons fit in 56px */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexDirection: sidebarOpen ? "row" : "column" }}>
            <button onClick={() => setDarkMode(d => !d)} title={darkMode ? "Light mode" : "Dark mode"}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#ffffffcc", borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: sidebarOpen ? "auto" : 36 }}>
              {darkMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            {sidebarOpen ? (
              <button onClick={() => setConfirmLogout(true)}
                style={{ flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", color: "#ffffffaa", borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <LogOut size={13} /> Log Out
              </button>
            ) : (
              <button onClick={() => setConfirmLogout(true)} title="Log out"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", color: "#ffffffaa", borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: 36 }}>
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
              Are you sure you want to log out of {data?.systemSettings?.appName || "Warehouse ERP"}?
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
          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
            {token && (
              <button
                onClick={() => setShowSearch(true)}
                title="Quick Search (press /)"
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--muted)", cursor: "pointer", fontSize: 13 }}>
                🔍 <span style={{ fontSize: 12 }}>Search</span>
                <kbd style={{ fontSize: 9, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 3, padding: "1px 4px", marginLeft: 2 }}>/</kbd>
              </button>
            )}
          </div>
        </div>

        {/* ── Quick Search ── */}
        {showSearch && (
          <QuickSearch
            finishedProducts={data?.finishedProducts || []}
            suppliers={data?.suppliers || []}
            buyers={data?.buyers || []}
            rawBatches={data?.rawClothBatches || []}
            onNavigate={t => { navigateTo(t); setShowSearch(false); }}
            onClose={() => setShowSearch(false)}
          />
        )}

        {/* ── Tab content ── */}
        <div key={currentTab} className="tab-content">
        {currentTab === "analytics" && (
          <Analytics gql={(q) => graphql(q, {}, token!)} />
        )}
        {currentTab === "dashboard" && (
          <Dashboard stats={data?.dashboardStats} profile={data?.employeeProfile} rawBatches={data?.rawClothBatches || []} readymadeStock={data?.readymadeStock || []} role={role} cuttingAssignments={data?.cuttingAssignments || []} stitchingJobs={data?.stitchingJobs || []} onNavigate={t => navigateTo(t)} />
        )}
        {currentTab === "suppliers" && (
          <Suppliers suppliers={data?.suppliers || []} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager} purchaseBills={data?.purchaseBills || []} purchaseOrders={data?.purchaseOrders || []} supplierReturns={data?.supplierReturns || []} onMutate={mutate} />
        )}
        {currentTab === "buyers" && (
          <Buyers buyers={data?.buyers || []} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager} salesOrders={data?.salesOrders || []} creditTransactions={data?.creditTransactions || []} buyerReturns={data?.buyerReturns || []} onMutate={mutate} />
        )}
        {currentTab === "purchase_orders" && (
          <PurchaseOrders
            orders={data?.purchaseOrders || []}
            suppliers={data?.suppliers || []}
            warehouses={data?.warehouseLocations || []}
            categories={data?.clothCategories || []}
            colors={data?.clothColors || []}
            itemTypes={data?.itemTypes || []}
            purchaseBills={data?.purchaseBills || []}
            isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager}
            onNavigateToBills={() => navigateTo("purchase_bills")}
            onMutate={mutate}
          />
        )}
        {currentTab === "purchase_bills" && (
          <div style={{ padding: 24 }}>
            <PurchaseBills
              bills={data?.purchaseBills || []}
              suppliers={data?.suppliers || []}
              warehouses={data?.warehouseLocations || []}
              clothCategories={data?.clothCategories || []}
              clothColors={data?.clothColors || []}
              itemTypes={data?.itemTypes || []}
              isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager} isStoreKeeper={isStoreKeeper}
              systemSettings={data?.systemSettings}
              onMutate={mutate}
            />
          </div>
        )}
        {currentTab === "raw_cloth" && (
          <div style={{ padding: 24 }}>
            <h2 style={{ margin: "0 0 16px" }}>Raw Cloth Batches <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 16 }}>({(data?.rawClothBatches || []).length})</span></h2>
            <input placeholder="Search batch, category, color or warehouse…" value={rawClothSearch} onChange={e => setRawClothSearch(e.target.value)}
              style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--ink)", fontSize: 14, width: "100%", boxSizing: "border-box", marginBottom: 16 }} />
            <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--border)", overflowX: "auto" }}>
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
                          {b.clothColor && <span style={{ width: 12, height: 12, borderRadius: 3, background: nameToColorHex(b.clothColor.name, b.clothColor.hexCode), display: "inline-block", flexShrink: 0 }} />}
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
                      No raw cloth batches. Receive a Purchase Order or Purchase Bill to add cloth stock.
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
            <input placeholder="Search item type, fabric, color, size or warehouse…" value={readymadeSearch} onChange={e => setReadymadeSearch(e.target.value)}
              style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--ink)", fontSize: 14, width: "100%", boxSizing: "border-box", marginBottom: 16 }} />
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
                  {(data?.readymadeStock || []).filter((s: AppData) => {
                    const q = readymadeSearch.toLowerCase();
                    return !q || s.itemType?.name?.toLowerCase().includes(q) || s.clothCategory?.name?.toLowerCase().includes(q) || s.clothColor?.name?.toLowerCase().includes(q) || s.size?.toLowerCase().includes(q) || s.warehouse?.name?.toLowerCase().includes(q);
                  }).map((s: AppData) => (
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
                          <button onClick={() => setAddToProducts({ item: s, salePrice: "", qty: String(s.quantityAvailable) })}
                            style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid var(--primary)", background: "transparent", color: "var(--primary)", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                            → Add to Products
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!(data?.readymadeStock?.length) && (
                    <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                      No readymade stock. Receive a Purchase Order or Purchase Bill to add readymade items.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Convert readymade stock → Finished Product modal */}
            {addToProducts && (
              <Modal title="Add to Finished Products" subtitle={[addToProducts.item.itemType?.name, addToProducts.item.clothColor?.name, addToProducts.item.size].filter(Boolean).join(" · ")}
                onClose={() => setAddToProducts(null)} width={420}
                footer={<div style={{ display: "flex", gap: 10 }}>
                  <button disabled={addingToProducts || !(parseFloat(addToProducts.salePrice) > 0) || !(parseInt(addToProducts.qty) > 0)}
                    onClick={async () => {
                      setAddingToProducts(true);
                      try {
                        await mutate(
                          `mutation A($rsId:ID!,$itId:ID!,$wId:ID!,$qty:Int!,$cp:Float!,$sp:Float!,$cat:ID,$col:ID,$sz:String){createFinishedProducts(readymadeStockId:$rsId,itemTypeId:$itId,warehouseId:$wId,quantity:$qty,costPrice:$cp,salePrice:$sp,clothCategoryId:$cat,clothColorId:$col,size:$sz){finishedProduct{id sku}}}`,
                          { rsId: addToProducts.item.id, itId: addToProducts.item.itemType?.id, wId: addToProducts.item.warehouse?.id,
                            qty: parseInt(addToProducts.qty), cp: parseFloat(addToProducts.item.costPrice),
                            sp: parseFloat(addToProducts.salePrice),
                            cat: addToProducts.item.clothCategory?.id || undefined,
                            col: addToProducts.item.clothColor?.id || undefined,
                            sz: addToProducts.item.size || undefined }
                        );
                        setAddToProducts(null);
                        if (token) loadData(token);
                      } catch (e: unknown) { showToast(friendlyError(e), "error"); }
                      finally { setAddingToProducts(false); }
                    }}
                    style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                    {addingToProducts ? "Adding…" : "Add to Products"}
                  </button>
                  <button onClick={() => setAddToProducts(null)} style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--ink)", cursor: "pointer", fontSize: 14 }}>Cancel</button>
                </div>}>
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
            warehouses={data?.warehouseLocations || []}
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
            systemSettings={data?.systemSettings}
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
        {currentTab === "expenses" && (
          <Expenses
            expenses={data?.expenses || []}
            warehouses={data?.warehouseLocations || []}
            isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager}
            onMutate={mutate}
          />
        )}
        {currentTab === "stock_adjustments" && (
          <StockAdjustments
            adjustments={data?.stockAdjustments || []}
            rawClothBatches={data?.rawClothBatches || []}
            finishedProducts={data?.finishedProducts || []}
            warehouses={data?.warehouseLocations || []}
            isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager} isStoreKeeper={isStoreKeeper}
            onMutate={mutate}
          />
        )}
        {currentTab === "stock_transfers" && (
          <StockTransfers
            transfers={data?.stockTransfers || []}
            warehouses={data?.warehouseLocations || []}
            rawClothBatches={data?.rawClothBatches || []}
            finishedProducts={data?.finishedProducts || []}
            gql={(q, v) => graphql(q, v || {}, token!)}
            onRefresh={() => loadData(token!)}
          />
        )}
        {currentTab === "reorder_points" && (
          <ReorderPoints
            reorderPoints={data?.reorderPoints || []}
            warehouses={data?.warehouseLocations || []}
            categories={data?.clothCategories || []}
            colors={data?.clothColors || []}
            itemTypes={data?.itemTypes || []}
            isSuperAdmin={isSuperAdmin} isAdmin={isAdmin} isManager={isManager}
            gql={(q, v) => graphql(q, v || {}, token!)}
            onRefresh={() => loadData(token!)}
          />
        )}
        {currentTab === "quotations" && (
          <Quotations
            quotations={data?.quotations || []}
            buyers={data?.buyers || []}
            warehouses={data?.warehouseLocations || []}
            finishedProducts={data?.finishedProducts || []}
            systemSettings={data?.systemSettings}
            gql={(q, v) => graphql(q, v || {}, token!)}
            onRefresh={() => loadData(token!)}
          />
        )}
        {currentTab === "reports" && (
          <Reports gql={(q, v) => graphql(q, v || {}, token!)} />
        )}
        {currentTab === "ledger" && (
          <Ledger
            buyers={data?.buyers || []}
            suppliers={data?.suppliers || []}
            salesOrders={data?.salesOrders || []}
            creditTransactions={data?.creditTransactions || []}
            purchaseBills={data?.purchaseBills || []}
          />
        )}
        {currentTab === "item_types" && (
          <ItemTypes
            itemTypes={data?.itemTypes || []}
            isSuperAdmin={isSuperAdmin} isAdmin={isAdmin} isManager={isManager}
            gql={(q, v) => graphql(q, v || {}, token!)}
            onRefresh={() => loadData(token!)}
          />
        )}
        {currentTab === "employees" && (
          <Employees
            employees={data?.employees || []}
            warehouses={data?.warehouseLocations || []}
            customRoles={data?.customRoles || []}
            isSuperAdmin={isSuperAdmin} isAdmin={isAdmin}
            currentUserId={profile?.id || ""}
            onMutate={mutate}
          />
        )}
        {currentTab === "warehouses" && (
          <Warehouses warehouses={data?.warehouseLocations || []} isSuperAdmin={isSuperAdmin} isAdmin={isAdmin} onMutate={mutate} />
        )}
        {currentTab === "roles" && (
          <Roles
            roles={data?.customRoles || []}
            isSuperAdmin={isSuperAdmin}
            gql={(q, v) => graphql(q, v || {}, token!)}
            onRefresh={() => loadData(token!)}
          />
        )}
        {currentTab === "notifications" && (
          <Notifications notifications={data?.notifications || []} onMutate={mutate} onNavigate={(t) => navigateTo(t as Tab)} />
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
        </div>
      </main>
    </div>
  );
}
