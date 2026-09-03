"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToasts, showToast, type ToastItem } from "@/app/lib/toast";
import { graphql, refreshAccessToken, DASHBOARD_QUERY, SETTINGS_QUERY } from "@/app/lib/graphql";
import { friendlyError } from "@/app/lib/errors";
import ConnectionError from "@/app/components/organisms/ConnectionError";
import { applyBrandColors, applyDarkMode } from "@/app/lib/theme";
import { TAB_TITLES } from "@/app/lib/constants";
import {
  LayoutDashboard, Truck, UserCheck, ShoppingCart, Package, Boxes,
  Scissors, Shirt, Tag, Receipt, Landmark, RefreshCcw,
  Users, Warehouse, Bell, Settings2, ChevronLeft, ChevronRight,
  Sun, Moon, LogOut, BarChart2, Menu, X, User, ClipboardList,
  ArrowLeftRight, AlertCircle, FileText, TrendingUp, BookOpen, List, ShieldCheck,
  WifiOff, CalendarClock, Layers,
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
import Settlements from "@/app/components/organisms/Settlements";
import ProductSets from "@/app/components/organisms/ProductSets";
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
import RawCloth from "@/app/components/organisms/RawCloth";
import ReadymadeStock from "@/app/components/organisms/ReadymadeStock";
import ReorderPoints from "@/app/components/organisms/ReorderPoints";
import Quotations from "@/app/components/organisms/Quotations";
import Reports from "@/app/components/organisms/Reports";
import Ledger from "@/app/components/organisms/Ledger";
import ItemTypes from "@/app/components/organisms/ItemTypes";
import QuickSearch from "@/app/components/organisms/QuickSearch";
import Roles from "@/app/components/organisms/Roles";

import CreatableSelect from "@/app/components/atoms/CreatableSelect";
import { PageSkeleton } from "@/app/components/atoms/Skeleton";
import FcmManager from "@/app/components/atoms/FcmManager";
import SizeSelect from "@/app/components/atoms/SizeSelect";
import type { AppSettings, CustomRole, Tab } from "@/app/types";
import { setCurrencySymbol } from "@/app/lib/formatters";

// ─── Role-based tab visibility ────────────────────────────────────────────────

const ALL_TABS: Tab[] = [
  "dashboard", "analytics", "suppliers", "buyers", "purchase_orders", "purchase_bills",
  "raw_cloth", "readymade_stock", "cutting", "stitching",
  "finished_products", "product_sets", "sales_orders", "credit", "returns", "expenses", "settlements",
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
  { label: "Production", tabs: ["cutting", "stitching", "finished_products", "product_sets"] },
  { label: "Sales", tabs: ["buyers", "quotations", "sales_orders", "credit", "returns"] },
  { label: "Finance", tabs: ["expenses", "settlements", "reports", "ledger"] },
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
  settlements: <CalendarClock size={16} />,
  product_sets: <Layers size={16} />,
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
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // Set during render, not in an effect: formatMoney is read while the tree
  // renders, so an effect would land a paint too late and leave the previous
  // symbol on screen until something unrelated re-rendered.
  setCurrencySymbol(data?.systemSettings?.currencySymbol);

  useEffect(() => {
    if (data?.systemSettings) {
      applyBrandColors(data.systemSettings);
      if (data.systemSettings.appName) {
        document.title = data.systemSettings.appName;
      }
    }
  }, [data?.systemSettings]);

  useEffect(() => {
    // Branding for the login screen. This used to query systemSettings, which is
    // @login_required, so it always failed here — and the result was discarded
    // anyway, so the colours never applied before sign-in either.
    graphql<{ publicSettings: AppSettings }>(SETTINGS_QUERY)
      .then(d => { if (d?.publicSettings) applyBrandColors(d.publicSettings); })
      .catch(() => {});

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
    setLoading(true);
    try {
      const result = await graphql<AppData>(DASHBOARD_QUERY, {}, jwt);
      const latestToken = localStorage.getItem("jwt");
      if (latestToken && latestToken !== jwt) setToken(latestToken);
      setData(result);
      // Cleared on success, not on attempt — clearing up front made the
      // offline banner blink out and back every time the 60 s poll retried.
      setError("");
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

  // Mobile detection — collapse sidebar on mobile, restore on desktop
  useEffect(() => {
    function check() {
      const mobile = window.innerWidth < 768;
      setIsMobile(prev => {
        if (prev !== mobile) setSidebarOpen(!mobile);
        return mobile;
      });
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
  // A fresh arrow here would be a new identity every render, and page.tsx
  // re-renders on a 60s interval and on every mutation. Analytics puts this in
  // a useEffect dep array, so an unstable identity refetched its whole query
  // and blanked all six charts each time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runQuery = useCallback((q: string, v?: Record<string, unknown>): Promise<any> => {
    if (!token) throw new Error("Not authenticated");
    return graphql(q, v || {}, token);
  }, [token]);

  const mutate = useCallback(async (query: string, variables: Record<string, unknown>): Promise<any> => {
    if (!token) throw new Error("Not authenticated");
    setSaving(true);
    try {
      const result = await graphql(query, variables, token);
      // Debounce dashboard refresh so rapid mutations don't queue concurrent reloads
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => { loadData(token); }, 800);
      return result;
    } finally {
      setSaving(false);
    }
  }, [token, loadData]);

  const AppSkeleton = () => (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex" }}>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: "var(--bg)" }}>
        <Login onLogin={handleLogin} />
      </div>
    );
  }

  if (!data && loading) return <AppSkeleton />;

  // Only take over the screen when there is nothing to take over. A failed
  // background refresh used to hit this branch too, so one dropped poll — a
  // deploy restarting the containers, a moment of bad wifi — threw away a
  // screen the user was working on. With data in hand it is a banner instead,
  // and the app stays usable on what it already loaded.
  if (error && !data) {
    return (
      <ConnectionError
        message={error}
        retrying={loading}
        onRetry={() => token && loadData(token)}
        onLogout={handleLogout}
      />
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
    <div style={{ display: "flex", minHeight: "100dvh", background: "var(--bg)" }}>
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
        <div style={{ padding: sidebarOpen ? "16px 12px 12px" : "12px 0 10px", display: "flex", flexDirection: sidebarOpen ? "row" : "column", alignItems: "center", justifyContent: sidebarOpen ? "space-between" : "center", gap: sidebarOpen ? 0 : 6, borderBottom: "1px solid #ffffff22", minHeight: 56 }}>
          {sidebarOpen ? (
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.3, whiteSpace: "nowrap" }}>
                {data?.systemSettings?.appName || "Warehouse ERP"}
              </div>
              {data?.systemSettings?.companyName && (
                <div style={{ fontSize: 11, color: "#ffffff88", whiteSpace: "nowrap" }}>{data.systemSettings.companyName}</div>
              )}
            </div>
          ) : (
            <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: "#fff", flexShrink: 0, userSelect: "none" }}>
              {(data?.systemSettings?.appName || "W")[0].toUpperCase()}
            </div>
          )}
          <button type="button" onClick={() => setSidebarOpen(o => !o)}
            style={{ background: "none", border: "none", color: "#ffffffaa", cursor: "pointer", padding: 4,
              marginLeft: sidebarOpen ? 4 : 0, flexShrink: 0,
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
            <button type="button" onClick={() => setDarkMode(d => !d)} title={darkMode ? "Light mode" : "Dark mode"}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#ffffffcc", borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: sidebarOpen ? "auto" : 36 }}>
              {darkMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            {sidebarOpen ? (
              <button type="button" onClick={() => setConfirmLogout(true)}
                style={{ flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", color: "#ffffffaa", borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <LogOut size={13} /> Log Out
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmLogout(true)} title="Log out"
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
              <button type="button" onClick={() => setConfirmLogout(false)} style={{
                flex: 1, padding: "13px", borderRadius: 11,
                border: "1.5px solid var(--line)", background: "transparent",
                color: "var(--ink)", fontWeight: 600, fontSize: 14, cursor: "pointer",
              }}>
                Cancel
              </button>
              <button type="button" onClick={handleLogout} style={{
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
        {/* A refresh failed but we still have data — say so without throwing
            the screen away. It clears itself as soon as a poll succeeds. */}
        {error && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            padding: "9px 16px", background: "#fff8e6", borderBottom: "1px solid #f5d78e",
            color: "#8a5a00", fontSize: 12.5,
          }}>
            <WifiOff size={15} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 180 }}>
              {error} Showing the last data loaded.
            </span>
            <button
              type="button"
              onClick={() => token && loadData(token)}
              disabled={loading}
              style={{
                border: "1px solid #e0b355", background: "#fff", color: "#8a5a00",
                borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 600,
                cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Retrying…" : "Retry"}
            </button>
          </div>
        )}
        {/* Topbar */}
        <div style={{
          position: "sticky", top: 0, zIndex: 5,
          background: "var(--paper)", borderBottom: "1px solid var(--border)",
          padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {/* Hamburger — mobile only */}
            {isMobile && (
              <button type="button" onClick={() => setSidebarOpen(o => !o)}
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
              <button type="button"
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
        <div className="tab-content">
        {currentTab === "analytics" && (
          <Analytics gql={runQuery} />
        )}
        {currentTab === "dashboard" && (
          <Dashboard stats={data?.dashboardStats} profile={data?.employeeProfile} rawBatches={data?.rawClothBatches || []} readymadeStock={data?.readymadeStock || []} reorderPoints={data?.reorderPoints || []} role={role} cuttingAssignments={data?.cuttingAssignments || []} stitchingJobs={data?.stitchingJobs || []} onNavigate={t => navigateTo(t)} />
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
          <RawCloth batches={data?.rawClothBatches || []} />
        )}
        {currentTab === "readymade_stock" && (
          <ReadymadeStock
            items={data?.readymadeStock || []}
            canAddStock={canAddStock}
            onMutate={mutate}
          />
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
            itemTypes={data?.itemTypes || []}
            colors={data?.clothColors || []}
            warehouses={data?.warehouseLocations || []}
            reorderPoints={data?.reorderPoints || []}
            isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager} isStoreKeeper={isStoreKeeper}
            onMutate={mutate}
            onRefresh={() => token && loadData(token)}
            gql={runQuery}
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
          <Returns
            buyerReturns={data?.buyerReturns || []}
            supplierReturns={data?.supplierReturns || []}
            buyers={data?.buyers || []}
            suppliers={data?.suppliers || []}
            finishedProducts={data?.finishedProducts || []}
            rawClothBatches={data?.rawClothBatches || []}
            readymadeStock={data?.readymadeStock || []}
            warehouses={data?.warehouseLocations || []}
            isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isManager={isManager}
            onMutate={mutate}
          />
        )}
        {currentTab === "product_sets" && (
          <ProductSets
            sets={data?.productSets || []}
            products={data?.finishedProducts || []}
            itemTypes={data?.itemTypes || []}
            warehouses={data?.warehouseLocations || []}
            canManage={isSuperAdmin || isAdmin || isManager || isStoreKeeper}
            onMutate={mutate}
            onRefresh={() => token && loadData(token)}
          />
        )}
        {currentTab === "settlements" && (
          <Settlements
            settlements={data?.settlements || []}
            recurring={data?.recurringSettlements || []}
            warehouses={data?.warehouseLocations || []}
            canManage={isSuperAdmin || isAdmin || isManager}
            onMutate={mutate}
            onRefresh={() => token && loadData(token)}
          />
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
            gql={runQuery}
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
            gql={runQuery}
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
            gql={runQuery}
            onRefresh={() => loadData(token!)}
          />
        )}
        {currentTab === "reports" && (
          <Reports gql={runQuery} />
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
            gql={runQuery}
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
            gql={runQuery}
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
