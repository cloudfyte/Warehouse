"use client";
import { useState } from "react";
import type { CustomRole } from "@/app/types";
import Modal from "@/app/components/atoms/Modal";
import Button from "@/app/components/atoms/Button";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Badge from "@/app/components/atoms/Badge";
import Pagination from "@/app/components/atoms/Pagination";
import Field from "@/app/components/molecules/Field";
import FormGrid from "@/app/components/molecules/FormGrid";
import PageHeader from "@/app/components/molecules/PageHeader";
import { showToast } from "@/app/lib/toast";
import { friendlyError } from "@/app/lib/errors";

// All configurable tabs in display order
const ALL_TABS: { key: string; label: string; group: string }[] = [
  { key: "dashboard",        label: "Dashboard",         group: "Core" },
  { key: "analytics",        label: "Analytics",         group: "Core" },
  { key: "notifications",    label: "Notifications",     group: "Core" },
  { key: "suppliers",        label: "Suppliers",         group: "Procurement" },
  { key: "buyers",           label: "Buyers",            group: "Procurement" },
  { key: "purchase_orders",  label: "Purchase Orders",   group: "Procurement" },
  { key: "purchase_bills",   label: "Supplier Invoices", group: "Procurement" },
  { key: "quotations",       label: "Quotations",        group: "Procurement" },
  { key: "raw_cloth",        label: "Raw Cloth",         group: "Inventory" },
  { key: "readymade_stock",  label: "Readymade Stock",   group: "Inventory" },
  { key: "item_types",       label: "Item Types",        group: "Inventory" },
  { key: "reorder_points",   label: "Reorder Points",    group: "Inventory" },
  { key: "stock_transfers",  label: "Stock Transfers",   group: "Inventory" },
  { key: "stock_adjustments",label: "Stock Adjustments", group: "Inventory" },
  { key: "cutting",          label: "Cutting",           group: "Production" },
  { key: "stitching",        label: "Stitching",         group: "Production" },
  { key: "finished_products",label: "Finished Products", group: "Production" },
  { key: "sales_orders",     label: "Sales Orders",      group: "Sales & Finance" },
  { key: "credit",           label: "Credit",            group: "Sales & Finance" },
  { key: "returns",          label: "Returns",           group: "Sales & Finance" },
  { key: "expenses",         label: "Expenses",          group: "Sales & Finance" },
  { key: "reports",          label: "Reports",           group: "Sales & Finance" },
  { key: "ledger",           label: "Party Ledger",      group: "Sales & Finance" },
  { key: "employees",        label: "Employees",         group: "Admin" },
  { key: "warehouses",       label: "Warehouses",        group: "Admin" },
  { key: "audit_log",        label: "Audit Log",         group: "Admin" },
];

const BACKEND_LEVELS = [
  { value: "SUPER_ADMIN",   label: "Super Administrator" },
  { value: "ADMIN",         label: "Administrator" },
  { value: "MANAGER",       label: "Manager" },
  { value: "STORE_KEEPER",  label: "Store Keeper" },
  { value: "CUTTING_MASTER",label: "Cutting Master" },
  { value: "TAILOR",        label: "Tailor" },
  { value: "AUDITOR",       label: "Auditor" },
];

const PER_PAGE = 20;

const TAB_GROUPS = [...new Set(ALL_TABS.map(t => t.group))];

interface Props {
  roles: CustomRole[]
  isSuperAdmin: boolean
  gql: <T>(q: string, v?: Record<string, unknown>) => Promise<T>
  onRefresh: () => void
}

function RoleBadge({ role }: { role: CustomRole }) {
  return (
    <Badge label={role.displayName} color={role.color} bg={role.color + "22"} style={{ border: `1px solid ${role.color}44` }} />
  );
}

function emptyPermissions(): Record<string, boolean> {
  return Object.fromEntries(ALL_TABS.map(t => [t.key, false]));
}

