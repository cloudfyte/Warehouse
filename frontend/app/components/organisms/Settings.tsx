"use client";
import { useState, useRef } from "react";
import { applyBrandColors } from "@/app/lib/theme";
import { friendlyError } from "@/app/lib/errors";

interface SettingsData {
  id?: string
  appName?: string; appSubtitle?: string; companyName?: string; companyState?: string; currencySymbol?: string; taxPercent?: number
  primaryColor?: string; accentColor?: string
  smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPassword?: string
  smtpFromEmail?: string; emailEnabled?: boolean
  twilioAccountSid?: string; twilioAuthToken?: string; twilioFromNumber?: string; smsEnabled?: boolean
  waToken?: string; waPhoneNumberId?: string; waEnabled?: boolean
  firebaseServiceAccountJson?: string; fcmEnabled?: boolean
  otpExpiryMinutes?: number; allowOtpLogin?: boolean
  printCompanyAddress?: string; printBankDetails?: string; printTerms?: string
  printSignatureLabel?: string; printShowLogo?: boolean
  gstOnPurchases?: boolean; gstin?: string
}

interface Props { settings: SettingsData; isSuperAdmin: boolean; onMutate: (q: string, v: Record<string, unknown>) => Promise<void> }

function SettingsSection({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: 24, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)", textTransform: "uppercase", letterSpacing: 0.6 }}>{title}</span>
        {badge && <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: "#22c55e18", color: "#16a34a", border: "1px solid #22c55e33" }}>{badge}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "", wide = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; wide?: boolean }) {
  return (
    <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6, gridColumn: wide ? "1 / -1" : undefined }}>
      <span style={{ color: "var(--muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ padding: "10px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--input-bg)", color: "var(--ink)", fontSize: 14, outline: "none" }} />
    </label>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", gridColumn: "1 / -1" }}>
      <div style={{ position: "relative", marginTop: 2, flexShrink: 0 }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: 36, height: 20, cursor: "pointer", accentColor: "var(--primary)" }} />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, lineHeight: 1.5 }}>{description}</div>}
      </div>
    </label>
  );
}

