"use client";
import { useState } from "react";
import type { CustomRole, Employee, Tab } from "@/app/types";
import Modal from "@/app/components/atoms/Modal";
import Button from "@/app/components/atoms/Button";
import Input from "@/app/components/atoms/Input";
import Field from "@/app/components/molecules/Field";
import PageHeader from "@/app/components/molecules/PageHeader";
import { GRANTABLE_TABS } from "@/app/lib/nav";
import { showToast } from "@/app/lib/toast";
import { friendlyError } from "@/app/lib/errors";

interface Props {
  roles: CustomRole[]
  employees: Employee[]
  isSuperAdmin: boolean
  gql: <T>(q: string, v?: Record<string, unknown>) => Promise<T>
  onRefresh: () => void
}

/**
 * How much of the work someone is trusted with.
 *
 * This is the backend role underneath the tabs, and it decides what a person
 * may change, not merely what they can see — a screen is no use if every
 * button on it is refused. It is written as four sentences about people
 * because "Backend Permission Level: STORE_KEEPER" means nothing to the person
 * setting it up.
 */
const TRUST = [
  { value: "AUDITOR", title: "Can only look",
    says: "Reads anything you show them. Changes nothing." },
  { value: "STORE_KEEPER", title: "Works the floor",
    says: "Takes goods in, records cutting and stitching, moves stock." },
  { value: "MANAGER", title: "Runs the day",
    says: "Everything on the floor, plus paying, settling and correcting stock." },
  { value: "ADMIN", title: "Runs the business",
    says: "Everything, including staff and money. Not the app's own settings." },
];

const GROUPS = [...new Set(GRANTABLE_TABS.map(t => t.group))];

const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#64748b"];

function emptyPermissions(): Record<string, boolean> {
  return Object.fromEntries(GRANTABLE_TABS.map(t => [t.key, false]));
}

