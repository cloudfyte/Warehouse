"use client";
import { useState } from "react";
import { Eye, EyeOff, User, Shield, Warehouse, KeyRound, CheckCircle2 } from "lucide-react";
import { ROLE_LABELS } from "@/app/lib/constants";
import { friendlyError } from "@/app/lib/errors";
import Input from "@/app/components/atoms/Input";
import Button from "@/app/components/atoms/Button";
import Field from "@/app/components/molecules/Field";
import FormGrid from "@/app/components/molecules/FormGrid";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";

interface EmployeeProfile {
  id: string;
  username: string;
  email: string;
  phone: string;
  role: string;
  active: boolean;
  locations: { id: string; name: string; code: string; locationType: string }[];
}

interface Props {
  profile: EmployeeProfile | null;
  token: string;
  onMutate: (q: string, v: Record<string, unknown>) => Promise<void>;
  onProfileUpdated: () => void;
}

const CARD: React.CSSProperties = {
  background: "var(--paper)", borderRadius: 14, border: "1px solid var(--line)",
  padding: "24px 28px", marginBottom: 20,
};

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  SUPER_ADMIN:  { bg: "#3a2200", color: "#f5c06a" },
  ADMIN:        { bg: "#fae9d0", color: "#9d5e10" },
  MANAGER:      { bg: "#e3edf5", color: "#375f78" },
  STORE_KEEPER: { bg: "#e4efe7", color: "#397153" },
  CUTTING_MASTER:{ bg: "#f0e8f7", color: "#6b3fa0" },
  TAILOR:       { bg: "#fce8ef", color: "#a03060" },
  AUDITOR:      { bg: "#eaf0ed", color: "#52665c" },
};