function Textarea({ label, value, onChange, placeholder = "", rows = 4 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
      <span style={{ color: "var(--muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        style={{ padding: "10px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--input-bg)", color: "var(--ink)", fontSize: 12, fontFamily: "monospace", outline: "none", resize: "vertical", lineHeight: 1.5 }} />
    </label>
  );
}

const RESET_PHRASE = "RESET ALL DATA";

export default function Settings({ settings, isSuperAdmin, onMutate }: Props) {
  const [form, setForm] = useState<SettingsData>({ ...settings });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [resetModal, setResetModal] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetDone, setResetDone] = useState(false);
  const resetInputRef = useRef<HTMLInputElement>(null);

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Super Administrators only</div>
        <div style={{ fontSize: 14, marginTop: 4 }}>Contact your system administrator to change settings.</div>
      </div>
    );
  }

  const set = (field: keyof SettingsData) => (v: string) => setForm(p => ({ ...p, [field]: v }));
  const tog = (field: keyof SettingsData) => (v: boolean) => setForm(p => ({ ...p, [field]: v }));

  async function handleReset() {
    setResetLoading(true); setResetError("");
    try {
      await onMutate(
        `mutation R($phrase:String!){resetAllData(confirmPhrase:$phrase){ok message}}`,
        { phrase: resetPhrase }
      );
      setResetDone(true);
      setResetModal(false);
      setResetPhrase("");
    } catch (e: unknown) { setResetError(friendlyError(e)); }
    finally { setResetLoading(false); }
  }

  async function save() {
    setLoading(true); setSaved(false); setError("");
    try {
      await onMutate(
        `mutation U(
          $appName:String,$appSubtitle:String,$companyName:String,$companyState:String,$currencySymbol:String,$taxPercent:Float,
          $primaryColor:String,$accentColor:String,
          $smtpHost:String,$smtpPort:Int,$smtpUser:String,$smtpPassword:String,$smtpFromEmail:String,$emailEnabled:Boolean,
          $twilioSid:String,$twilioToken:String,$twilioFrom:String,$smsEnabled:Boolean,
          $waToken:String,$waPhoneNumberId:String,$waEnabled:Boolean,
          $firebaseJson:String,$fcmEnabled:Boolean,
          $otpExpiry:Int,$allowOtp:Boolean,
          $printAddr:String,$printBank:String,$printTerms:String,$printSig:String,$printLogo:Boolean,
          $gstOnPurchases:Boolean,$gstin:String
        ){updateSystemSettings(
          appName:$appName,appSubtitle:$appSubtitle,companyName:$companyName,companyState:$companyState,currencySymbol:$currencySymbol,taxPercent:$taxPercent,
          primaryColor:$primaryColor,accentColor:$accentColor,
          smtpHost:$smtpHost,smtpPort:$smtpPort,smtpUser:$smtpUser,smtpPassword:$smtpPassword,smtpFromEmail:$smtpFromEmail,emailEnabled:$emailEnabled,
          twilioAccountSid:$twilioSid,twilioAuthToken:$twilioToken,twilioFromNumber:$twilioFrom,smsEnabled:$smsEnabled,
          waToken:$waToken,waPhoneNumberId:$waPhoneNumberId,waEnabled:$waEnabled,
          firebaseServiceAccountJson:$firebaseJson,fcmEnabled:$fcmEnabled,
          otpExpiryMinutes:$otpExpiry,allowOtpLogin:$allowOtp,
          printCompanyAddress:$printAddr,printBankDetails:$printBank,printTerms:$printTerms,printSignatureLabel:$printSig,printShowLogo:$printLogo,
          gstOnPurchases:$gstOnPurchases,gstin:$gstin
        ){settings{id}}}`,
        {
          appName: form.appName, appSubtitle: form.appSubtitle,
          companyName: form.companyName, companyState: form.companyState || undefined,
          currencySymbol: form.currencySymbol,
          taxPercent: form.taxPercent ? +form.taxPercent : undefined,
          primaryColor: form.primaryColor || undefined,
          accentColor: form.accentColor || undefined,
          smtpHost: form.smtpHost, smtpPort: form.smtpPort ? +form.smtpPort : undefined,
          smtpUser: form.smtpUser, smtpPassword: form.smtpPassword || undefined,
          smtpFromEmail: form.smtpFromEmail, emailEnabled: form.emailEnabled,
          twilioSid: form.twilioAccountSid, twilioToken: form.twilioAuthToken,
          twilioFrom: form.twilioFromNumber, smsEnabled: form.smsEnabled,
          waToken: form.waToken || undefined, waPhoneNumberId: form.waPhoneNumberId || undefined,
          waEnabled: form.waEnabled,
          firebaseJson: form.firebaseServiceAccountJson || undefined, fcmEnabled: form.fcmEnabled,
          otpExpiry: form.otpExpiryMinutes ? +form.otpExpiryMinutes : undefined,
          allowOtp: form.allowOtpLogin,
          printAddr: form.printCompanyAddress || undefined,
          printBank: form.printBankDetails || undefined,
          printTerms: form.printTerms || undefined,
          printSig: form.printSignatureLabel || undefined,
          printLogo: form.printShowLogo,
          gstOnPurchases: form.gstOnPurchases,
          gstin: form.gstin || undefined,
        }
      );
      applyBrandColors({ primaryColor: form.primaryColor, accentColor: form.accentColor });
      setSaved(true);
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 24, maxWidth: 820 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>System Settings</h2>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>Changes take effect immediately after saving</div>
        </div>
        <button onClick={save} disabled={loading}
          style={{ padding: "11px 28px", borderRadius: 9, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          {loading ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {saved && (
        <div style={{ background: "#edf8ee", border: "1px solid #c3e6c5", color: "#2e6e34", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          ✓ Settings saved successfully.
        </div>
      )}
      {error && (
        <div style={{ background: "#fff0ef", border: "1px solid #f1cbc8", color: "#8d3e39", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: 14 }}>
          {error}
        </div>
      )}

      <SettingsSection title="App & Company">
        <Field label="App Name" value={form.appName || ""} onChange={set("appName")} />
        <Field label="App Subtitle" value={form.appSubtitle || ""} onChange={set("appSubtitle")} />
        <Field label="Company Name" value={form.companyName || ""} onChange={set("companyName")} />
        <Field label="Company State" value={form.companyState || ""} onChange={set("companyState")} placeholder="e.g. Tamil Nadu (for CGST/SGST vs IGST)" />
        <Field label="Currency Symbol" value={form.currencySymbol || ""} onChange={set("currencySymbol")} />
        <Field label="Default GST / Tax %" value={String(form.taxPercent ?? "")} onChange={set("taxPercent")} type="number" />
        <Field label="Company GSTIN" value={form.gstin || ""} onChange={set("gstin")} placeholder="e.g. 33AABCU9603R1ZX" />
        <Toggle
          label="Apply GST on Purchase Bills (Input Tax Credit)"
          description="When ON, each bill item shows a GST % field. Tax is split as CGST+SGST (intra-state) or IGST (inter-state) based on supplier state vs company state."
          checked={!!form.gstOnPurchases}
          onChange={tog("gstOnPurchases")}
        />
        <Field label="OTP Expiry (minutes)" value={String(form.otpExpiryMinutes ?? "")} onChange={set("otpExpiryMinutes")} type="number" />
        <Toggle label="Allow OTP Login" description="Users can log in via Email, SMS, or WhatsApp one-time password" checked={!!form.allowOtpLogin} onChange={tog("allowOtpLogin")} />
      </SettingsSection>

      {/* ── Brand Colors ── */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)", textTransform: "uppercase", letterSpacing: 0.6 }}>Brand Colors</span>
          <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: "#818cf818", color: "#6366f1", border: "1px solid #818cf833" }}>Live Preview</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
          {/* Primary color picker */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>Primary Color</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input type="color" value={form.primaryColor || "#173a2c"}
                onChange={e => { setForm(p => ({ ...p, primaryColor: e.target.value })); applyBrandColors({ primaryColor: e.target.value }); }}
                style={{ width: 52, height: 52, padding: 2, borderRadius: 10, border: "2px solid var(--line)", cursor: "pointer", background: "var(--input-bg)" }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", fontFamily: "monospace" }}>{(form.primaryColor || "#173a2c").toUpperCase()}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Sidebar, buttons, headings</div>
              </div>
            </div>
          </div>

          {/* Accent color picker */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>Accent Color</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input type="color" value={form.accentColor || "#d4932f"}
                onChange={e => { setForm(p => ({ ...p, accentColor: e.target.value })); applyBrandColors({ accentColor: e.target.value }); }}
                style={{ width: 52, height: 52, padding: 2, borderRadius: 10, border: "2px solid var(--line)", cursor: "pointer", background: "var(--input-bg)" }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", fontFamily: "monospace" }}>{(form.accentColor || "#d4932f").toUpperCase()}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Badges, highlights, tags</div>
              </div>
            </div>
          </div>
        </div>

        {/* Live preview strip */}
        <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--line)", display: "flex", height: 64 }}>
          <div style={{ background: form.primaryColor || "#173a2c", width: 180, display: "flex", alignItems: "center", paddingLeft: 16, gap: 10, flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>A</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>Sidebar</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>Navigation</div>
            </div>
          </div>
          <div style={{ flex: 1, background: "var(--canvas)", display: "flex", alignItems: "center", gap: 10, paddingLeft: 16 }}>
            <button style={{ background: form.primaryColor || "#173a2c", color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "default" }}>
              Save
            </button>
            <span style={{ background: form.accentColor || "#d4932f", color: "#fff", borderRadius: 99, fontSize: 10, fontWeight: 700, padding: "3px 9px" }}>
              Badge
            </span>
            <span style={{ padding: "3px 9px", borderRadius: 99, border: `1.5px solid ${form.primaryColor || "#173a2c"}`, color: form.primaryColor || "#173a2c", fontSize: 10, fontWeight: 600 }}>
              Outline
            </span>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted)" }}>
          Click "Save Changes" at the top to apply these colors permanently for all users.
        </div>
      </div>

      <SettingsSection title="Email — SMTP">
        <Field label="SMTP Host" value={form.smtpHost || ""} onChange={set("smtpHost")} placeholder="smtp.gmail.com" />
        <Field label="SMTP Port" value={String(form.smtpPort ?? "")} onChange={set("smtpPort")} type="number" placeholder="587" />
        <Field label="SMTP Username" value={form.smtpUser || ""} onChange={set("smtpUser")} placeholder="you@gmail.com" />
        <Field label="SMTP Password" value={form.smtpPassword || ""} onChange={set("smtpPassword")} type="password" placeholder="App password" />
        <Field label="From Email" value={form.smtpFromEmail || ""} onChange={set("smtpFromEmail")} type="email" placeholder="noreply@yourcompany.com" />
        <Toggle label="Enable Email Notifications" description="Send OTP codes and alerts via email" checked={!!form.emailEnabled} onChange={tog("emailEnabled")} />
      </SettingsSection>

      <SettingsSection title="SMS — Twilio">
        <Field label="Account SID" value={form.twilioAccountSid || ""} onChange={set("twilioAccountSid")} placeholder="ACxxxxxxxx" />
        <Field label="Auth Token" value={form.twilioAuthToken || ""} onChange={set("twilioAuthToken")} type="password" placeholder="Leave blank to keep unchanged" />
        <Field label="From Number" value={form.twilioFromNumber || ""} onChange={set("twilioFromNumber")} placeholder="+91..." />
        <Toggle label="Enable SMS OTP" description="Send one-time passwords via SMS" checked={!!form.smsEnabled} onChange={tog("smsEnabled")} />
      </SettingsSection>

      <SettingsSection title="WhatsApp — Meta Business API" badge="New">
        <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--muted)", background: "var(--canvas)", borderRadius: 8, padding: "10px 14px", lineHeight: 1.6 }}>
          Get your credentials from <strong>Meta Business Manager → WhatsApp → API Setup</strong>.
          The access token and Phone Number ID are shown on the app dashboard.
        </div>
        <Field label="Access Token" value={form.waToken || ""} onChange={set("waToken")} type="password" placeholder="Leave blank to keep unchanged" />
        <Field label="Phone Number ID" value={form.waPhoneNumberId || ""} onChange={set("waPhoneNumberId")} placeholder="123456789012345" />
        <Toggle label="Enable WhatsApp Notifications" description="Send OTP codes and business alerts via WhatsApp" checked={!!form.waEnabled} onChange={tog("waEnabled")} />
      </SettingsSection>

      <SettingsSection title="Firebase Push Notifications" badge="New">
        <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--muted)", background: "var(--canvas)", borderRadius: 8, padding: "10px 14px", lineHeight: 1.6 }}>
          Generate a service account key from <strong>Firebase Console → Project Settings → Service Accounts → Generate new private key</strong>.
          Paste the full JSON content below. Also set the NEXT_PUBLIC_FIREBASE_* variables in the frontend .env.
        </div>
        <Textarea label="Service Account JSON" value={form.firebaseServiceAccountJson || ""} onChange={set("firebaseServiceAccountJson")} placeholder='Leave blank to keep unchanged. Paste full JSON: {"type":"service_account","project_id":"..."}' rows={5} />
        <Toggle label="Enable Firebase Push Notifications" description="Send real-time push notifications to browsers" checked={!!form.fcmEnabled} onChange={tog("fcmEnabled")} />
      </SettingsSection>

      <SettingsSection title="Print & Document Layout" badge="New">
        <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--muted)", background: "var(--canvas)", borderRadius: 8, padding: "10px 14px", lineHeight: 1.6 }}>
          These details appear on all printed documents — quotations, invoices, delivery challans, and purchase orders.
        </div>
        <Textarea
          label="Company Address (printed header)"
          value={form.printCompanyAddress || ""}
          onChange={set("printCompanyAddress")}
          placeholder={"123, Industrial Area, Phase II\nCoimbatore - 641 003, Tamil Nadu\nPhone: +91 98765 43210"}
          rows={3}
        />
        <Textarea
          label="Bank Details (printed footer)"
          value={form.printBankDetails || ""}
          onChange={set("printBankDetails")}
          placeholder={"Bank: State Bank of India\nA/C No: 12345678901\nIFSC: SBIN0001234\nBranch: Main Branch, Coimbatore"}
          rows={3}
        />
        <Textarea
          label="Terms & Conditions"
          value={form.printTerms || ""}
          onChange={set("printTerms")}
          placeholder={"1. Goods once sold will not be taken back.\n2. All disputes subject to local jurisdiction.\n3. Payment due within 30 days of invoice date."}
          rows={3}
        />
        <Field label="Signature Line Label" value={form.printSignatureLabel || ""} onChange={set("printSignatureLabel")} placeholder="Authorised Signatory" />
        <Toggle label="Show Company Logo on Printed Documents" description="Display the logo URL image in the header of all print outputs" checked={form.printShowLogo !== false} onChange={tog("printShowLogo")} />
      </SettingsSection>

      {/* ── Danger Zone ── */}
      {resetDone && (
        <div style={{ background: "#edf8ee", border: "1px solid #c3e6c5", color: "#2e6e34", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          ✓ All data has been cleared. You can now create fresh warehouses and data.
        </div>
      )}
      <div style={{ background: "var(--paper)", border: "1.5px solid #ef444433", borderRadius: 14, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #ef444422" }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#dc2626", textTransform: "uppercase", letterSpacing: 0.6 }}>Danger Zone</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 6 }}>Reset All Data</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, maxWidth: 460 }}>
              Permanently deletes all warehouses, suppliers, buyers, purchase orders, purchase bills, raw cloth, production records, sales orders, employees (except your account), and all inventory. System settings and your admin account are preserved. This cannot be undone.
            </div>
          </div>
          <button
            onClick={() => { setResetModal(true); setResetPhrase(""); setResetError(""); setTimeout(() => resetInputRef.current?.focus(), 50); }}
            style={{ flexShrink: 0, padding: "10px 20px", borderRadius: 9, border: "1.5px solid #dc2626", background: "transparent", color: "#dc2626", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
            Reset All Data
          </button>
        </div>
      </div>

      {/* ── Reset confirmation modal ── */}
      {resetModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) { setResetModal(false); setResetPhrase(""); } }}>
          <div style={{ background: "var(--paper)", borderRadius: 16, padding: 32, width: "100%", maxWidth: 480, border: "1.5px solid #ef444433", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 28, marginBottom: 12, textAlign: "center" }}>⚠️</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: "#dc2626", textAlign: "center" }}>Reset All Data?</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--muted)", lineHeight: 1.7, textAlign: "center" }}>
              This will permanently delete <strong>all warehouses, suppliers, buyers, orders, inventory, employees</strong> and every other record in the system. Your admin account and system settings will be preserved.
            </p>

            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 14px", marginBottom: 20, fontSize: 12, color: "#991b1b", lineHeight: 1.6 }}>
              <strong>Cannot be undone.</strong> Take a database backup before proceeding if you want to recover this data later.
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                Type <strong style={{ color: "#dc2626", fontFamily: "monospace" }}>{RESET_PHRASE}</strong> to confirm
              </span>
              <input
                ref={resetInputRef}
                type="text"
                value={resetPhrase}
                onChange={e => setResetPhrase(e.target.value)}
                placeholder={RESET_PHRASE}
                style={{ padding: "11px 14px", borderRadius: 9, border: `1.5px solid ${resetPhrase === RESET_PHRASE ? "#dc2626" : "var(--line)"}`, background: "var(--input-bg)", color: "var(--ink)", fontSize: 14, fontFamily: "monospace", outline: "none", letterSpacing: 1 }}
              />
            </label>

            {resetError && (
              <div style={{ background: "#fff0ef", border: "1px solid #f1cbc8", color: "#8d3e39", padding: "10px 14px", borderRadius: 9, marginBottom: 16, fontSize: 13 }}>
                {resetError}
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => { setResetModal(false); setResetPhrase(""); setResetError(""); }}
                style={{ flex: 1, padding: "11px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--ink)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetPhrase !== RESET_PHRASE || resetLoading}
                style={{ flex: 1, padding: "11px", borderRadius: 9, border: "none", background: resetPhrase === RESET_PHRASE ? "#dc2626" : "#e5e7eb", color: resetPhrase === RESET_PHRASE ? "#fff" : "#9ca3af", fontWeight: 700, fontSize: 14, cursor: resetPhrase === RESET_PHRASE ? "pointer" : "not-allowed", transition: "all 0.15s" }}>
                {resetLoading ? "Deleting…" : "Confirm Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
