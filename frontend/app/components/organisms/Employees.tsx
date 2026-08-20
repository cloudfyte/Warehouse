"use client";
import { useState, useEffect } from "react";
import type { CustomRole, Employee, WarehouseLocation } from "@/app/types";
import { ROLE_LABELS } from "@/app/lib/constants";
import Modal from "@/app/components/atoms/Modal";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import Button from "@/app/components/atoms/Button";
import Field from "@/app/components/molecules/Field";
import FormGrid from "@/app/components/molecules/FormGrid";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import PageHeader from "@/app/components/molecules/PageHeader";
import FilterBar from "@/app/components/molecules/FilterBar";
import Pagination from "@/app/components/atoms/Pagination";

interface Props {
  employees: Employee[]; warehouses: WarehouseLocation[]
  customRoles?: CustomRole[]
  isSuperAdmin: boolean; isAdmin: boolean; currentUserId: string
  onMutate: (q: string, v: Record<string, unknown>) => Promise<void>
}

const PER_PAGE = 20;

const ROLES = Object.keys(ROLE_LABELS);
const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "#b91c1c", ADMIN: "#15803d", MANAGER: "#1d4ed8",
  STORE_KEEPER: "#7c3aed", CUTTING_MASTER: "#c2410c", TAILOR: "#0e7490", AUDITOR: "#475569",
};

function RoleBadge({ role, customRole }: { role: string; customRole?: CustomRole | null }) {
  if (customRole) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: customRole.color + "22", color: customRole.color, border: `1px solid ${customRole.color}44` }}>
          {customRole.displayName}
        </span>
        <span style={{ fontSize: 10, color: "var(--muted)", paddingLeft: 4 }}>via custom role</span>
      </div>
    );
  }
  const color = ROLE_COLORS[role] || "#555";
  return (
    <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: color + "18", color, border: `1px solid ${color}33` }}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

