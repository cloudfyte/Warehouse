"use client";
import { useState } from "react";
import type { Employee, WarehouseLocation } from "@/app/types";
import { ROLE_LABELS } from "@/app/lib/constants";
import Modal from "@/app/components/atoms/Modal";
import { friendlyError } from "@/app/lib/errors";

interface Props {
  employees: Employee[]; warehouses: WarehouseLocation[]
  isSuperAdmin: boolean; isAdmin: boolean; currentUserId: string
  onMutate: (q: string, v: Record<string, unknown>) => Promise<void>
}

const ROLES = Object.keys(ROLE_LABELS);
const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "#b91c1c", ADMIN: "#15803d", MANAGER: "#1d4ed8",
  STORE_KEEPER: "#7c3aed", CUTTING_MASTER: "#c2410c", TAILOR: "#0e7490", AUDITOR: "#475569",
};

const I: React.CSSProperties = {
  padding: "10px 13px", borderRadius: 9, border: "1px solid var(--line)",
  background: "var(--input-bg)", color: "var(--ink)", fontSize: 14, width: "100%", outline: "none",
};
const BTN_PRI: React.CSSProperties = {
  flex: 1, padding: "11px 0", borderRadius: 9, border: "none",
  background: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14,
};
const BTN_SEC: React.CSSProperties = {
  flex: 1, padding: "11px 0", borderRadius: 9, border: "1px solid var(--line)",
  background: "transparent", color: "var(--ink)", cursor: "pointer", fontSize: 14,
};
const LBL: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 5,
  fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, textTransform: "uppercase",
};

function RoleBadge({ role }: { role: string }) {
  const color = ROLE_COLORS[role] || "#555";
  return (
    <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: color + "18", color, border: `1px solid ${color}33` }}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