export default function Profile({ profile, onMutate, onProfileUpdated }: Props) {
  const [email, setEmail] = useState(profile?.email || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [saving, setSaving] = useState(false);
  const [infoMsg, setInfoMsg] = useState("");
  const [infoErr, setInfoErr] = useState("");

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  if (!profile) return null;

  const roleColor = ROLE_COLORS[profile.role] || { bg: "var(--pale-green)", color: "var(--primary)" };
  const initial = (profile.username || "?")[0].toUpperCase();

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    setInfoMsg(""); setInfoErr(""); setSaving(true);
    try {
      await onMutate(
        `mutation U($email:String,$phone:String){updateMyProfile(email:$email,phone:$phone){employee{id email phone}}}`,
        { email: email.trim() || undefined, phone: phone.trim() || undefined }
      );
      setInfoMsg("Profile updated successfully.");
      onProfileUpdated();
    } catch (err: unknown) {
      setInfoErr(friendlyError(err));
    } finally { setSaving(false); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(""); setPwErr("");
    if (newPw !== confirmPw) { setPwErr("New passwords do not match."); return; }
    if (newPw.length < 6) { setPwErr("Password must be at least 6 characters."); return; }
    setPwSaving(true);
    try {
      await onMutate(
        `mutation CP($cur:String!,$new:String!){changeMyPassword(currentPassword:$cur,newPassword:$new){ok}}`,
        { cur: curPw, new: newPw }
      );
      setPwMsg("Password changed successfully. Use your new password next time you log in.");
      setCurPw(""); setNewPw(""); setConfirmPw("");
    } catch (err: unknown) {
      setPwErr(friendlyError(err));
    } finally { setPwSaving(false); }
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "28px 20px" }}>

      {/* ── Avatar + identity ── */}
      <div style={{ ...CARD, display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%", flexShrink: 0,
          background: "var(--primary)", display: "flex", alignItems: "center",
          justifyContent: "center", fontWeight: 800, fontSize: 28, color: "#fff",
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
        }}>
          {initial}
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", marginBottom: 6 }}>
            {profile.username}
          </div>
          <span style={{
            display: "inline-block", padding: "4px 12px", borderRadius: 99,
            fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
            background: roleColor.bg, color: roleColor.color,
          }}>
            {ROLE_LABELS[profile.role] || profile.role}
          </span>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: profile.active ? "#22c55e" : "#ef4444",
            }} />
            {profile.active ? "Active account" : "Inactive account"}
          </div>
        </div>
      </div>

      {/* ── Contact info edit ── */}
      <div style={CARD}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--pale-green)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)" }}>
            <User size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Contact Information</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Update your email and phone number</div>
          </div>
        </div>

        <ErrorBanner msg={infoErr} />
        {infoMsg && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", borderRadius: 9, padding: "10px 14px", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} /> {infoMsg}
          </div>
        )}

        <form onSubmit={saveInfo} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Username" hint="Cannot be changed">
            <Input value={profile.username} disabled style={{ opacity: 0.55, cursor: "not-allowed" }} />
          </Field>

          <FormGrid gap={16}>
            <Field label="Email">
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com" />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+91 XXXXX XXXXX" />
            </Field>
          </FormGrid>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="submit" variant="primary" disabled={saving} style={{ padding: "10px 24px", fontSize: 14 }}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>

      {/* ── Password change ── */}
      <div style={CARD}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444" }}>
            <KeyRound size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Change Password</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>You must enter your current password to set a new one</div>
          </div>
        </div>

        <ErrorBanner msg={pwErr} />
        {pwMsg && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", borderRadius: 9, padding: "10px 14px", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} /> {pwMsg}
          </div>
        )}

        <form onSubmit={changePassword} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Current Password">
            <div style={{ position: "relative" }}>
              <Input type={showCur ? "text" : "password"} value={curPw}
                onChange={e => setCurPw(e.target.value)} required
                placeholder="Enter current password" style={{ paddingRight: 44 }} />
              <button type="button" onClick={() => setShowCur(p => !p)} style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: "var(--muted)",
                display: "flex", alignItems: "center",
              }}>{showCur ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </Field>

          <FormGrid gap={16}>
            <Field label="New Password">
              <div style={{ position: "relative" }}>
                <Input type={showNew ? "text" : "password"} value={newPw}
                  onChange={e => setNewPw(e.target.value)} required minLength={6}
                  placeholder="Min. 6 characters" style={{ paddingRight: 44 }} />
                <button type="button" onClick={() => setShowNew(p => !p)} style={{
                  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", color: "var(--muted)",
                  display: "flex", alignItems: "center",
                }}>{showNew ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </Field>
            <Field label="Confirm New Password">
              <>
                <Input type="password" value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)} required
                  placeholder="Repeat new password"
                  style={{ borderColor: confirmPw && confirmPw !== newPw ? "#ef4444" : undefined }} />
                {confirmPw && confirmPw !== newPw && (
                  <span style={{ fontSize: 11, color: "#ef4444", marginTop: 4, display: "block" }}>Passwords don&apos;t match</span>
                )}
              </>
            </Field>
          </FormGrid>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="submit" variant="danger" disabled={pwSaving || !curPw || !newPw || newPw !== confirmPw}
              style={{ padding: "10px 24px", fontSize: 14 }}>
              {pwSaving ? "Changing…" : "Change Password"}
            </Button>
          </div>
        </form>
      </div>

      {/* ── Assigned warehouses (read-only) ── */}
      {profile.locations && profile.locations.length > 0 && (
        <div style={CARD}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#3b82f6" }}>
              <Warehouse size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Assigned Locations</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Warehouses & locations you have access to</div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {profile.locations.map(loc => (
              <div key={loc.id} style={{
                padding: "8px 14px", borderRadius: 10, border: "1px solid var(--line)",
                background: "var(--canvas)", fontSize: 13,
              }}>
                <span style={{ fontWeight: 700 }}>{loc.code}</span>
                <span style={{ color: "var(--muted)", marginLeft: 8 }}>{loc.name}</span>
                <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", borderRadius: 99, background: "#e0ebff", color: "#2563eb", fontWeight: 600 }}>
                  {loc.locationType}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Security info ── */}
      <div style={{ ...CARD, background: "var(--canvas)", border: "1px dashed var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Shield size={16} style={{ color: "var(--muted)", flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            Your account is managed by the GarmentFlow ERP system. Contact your administrator to change your role or warehouse assignments.
          </p>
        </div>
      </div>

    </div>
  );
}