export default function Employees({ employees, warehouses, customRoles = [], isSuperAdmin, isAdmin, currentUserId, onMutate }: Props) {
  const [editing, setEditing] = useState<Partial<Employee> | null>(null);
  const [editingCustomRoleId, setEditingCustomRoleId] = useState<string>("");
  const [isNew, setIsNew] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [showResetFor, setShowResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState(""); const [resetPw2, setResetPw2] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search]);

  const canEdit = isSuperAdmin || isAdmin;
  const filtered = employees.filter(e =>
    e.username.toLowerCase().includes(search.toLowerCase()) ||
    e.role.toLowerCase().includes(search.toLowerCase())
  );
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const canEditEmployee = (e: Employee) => {
    if (!canEdit) return false;
    if ((e.role === "SUPER_ADMIN" || e.role === "ADMIN") && !isSuperAdmin) return false;
    return true;
  };

  async function save() {
    if (!editing) return;
    setLoading(true); setError("");
    try {
      const customRoleId = editingCustomRoleId || undefined;
      if (isNew) {
        await onMutate(
          `mutation C($u:String!,$p:String!,$r:String!,$wids:[ID!]!,$email:String,$phone:String,$crid:ID){createEmployee(username:$u,password:$p,role:$r,warehouseIds:$wids,email:$email,phone:$phone,customRoleId:$crid){employee{id}}}`,
          { u: editing.username, p: newPass, r: editing.role, wids: editing.locations?.map(l => l.id) || [], email: editing.email, phone: editing.phone, crid: customRoleId }
        );
      } else {
        await onMutate(
          `mutation U($id:ID!,$r:String,$phone:String,$email:String,$active:Boolean,$wids:[ID!],$crid:ID){updateEmployee(id:$id,role:$r,phone:$phone,email:$email,active:$active,warehouseIds:$wids,customRoleId:$crid){employee{id}}}`,
          { id: editing.id, r: editing.role, phone: editing.phone, email: editing.email, active: editing.active, wids: editing.locations?.map(l => l.id), crid: customRoleId }
        );
      }
      setEditing(null); setNewPass(""); setEditingCustomRoleId("");
      showToast(isNew ? "Employee created." : "Employee updated.", "success");
    } catch (e: unknown) { setError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  async function resetPassword() {
    if (!showResetFor || resetPw !== resetPw2) { setError("Passwords do not match"); return; }
    if (resetPw.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true); setError("");
    try {
      await onMutate(`mutation R($id:ID!,$pw:String!){resetEmployeePassword(id:$id,newPassword:$pw){ok}}`, { id: showResetFor, pw: resetPw });
      setShowResetFor(null); setResetPw(""); setResetPw2("");
      showToast("Password reset successfully.", "success");
    } catch (e: unknown) { setError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Employees"
        sub={`${employees.length} team members`}
        actions={canEdit && (
          <Button variant="primary" onClick={() => { setIsNew(true); setEditing({ username: "", email: "", phone: "", role: "STORE_KEEPER", active: true, locations: [] }); setNewPass(""); setEditingCustomRoleId(""); setError(""); }}>
            + Add Employee
          </Button>
        )}
      />

      <FilterBar>
        <Input placeholder="Search by name or role…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 360 }} />
      </FilterBar>

      {showResetFor && (
        <Modal
          title="Reset Password"
          subtitle="Set a new password for this employee"
          onClose={() => { setShowResetFor(null); setError(""); }}
          width={400}
          zIndex={200}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="primary" style={{ flex: 1 }} onClick={resetPassword} disabled={loading}>
                {loading ? "Resetting…" : "Reset Password"}
              </Button>
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => { setShowResetFor(null); setError(""); }}>Cancel</Button>
            </div>
          }
        >
          {error && <div style={{ marginBottom: 16 }}><ErrorBanner msg={error} /></div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="New Password">
              <Input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)} placeholder="Min. 8 characters" />
            </Field>
            <Field label="Confirm Password">
              <Input type="password" value={resetPw2} onChange={e => setResetPw2(e.target.value)} placeholder="Repeat password" />
            </Field>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal
          title={isNew ? "Add Employee" : "Edit Employee"}
          subtitle={isNew ? "Create a new team member account" : `Editing: ${editing.username}`}
          onClose={() => { setEditing(null); setEditingCustomRoleId(""); setError(""); }}
          width={520}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="primary" style={{ flex: 1 }} onClick={save} disabled={loading}>
                {loading ? "Saving…" : "Save"}
              </Button>
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => { setEditing(null); setEditingCustomRoleId(""); setError(""); }}>Cancel</Button>
            </div>
          }
        >
          {error && <div style={{ marginBottom: 16 }}><ErrorBanner msg={error} /></div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {isNew && (
              <FormGrid>
                <Field label="Username" required>
                  <Input value={editing.username || ""} onChange={e => setEditing(p => ({ ...p, username: e.target.value }))} />
                </Field>
                <Field label="Password" required>
                  <Input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Min. 8 characters" />
                </Field>
              </FormGrid>
            )}
            <FormGrid>
              <Field label="Email">
                <Input type="email" value={editing.email || ""} onChange={e => setEditing(p => ({ ...p, email: e.target.value }))} />
              </Field>
              <Field label="Phone">
                <Input type="tel" value={editing.phone || ""} onChange={e => setEditing(p => ({ ...p, phone: e.target.value }))} />
              </Field>
            </FormGrid>
            <FormGrid>
              <Field label="System Role" required>
                <Select value={editing.role || "STORE_KEEPER"} onChange={e => setEditing(p => ({ ...p, role: e.target.value }))}>
                  {ROLES.filter(r => r !== "SUPER_ADMIN" || isSuperAdmin).filter(r => r !== "ADMIN" || isSuperAdmin).map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </Select>
              </Field>
              {customRoles.length > 0 && (
                <Field label="Custom Role (overrides tab visibility)">
                  <Select value={editingCustomRoleId} onChange={e => setEditingCustomRoleId(e.target.value)}>
                    <option value="">— None (use system role) —</option>
                    {customRoles.map(cr => (
                      <option key={cr.id} value={cr.id}>{cr.displayName}</option>
                    ))}
                  </Select>
                </Field>
              )}
            </FormGrid>
            <Field label="Assigned Warehouses">
              <div style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 10, background: "var(--input-bg)" }}>
                {warehouses.map(w => {
                  const checked = editing.locations?.some(l => l.id === w.id) || false;
                  return (
                    <label key={w.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 400, textTransform: "none", letterSpacing: 0, cursor: "pointer", color: "var(--ink)" }}>
                      <input type="checkbox" checked={checked} onChange={e => {
                        setEditing(p => ({
                          ...p,
                          locations: e.target.checked ? [...(p?.locations || []), w] : (p?.locations || []).filter(l => l.id !== w.id),
                        }));
                      }} />
                      {w.name}
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>({w.locationType})</span>
                    </label>
                  );
                })}
                {warehouses.length === 0 && <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 400, textTransform: "none" }}>No warehouses configured yet</span>}
              </div>
            </Field>
            {!isNew && (
              <label style={{
                display: "flex", alignItems: "center", gap: 10, marginTop: 4,
                padding: "10px 14px", borderRadius: 9, border: "1px solid var(--line)",
                background: (editing.active ?? true) ? "#f0fdf4" : "#fff8f8",
                cursor: "pointer", userSelect: "none",
              }}>
                <input type="checkbox" checked={editing.active ?? true}
                  onChange={e => setEditing(p => ({ ...p, active: e.target.checked }))}
                  style={{ accentColor: "var(--primary)", width: 16, height: 16, cursor: "pointer" }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: (editing.active ?? true) ? "#166534" : "#991b1b" }}>
                    {(editing.active ?? true) ? "Active account" : "Inactive account"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                    {(editing.active ?? true) ? "Employee can log in and access the system" : "Employee is deactivated and cannot log in"}
                  </div>
                </div>
              </label>
            )}
          </div>
        </Modal>
      )}

      <div style={{ background: "var(--paper)", borderRadius: 12, border: "1px solid var(--line)", overflowX: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--th-bg)", textAlign: "left" }}>
              {["Employee", "Role", "Phone", "Warehouses", "Status", ""].map(h => (
                <th key={h} style={{ padding: "11px 16px", fontWeight: 700, fontSize: 10, color: "var(--muted)", letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "1px solid var(--line)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map(e => (
              <tr key={e.id} style={{ borderBottom: "1px solid var(--panel-border)", opacity: e.active ? 1 : 0.5 }}>
                <td style={{ padding: "13px 16px" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{e.username}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{e.email}</div>
                </td>
                <td style={{ padding: "13px 16px" }}><RoleBadge role={e.role} customRole={e.customRole} /></td>
                <td style={{ padding: "13px 16px", fontSize: 13 }}>{e.phone || "—"}</td>
                <td style={{ padding: "13px 16px", fontSize: 12, color: "var(--muted)" }}>{e.locations.map(l => l.name).join(", ") || "All"}</td>
                <td style={{ padding: "13px 16px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: e.active ? "#347050" : "#b95c56" }}>
                    {e.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style={{ padding: "13px 16px" }}>
                  {canEditEmployee(e) && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button variant="secondary" size="sm" onClick={() => { setIsNew(false); setEditing(e); setEditingCustomRoleId(e.customRole?.id || ""); setError(""); }}>Edit</Button>
                      <Button variant="secondary" size="sm" onClick={() => { setShowResetFor(e.id); setError(""); }}>Reset PW</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} style={{ padding: "56px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No employees found</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
    </div>
  );
}