export default function Roles({ roles, employees, isSuperAdmin, gql, onRefresh }: Props) {
  const [selected, setSelected] = useState<CustomRole | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDelete, setShowDelete] = useState<CustomRole | null>(null);
  const [form, setForm] = useState({
    name: "", displayName: "", color: COLORS[0],
    backendLevel: "STORE_KEEPER",
    tabPermissions: emptyPermissions(),
  });

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>Only the owner can change this</div>
        <div style={{ fontSize: 14, marginTop: 6 }}>Deciding who may do what is kept to the super administrator.</div>
      </div>
    );
  }

  function openCreate() {
    setForm({ name: "", displayName: "", color: COLORS[0], backendLevel: "STORE_KEEPER", tabPermissions: emptyPermissions() });
    setIsNew(true); setSelected(null); setShowForm(true);
  }

  function openEdit(r: CustomRole) {
    const perms = emptyPermissions();
    if (r.tabPermissions) Object.assign(perms, r.tabPermissions);
    setForm({ name: r.name, displayName: r.displayName, color: r.color, backendLevel: r.backendLevel, tabPermissions: perms });
    setIsNew(false); setSelected(r); setShowForm(true);
  }

  function toggleAll(group: string, on: boolean) {
    const keys = GRANTABLE_TABS.filter(t => t.group === group).map(t => t.key);
    setForm(f => ({ ...f, tabPermissions: { ...f.tabPermissions, ...Object.fromEntries(keys.map(k => [k, on])) } }));
  }

  /** A role key nobody has to invent: it follows the name they typed. */
  function keyFor(displayName: string) {
    return displayName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  async function save() {
    if (!form.displayName.trim()) { showToast("Give the role a name.", "error"); return; }
    const granted = Object.values(form.tabPermissions).filter(Boolean).length;
    if (granted === 0) { showToast("Tick at least one screen, or they will sign in to nothing.", "error"); return; }
    setLoading(true);
    try {
      if (isNew) {
        await gql(`mutation C($name:String!,$dn:String!,$color:String,$bl:String,$tp:JSONString!){
          createCustomRole(name:$name,displayName:$dn,color:$color,backendLevel:$bl,tabPermissions:$tp){role{id}}
        }`, { name: keyFor(form.displayName), dn: form.displayName, color: form.color,
              bl: form.backendLevel, tp: JSON.stringify(form.tabPermissions) });
        showToast("Role created.", "success");
      } else {
        await gql(`mutation U($id:ID!,$dn:String,$color:String,$bl:String,$tp:JSONString){
          updateCustomRole(id:$id,displayName:$dn,color:$color,backendLevel:$bl,tabPermissions:$tp){role{id}}
        }`, { id: selected!.id, dn: form.displayName, color: form.color,
              bl: form.backendLevel, tp: JSON.stringify(form.tabPermissions) });
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

  const holders = (r: CustomRole) => employees.filter(e => e.customRole?.id === r.id);
  const screens = (r: CustomRole) =>
    GRANTABLE_TABS.filter(t => r.tabPermissions?.[t.key] === true);

  const grantedCount = Object.values(form.tabPermissions).filter(Boolean).length;
  const deleteHolders = showDelete ? holders(showDelete) : [];

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Roles"
        sub="What each kind of person can open, and how much they may change"
        actions={<Button variant="primary" onClick={openCreate}>+ New Role</Button>}
      />

      {roles.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>No roles of your own yet</div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
            Everyone signs in with a built-in role until you make one.<br />
            A role is worth making when several people need the same handful of screens.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {roles.map(r => {
            const people = holders(r);
            const open = screens(r);
            const trust = TRUST.find(t => t.value === r.backendLevel);
            return (
              <div key={r.id} style={{
                border: "1px solid var(--line)", borderLeft: `3px solid ${r.color}`,
                borderRadius: 12, padding: "14px 16px", background: "var(--paper)",
              }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 200, flex: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>
                      {r.displayName}
                      {r.isSystem && (
                        <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 700, color: "var(--muted)", background: "var(--canvas)", padding: "2px 8px", borderRadius: 99 }}>
                          built in
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                      {trust ? `${trust.title} — ${trust.says}` : r.backendLevel}
                    </div>
                  </div>

                  <div style={{ minWidth: 150 }}>
                    <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Who has it
                    </div>
                    <div style={{ fontSize: 14, marginTop: 3 }}>
                      {people.length === 0
                        ? <span style={{ color: "var(--muted)" }}>nobody yet</span>
                        : people.map(p => p.username).join(", ")}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <Button variant="secondary" size="sm" onClick={() => openEdit(r)}>Edit</Button>
                    {!r.isSystem && (
                      <Button variant="danger" size="sm" onClick={() => setShowDelete(r)}>Delete</Button>
                    )}
                  </div>
                </div>

                {/* What they actually see when they sign in. */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {open.length === 0 ? (
                    <span style={{ fontSize: 13, color: "#d32f2f" }}>
                      No screens ticked — anybody with this role signs in to an empty app.
                    </span>
                  ) : open.map(t => (
                    <span key={t.key} style={{
                      fontSize: 12.5, padding: "3px 10px", borderRadius: 7,
                      border: "1px solid var(--line)", background: "var(--canvas)",
                    }}>
                      {t.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal
          title={isNew ? "New role" : form.displayName}
          subtitle="Two questions: what can they open, and how much can they change."
          onClose={() => setShowForm(false)}
          width={680}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="primary" onClick={save} disabled={loading} style={{ flex: 1 }}>
                {loading ? "Saving…" : isNew ? "Create role" : "Save"}
              </Button>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          }
        >
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Field label="What is this role called?" required style={{ flex: 1, minWidth: 240 }}
              hint={isNew ? "The name people will see on the employee's card." : undefined}>
              <Input value={form.displayName} autoFocus placeholder="e.g. Accounts Manager"
                onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
            </Field>
            <Field label="Colour">
              <div style={{ display: "flex", gap: 6 }}>
                {COLORS.map(c => (
                  <button type="button" key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    aria-label={`Colour ${c}`}
                    style={{
                      width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer",
                      border: form.color === c ? "3px solid var(--ink)" : "1px solid rgba(0,0,0,.2)",
                    }} />
                ))}
              </div>
            </Field>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>How much can they change?</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 8 }}>
              {TRUST.map(t => {
                const on = form.backendLevel === t.value;
                return (
                  <button type="button" key={t.value}
                    onClick={() => setForm(f => ({ ...f, backendLevel: t.value }))}
                    style={{
                      textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                      border: `1.5px solid ${on ? "var(--primary)" : "var(--line)"}`,
                      background: on ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--paper)",
                      color: "var(--ink)",
                    }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{t.title}</div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>{t.says}</div>
                  </button>
                );
              })}
            </div>
            {!TRUST.some(t => t.value === form.backendLevel) && (
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8 }}>
                This role is currently set to <strong>{form.backendLevel}</strong>. Pick one above to change it.
              </div>
            )}
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>What can they open?</span>
              <span style={{ fontSize: 12.5, color: grantedCount === 0 ? "#d32f2f" : "var(--muted)" }}>
                {grantedCount === 0 ? "nothing ticked yet" : `${grantedCount} screens`}
              </span>
            </div>
            {GROUPS.map(group => {
              const tabs = GRANTABLE_TABS.filter(t => t.group === group);
              const allOn = tabs.every(t => form.tabPermissions[t.key]);
              return (
                <div key={group} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{group}</span>
                    <button type="button" onClick={() => toggleAll(group, !allOn)}
                      style={{ background: "none", border: "none", color: "var(--primary)", fontWeight: 600, fontSize: 12.5, cursor: "pointer", padding: 0 }}>
                      {allOn ? "none" : "all"}
                    </button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {tabs.map(t => {
                      const on = !!form.tabPermissions[t.key];
                      return (
                        <button type="button" key={t.key}
                          onClick={() => setForm(f => ({ ...f, tabPermissions: { ...f.tabPermissions, [t.key as Tab]: !on } }))}
                          style={{
                            padding: "6px 13px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                            border: `1.5px solid ${on ? "var(--primary)" : "var(--line)"}`,
                            background: on ? "var(--primary)" : "transparent",
                            color: on ? "#fff" : "var(--ink)",
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
        </Modal>
      )}

      {showDelete && (
        <Modal title={`Delete ${showDelete.displayName}?`} onClose={() => setShowDelete(null)} width={420}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="danger" onClick={deleteRole} disabled={loading} style={{ flex: 1 }}>
                {loading ? "Deleting…" : "Delete"}
              </Button>
              <Button variant="secondary" onClick={() => setShowDelete(null)}>Keep it</Button>
            </div>
          }>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            {deleteHolders.length > 0 ? (
              <>
                <strong style={{ color: "#d32f2f" }}>
                  {deleteHolders.map(p => p.username).join(", ")}
                </strong>{" "}
                {deleteHolders.length === 1 ? "has" : "have"} this role. Give them another one first,
                or they fall back to whatever their basic role allows.
              </>
            ) : "Nobody has this role, so nothing changes for anyone. It cannot be undone."}
          </p>
        </Modal>
      )}
    </div>
  );
}