export default function Roles({ roles, isSuperAdmin, gql, onRefresh }: Props) {
  const [selected, setSelected] = useState<CustomRole | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const paged = roles.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDelete, setShowDelete] = useState<CustomRole | null>(null);

  const [form, setForm] = useState({
    name: "", displayName: "", color: "#6366f1",
    backendLevel: "STORE_KEEPER",
    tabPermissions: emptyPermissions(),
  });

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Super Administrators only</div>
        <div style={{ fontSize: 14, marginTop: 4 }}>Only Super Admins can manage roles and permissions.</div>
      </div>
    );
  }

  function openCreate() {
    setForm({ name: "", displayName: "", color: "#6366f1", backendLevel: "STORE_KEEPER", tabPermissions: emptyPermissions() });
    setIsNew(true);
    setShowForm(true);
  }

  function openEdit(r: CustomRole) {
    const perms = emptyPermissions();
    if (r.tabPermissions) Object.assign(perms, r.tabPermissions);
    setForm({ name: r.name, displayName: r.displayName, color: r.color, backendLevel: r.backendLevel, tabPermissions: perms });
    setIsNew(false);
    setShowForm(true);
    setSelected(r);
  }

  function toggleAll(group: string, val: boolean) {
    const keys = ALL_TABS.filter(t => t.group === group).map(t => t.key);
    setForm(f => ({ ...f, tabPermissions: { ...f.tabPermissions, ...Object.fromEntries(keys.map(k => [k, val])) } }));
  }

  async function save() {
    if (!form.displayName.trim()) { showToast("Display name is required.", "error"); return; }
    if (isNew && !form.name.trim()) { showToast("Role key is required.", "error"); return; }
    setLoading(true);
    try {
      if (isNew) {
        await gql(`mutation C($name:String!,$dn:String!,$color:String,$bl:String,$tp:JSONString!){
          createCustomRole(name:$name,displayName:$dn,color:$color,backendLevel:$bl,tabPermissions:$tp){role{id}}
        }`, { name: form.name, dn: form.displayName, color: form.color, bl: form.backendLevel, tp: JSON.stringify(form.tabPermissions) });
        showToast("Role created.", "success");
      } else {
        await gql(`mutation U($id:ID!,$dn:String,$color:String,$bl:String,$tp:JSONString){
          updateCustomRole(id:$id,displayName:$dn,color:$color,backendLevel:$bl,tabPermissions:$tp){role{id}}
        }`, { id: selected!.id, dn: form.displayName, color: form.color, bl: form.backendLevel, tp: JSON.stringify(form.tabPermissions) });
        showToast("Role updated.", "success");
      }
      setShowForm(false);
      onRefresh();
    } catch (e) { showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  async function deleteRole() {
    if (!showDelete) return;
    setLoading(true);
    try {
      await gql(`mutation D($id:ID!){deleteCustomRole(id:$id){ok}}`, { id: showDelete.id });
      showToast("Role deleted.", "success");
      setShowDelete(null);
      onRefresh();
    } catch (e) { showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  const permCount = (r: CustomRole) => r.tabPermissions ? Object.values(r.tabPermissions).filter(Boolean).length : 0;

  return (
    <div style={{ padding: 28, maxWidth: 900 }}>
      <PageHeader
        title="Roles &amp; Permissions"
        sub="Create custom roles with fine-grained tab access. Assign them to employees."
        actions={<Button variant="primary" onClick={openCreate}>+ New Role</Button>}
        style={{ marginBottom: 24 }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {roles.length === 0 && (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
            No custom roles yet. Click "New Role" to create one.
          </div>
        )}
        {paged.map(r => (
          <div key={r.id} style={{
            background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12,
            padding: "16px 20px", display: "flex", alignItems: "center", gap: 16,
          }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{r.displayName}</span>
                <RoleBadge role={r} />
                {r.isSystem && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--line)", padding: "2px 7px", borderRadius: 99 }}>
                    SYSTEM
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, display: "flex", gap: 14 }}>
                <span>Backend: {BACKEND_LEVELS.find(b => b.value === r.backendLevel)?.label || r.backendLevel}</span>
                <span>{permCount(r)} of {ALL_TABS.length} tabs visible</span>
                <span style={{ fontFamily: "monospace" }}>{r.name}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={() => openEdit(r)}>Edit</Button>
              {!r.isSystem && (
                <Button variant="danger" size="sm" onClick={() => setShowDelete(r)}>Delete</Button>
              )}
            </div>
          </div>
        ))}
      <Pagination page={page} total={roles.length} perPage={PER_PAGE} onChange={setPage} />
      </div>

      {showForm && (
        <Modal
          title={isNew ? "Create Role" : `Edit — ${form.displayName}`}
          subtitle="Configure which tabs this role can access"
          onClose={() => setShowForm(false)}
          width={620}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={loading}>{loading ? "Saving…" : "Save Role"}</Button>
            </div>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <FormGrid>
              <Field label="Display Name" required>
                <Input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="e.g. Accounts Manager" />
              </Field>
              {isNew ? (
                <Field label="Role Key" required>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. ACCOUNTS_MANAGER" />
                </Field>
              ) : (
                <Field label="Role Key (fixed)">
                  <Input value={form.name} disabled style={{ opacity: 0.5 }} />
                </Field>
              )}
            </FormGrid>

            <FormGrid>
              <Field label="Badge Color">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    style={{ width: 44, height: 38, borderRadius: 8, border: "1px solid var(--line)", cursor: "pointer", padding: 2 }} />
                  <span style={{ fontFamily: "monospace", fontSize: 13, color: "var(--muted)" }}>{form.color.toUpperCase()}</span>
                </div>
              </Field>
              <Field label="Backend Permission Level">
                <Select value={form.backendLevel} onChange={e => setForm(f => ({ ...f, backendLevel: e.target.value }))}>
                  {BACKEND_LEVELS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </Select>
              </Field>
            </FormGrid>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 12 }}>
                Tab Permissions
              </div>
              {TAB_GROUPS.map(group => {
                const tabs = ALL_TABS.filter(t => t.group === group);
                const allOn = tabs.every(t => form.tabPermissions[t.key]);
                return (
                  <div key={group} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>{group}</span>
                      <Button variant="ghost" size="sm" style={{ border: "none", padding: "2px 8px", fontSize: 11, fontWeight: 600 }} onClick={() => toggleAll(group, !allOn)}>
                        {allOn ? "Deselect all" : "Select all"}
                      </Button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {tabs.map(t => {
                        const on = !!form.tabPermissions[t.key];
                        return (
                          <button type="button" key={t.key} onClick={() => setForm(f => ({ ...f, tabPermissions: { ...f.tabPermissions, [t.key]: !on } }))}
                            style={{
                              padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                              border: `1.5px solid ${on ? "var(--primary)" : "var(--line)"}`,
                              background: on ? "var(--primary)" : "transparent",
                              color: on ? "#fff" : "var(--muted)",
                              transition: "all 0.12s",
                            }}>
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      )}

      {showDelete && (
        <Modal title="Delete Role" onClose={() => setShowDelete(null)} width={400}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="secondary" onClick={() => setShowDelete(null)}>Cancel</Button>
              <Button variant="danger" onClick={deleteRole} disabled={loading}>
                {loading ? "Deleting…" : "Delete"}
              </Button>
            </div>
          }>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            Delete <strong style={{ color: "var(--ink)" }}>{showDelete.displayName}</strong>?
            Employees using this role will need to be reassigned. This cannot be undone.
          </p>
        </Modal>
      )}
    </div>
  );
}