export default function Employees({ employees, warehouses, isSuperAdmin, isAdmin, currentUserId, onMutate }: Props) {
  const [editing, setEditing] = useState<Partial<Employee> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [showResetFor, setShowResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState(""); const [resetPw2, setResetPw2] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canEdit = isSuperAdmin || isAdmin;
  const filtered = employees.filter(e =>
    e.username.toLowerCase().includes(search.toLowerCase()) ||
    e.role.toLowerCase().includes(search.toLowerCase())
  );

  const canEditEmployee = (e: Employee) => {
    if (!canEdit) return false;
    if ((e.role === "SUPER_ADMIN" || e.role === "ADMIN") && !isSuperAdmin) return false;
    return true;
  };

  async function save() {
    if (!editing) return;
    setLoading(true); setError("");
    try {
      if (isNew) {
        await onMutate(
          `mutation C($u:String!,$p:String!,$r:String!,$wids:[ID!]!,$email:String,$phone:String){createEmployee(username:$u,password:$p,role:$r,warehouseIds:$wids,email:$email,phone:$phone){employee{id}}}`,
          { u: editing.username, p: newPass, r: editing.role, wids: editing.locations?.map(l => l.id) || [], email: editing.email, phone: editing.phone }
        );
      } else {
        await onMutate(
          `mutation U($id:ID!,$r:String,$phone:String,$email:String,$active:Boolean,$wids:[ID!]){updateEmployee(id:$id,role:$r,phone:$phone,email:$email,active:$active,warehouseIds:$wids){employee{id}}}`,
          { id: editing.id, r: editing.role, phone: editing.phone, email: editing.email, active: editing.active, wids: editing.locations?.map(l => l.id) }
        );
      }
      setEditing(null); setNewPass("");
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setLoading(false); }
  }

  async function resetPassword() {
    if (!showResetFor || resetPw !== resetPw2) { setError("Passwords do not match"); return; }
    if (resetPw.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true); setError("");
    try {
      await onMutate(`mutation R($id:ID!,$pw:String!){resetEmployeePassword(id:$id,newPassword:$pw){ok}}`, { id: showResetFor, pw: resetPw });
      setShowResetFor(null); setResetPw(""); setResetPw2("");
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Employees</h2>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>{employees.length} team members</p>
        </div>
        {canEdit && (
          <button onClick={() => { setIsNew(true); setEditing({ username: "", email: "", phone: "", role: "STORE_KEEPER", active: true, locations: [] }); setNewPass(""); setError(""); }} className="primary-button">
            + Add Employee
          </button>
        )}
      </div>

      <input placeholder="Search by name or role…" value={search} onChange={e => setSearch(e.target.value)}
        style={{ ...I, maxWidth: 360, marginBottom: 16 }} />

      {/* Reset password modal */}
      {showResetFor && (
        <Modal
          title="Reset Password"
          subtitle="Set a new password for this employee"
          onClose={() => { setShowResetFor(null); setError(""); }}
          width={400}
          zIndex={200}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={resetPassword} disabled={loading} style={BTN_PRI}>
                {loading ? "Resetting…" : "Reset Password"}
              </button>
              <button onClick={() => { setShowResetFor(null); setError(""); }} style={BTN_SEC}>Cancel</button>
            </div>
          }
        >
          {error && <div style={{ background: "#fff0ef", border: "1px solid #f1cbc8", color: "#8d3e39", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={LBL}>New Password
              <input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)} style={I} placeholder="Min. 8 characters" />
            </label>
            <label style={LBL}>Confirm Password
              <input type="password" value={resetPw2} onChange={e => setResetPw2(e.target.value)} style={I} placeholder="Repeat password" />
            </label>
          </div>
        </Modal>
      )}

      {/* Edit / Create modal */}
      {editing && (
        <Modal
          title={isNew ? "Add Employee" : "Edit Employee"}
          subtitle={isNew ? "Create a new team member account" : `Editing: ${editing.username}`}
          onClose={() => { setEditing(null); setError(""); }}
          width={520}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={save} disabled={loading} style={BTN_PRI}>
                {loading ? "Saving…" : "Save"}
              </button>
              <button onClick={() => { setEditing(null); setError(""); }} style={BTN_SEC}>Cancel</button>
            </div>
          }
        >
          {error && <div style={{ background: "#fff0ef", border: "1px solid #f1cbc8", color: "#8d3e39", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {isNew && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <label style={LBL}>Username *
                  <input value={editing.username || ""} onChange={e => setEditing(p => ({ ...p, username: e.target.value }))} style={I} />
                </label>
                <label style={LBL}>Password *
                  <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} style={I} placeholder="Min. 8 characters" />
                </label>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={LBL}>Email
                <input type="email" value={editing.email || ""} onChange={e => setEditing(p => ({ ...p, email: e.target.value }))} style={I} />
              </label>
              <label style={LBL}>Phone
                <input type="tel" value={editing.phone || ""} onChange={e => setEditing(p => ({ ...p, phone: e.target.value }))} style={I} />
              </label>
            </div>
            <label style={LBL}>Role *
              <select value={editing.role || "STORE_KEEPER"} onChange={e => setEditing(p => ({ ...p, role: e.target.value }))} style={I}>
                {ROLES.filter(r => r !== "SUPER_ADMIN" || isSuperAdmin).filter(r => r !== "ADMIN" || isSuperAdmin).map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </label>
            <label style={LBL}>Assigned Warehouses
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
            </label>
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
            {filtered.map(e => (
              <tr key={e.id} style={{ borderBottom: "1px solid var(--panel-border)", opacity: e.active ? 1 : 0.5 }}>
                <td style={{ padding: "13px 16px" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{e.username}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{e.email}</div>
                </td>
                <td style={{ padding: "13px 16px" }}><RoleBadge role={e.role} /></td>
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
                      <button onClick={() => { setIsNew(false); setEditing(e); setError(""); }}
                        style={{ padding: "4px 12px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Edit</button>
                      <button onClick={() => { setShowResetFor(e.id); setError(""); }}
                        style={{ padding: "4px 12px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Reset PW</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} style={{ padding: "56px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No employees found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
