"use client";
import { useState, useRef, useCallback } from "react";
import { applyBrandColors } from "@/app/lib/theme";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import { Lock, AlertTriangle } from "lucide-react";
import Input from "@/app/components/atoms/Input";
import AtomTextarea from "@/app/components/atoms/Textarea";
import Button from "@/app/components/atoms/Button";
import Field from "@/app/components/molecules/Field";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";

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
  tagBrandName?: string; tagTagline?: string; tagShowBarcode?: boolean; tagShowSku?: boolean
  tagShowColor?: boolean; tagShowAgeGroup?: boolean; tagFooterText?: string; tagPrinterWidth?: string
  tagShowPrice?: boolean; tagShowSize?: boolean; tagBrandFontSize?: number; tagLogoSize?: number
  tagLogoData?: string; tagComponentOrder?: string[]
}

interface Props { settings: SettingsData; isSuperAdmin: boolean; onMutate: (q: string, v: Record<string, unknown>) => Promise<void> }

type Tab = "general" | "integrations" | "print" | "danger";
const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "integrations", label: "Integrations" },
  { id: "print", label: "Print & Tags" },
  { id: "danger", label: "Danger Zone" },
];

function Section({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
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

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--muted)", background: "var(--canvas)", borderRadius: 8, padding: "10px 14px", lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

const RESET_PHRASE = "RESET ALL DATA";

const DEFAULT_COMPONENT_ORDER = ["logo", "brand", "barcode", "barcode-text", "item-info", "size", "age-group", "price", "sku", "footer"];

const COMPONENT_LABELS: Record<string, { label: string; desc: string }> = {
  logo:         { label: "Logo",          desc: "Brand logo image" },
  brand:        { label: "Brand Name",    desc: "Brand + tagline text" },
  barcode:      { label: "Barcode",       desc: "Barcode strip graphic" },
  "barcode-text": { label: "Barcode No.", desc: "Barcode number in text" },
  "item-info":  { label: "Item Type",     desc: "Product name + colour" },
  size:         { label: "Size",          desc: "Size label (S/M/L etc.)" },
  "age-group":  { label: "Age Group",     desc: "Kids / Adult etc." },
  price:        { label: "MRP Price",     desc: "Sale price" },
  sku:          { label: "SKU Code",      desc: "Internal SKU reference" },
  footer:       { label: "Footer Text",   desc: "Custom footer line" },
};

export default function Settings({ settings, isSuperAdmin, onMutate }: Props) {
  const [tab, setTab] = useState<Tab>("general");
  const [form, setForm] = useState<SettingsData>({ ...settings });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [resetModal, setResetModal] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetDone, setResetDone] = useState(false);
  const resetInputRef = useRef<HTMLInputElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const tagOrder: string[] = (form.tagComponentOrder && form.tagComponentOrder.length)
    ? form.tagComponentOrder
    : DEFAULT_COMPONENT_ORDER;

  // Toggle a component in/out of the order
  const tagToggle = useCallback((key: string) => {
    setForm(p => {
      const order = (p.tagComponentOrder && p.tagComponentOrder.length) ? p.tagComponentOrder : DEFAULT_COMPONENT_ORDER;
      return { ...p, tagComponentOrder: order.includes(key) ? order.filter(k => k !== key) : [...order, key] };
    });
  }, []);

  // Handle logo upload — resize to ≤150px, convert B&W, store as base64
  const logoInputRef = useRef<HTMLInputElement>(null);
  function handleLogoUpload(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 150;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < d.data.length; i += 4) {
          const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
          d.data[i] = d.data[i + 1] = d.data[i + 2] = g < 128 ? 0 : 255; d.data[i + 3] = 255;
        }
        ctx.putImageData(d, 0, 0);
        setForm(p => ({ ...p, tagLogoData: canvas.toDataURL("image/png") }));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "center", opacity: 0.4 }}><Lock size={40} /></div>
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
      await onMutate(`mutation R($phrase:String!){resetAllData(confirmPhrase:$phrase){ok message}}`, { phrase: resetPhrase });
      setResetDone(true); setResetModal(false); setResetPhrase("");
      showToast("All data has been reset.", "success");
    } catch (e: unknown) { setResetError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setResetLoading(false); }
  }

  async function save() {
    setLoading(true); setError("");
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
          $gstOnPurchases:Boolean,$gstin:String,
          $tagBrand:String,$tagTagline:String,$tagShowBarcode:Boolean,$tagShowSku:Boolean,$tagShowColor:Boolean,$tagShowAgeGroup:Boolean,$tagFooter:String,$tagWidth:String,
          $tagShowPrice:Boolean,$tagShowSize:Boolean,$tagBrandFontSize:Int,$tagLogoSize:Int,$tagLogoData:String,$tagComponentOrder:[String]
        ){updateSystemSettings(
          appName:$appName,appSubtitle:$appSubtitle,companyName:$companyName,companyState:$companyState,currencySymbol:$currencySymbol,taxPercent:$taxPercent,
          primaryColor:$primaryColor,accentColor:$accentColor,
          smtpHost:$smtpHost,smtpPort:$smtpPort,smtpUser:$smtpUser,smtpPassword:$smtpPassword,smtpFromEmail:$smtpFromEmail,emailEnabled:$emailEnabled,
          twilioAccountSid:$twilioSid,twilioAuthToken:$twilioToken,twilioFromNumber:$twilioFrom,smsEnabled:$smsEnabled,
          waToken:$waToken,waPhoneNumberId:$waPhoneNumberId,waEnabled:$waEnabled,
          firebaseServiceAccountJson:$firebaseJson,fcmEnabled:$fcmEnabled,
          otpExpiryMinutes:$otpExpiry,allowOtpLogin:$allowOtp,
          printCompanyAddress:$printAddr,printBankDetails:$printBank,printTerms:$printTerms,printSignatureLabel:$printSig,printShowLogo:$printLogo,
          gstOnPurchases:$gstOnPurchases,gstin:$gstin,
          tagBrandName:$tagBrand,tagTagline:$tagTagline,tagShowBarcode:$tagShowBarcode,tagShowSku:$tagShowSku,tagShowColor:$tagShowColor,tagShowAgeGroup:$tagShowAgeGroup,tagFooterText:$tagFooter,tagPrinterWidth:$tagWidth,
          tagShowPrice:$tagShowPrice,tagShowSize:$tagShowSize,tagBrandFontSize:$tagBrandFontSize,tagLogoSize:$tagLogoSize,tagLogoData:$tagLogoData,tagComponentOrder:$tagComponentOrder
        ){settings{id}}}`,
        {
          appName: form.appName, appSubtitle: form.appSubtitle,
          companyName: form.companyName, companyState: form.companyState || undefined,
          currencySymbol: form.currencySymbol,
          taxPercent: form.taxPercent ? +form.taxPercent : undefined,
          primaryColor: form.primaryColor || undefined, accentColor: form.accentColor || undefined,
          smtpHost: form.smtpHost, smtpPort: form.smtpPort ? +form.smtpPort : undefined,
          smtpUser: form.smtpUser, smtpPassword: form.smtpPassword || undefined,
          smtpFromEmail: form.smtpFromEmail, emailEnabled: form.emailEnabled,
          twilioSid: form.twilioAccountSid, twilioToken: form.twilioAuthToken,
          twilioFrom: form.twilioFromNumber, smsEnabled: form.smsEnabled,
          waToken: form.waToken || undefined, waPhoneNumberId: form.waPhoneNumberId || undefined, waEnabled: form.waEnabled,
          firebaseJson: form.firebaseServiceAccountJson || undefined, fcmEnabled: form.fcmEnabled,
          otpExpiry: form.otpExpiryMinutes ? +form.otpExpiryMinutes : undefined, allowOtp: form.allowOtpLogin,
          printAddr: form.printCompanyAddress || undefined, printBank: form.printBankDetails || undefined,
          printTerms: form.printTerms || undefined, printSig: form.printSignatureLabel || undefined, printLogo: form.printShowLogo,
          gstOnPurchases: form.gstOnPurchases, gstin: form.gstin || undefined,
          tagBrand: form.tagBrandName || undefined, tagTagline: form.tagTagline || undefined,
          tagShowBarcode: form.tagShowBarcode, tagShowSku: form.tagShowSku,
          tagShowColor: form.tagShowColor, tagShowAgeGroup: form.tagShowAgeGroup,
          tagFooter: form.tagFooterText || undefined, tagWidth: form.tagPrinterWidth || undefined,
          tagShowPrice: form.tagShowPrice, tagShowSize: form.tagShowSize,
          tagBrandFontSize: form.tagBrandFontSize ? +form.tagBrandFontSize : undefined,
          tagLogoSize: form.tagLogoSize ? +form.tagLogoSize : undefined,
          tagLogoData: form.tagLogoData || undefined,
          tagComponentOrder: form.tagComponentOrder,
        }
      );
      applyBrandColors({ primaryColor: form.primaryColor, accentColor: form.accentColor });
      showToast("Settings saved.", "success");
    } catch (e: unknown) { setError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 24, maxWidth: 860 }}>
      {/* ── Tab bar + Save ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 4, background: "var(--canvas)", borderRadius: 10, padding: 4, border: "1px solid var(--line)" }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "8px 18px", borderRadius: 7, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600, transition: "all 0.15s",
                background: tab === t.id ? "var(--paper)" : "transparent",
                color: tab === t.id ? (t.id === "danger" ? "#dc2626" : "var(--primary)") : "var(--muted)",
                boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab !== "danger" && (
          <Button onClick={save} disabled={loading} style={{ padding: "10px 26px" }}>
            {loading ? "Saving…" : "Save Changes"}
          </Button>
        )}
      </div>

      <ErrorBanner msg={error} />

      {/* ── General ── */}
      {tab === "general" && (
        <>
          <Section title="App & Company">
            <Field label="App Name">
              <Input value={form.appName || ""} onChange={e => set("appName")(e.target.value)} />
            </Field>
            <Field label="App Subtitle">
              <Input value={form.appSubtitle || ""} onChange={e => set("appSubtitle")(e.target.value)} />
            </Field>
            <Field label="Company Name">
              <Input value={form.companyName || ""} onChange={e => set("companyName")(e.target.value)} />
            </Field>
            <Field label="Company State">
              <Input value={form.companyState || ""} onChange={e => set("companyState")(e.target.value)} placeholder="e.g. Tamil Nadu (for CGST/SGST vs IGST)" />
            </Field>
            <Field label="Currency Symbol">
              <Input value={form.currencySymbol || ""} onChange={e => set("currencySymbol")(e.target.value)} />
            </Field>
            <Field label="Default GST / Tax %">
              <Input type="number" value={String(form.taxPercent ?? "")} onChange={e => set("taxPercent")(e.target.value)} />
            </Field>
            <Field label="Company GSTIN">
              <Input value={form.gstin || ""} onChange={e => set("gstin")(e.target.value)} placeholder="e.g. 33AABCU9603R1ZX" />
            </Field>
            <Toggle
              label="Apply GST on Purchase Bills (Input Tax Credit)"
              description="When ON, each bill item shows a GST % field. Tax is split as CGST+SGST (intra-state) or IGST (inter-state) based on supplier state vs company state."
              checked={!!form.gstOnPurchases}
              onChange={tog("gstOnPurchases")}
            />
            <Field label="OTP Expiry (minutes)">
              <Input type="number" value={String(form.otpExpiryMinutes ?? "")} onChange={e => set("otpExpiryMinutes")(e.target.value)} />
            </Field>
            <Toggle label="Allow OTP Login" description="Users can log in via Email, SMS, or WhatsApp one-time password" checked={!!form.allowOtpLogin} onChange={tog("allowOtpLogin")} />
          </Section>

          {/* Brand Colors */}
          <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)", textTransform: "uppercase", letterSpacing: 0.6 }}>Brand Colors</span>
              <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: "#818cf818", color: "#6366f1", border: "1px solid #818cf833" }}>Live Preview</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
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
            <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--line)", display: "flex", height: 64 }}>
              <div style={{ background: form.primaryColor || "#173a2c", width: 180, display: "flex", alignItems: "center", paddingLeft: 16, gap: 10, flexShrink: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>A</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>Sidebar</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>Navigation</div>
                </div>
              </div>
              <div style={{ flex: 1, background: "var(--canvas)", display: "flex", alignItems: "center", gap: 10, paddingLeft: 16 }}>
                <button style={{ background: form.primaryColor || "#173a2c", color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "default" }}>Save</button>
                <span style={{ background: form.accentColor || "#d4932f", color: "#fff", borderRadius: 99, fontSize: 10, fontWeight: 700, padding: "3px 9px" }}>Badge</span>
                <span style={{ padding: "3px 9px", borderRadius: 99, border: `1.5px solid ${form.primaryColor || "#173a2c"}`, color: form.primaryColor || "#173a2c", fontSize: 10, fontWeight: 600 }}>Outline</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Integrations ── */}
      {tab === "integrations" && (
        <>
          <Section title="Email — SMTP">
            <Field label="SMTP Host">
              <Input value={form.smtpHost || ""} onChange={e => set("smtpHost")(e.target.value)} placeholder="smtp.gmail.com" />
            </Field>
            <Field label="SMTP Port">
              <Input type="number" value={String(form.smtpPort ?? "")} onChange={e => set("smtpPort")(e.target.value)} placeholder="587" />
            </Field>
            <Field label="SMTP Username">
              <Input value={form.smtpUser || ""} onChange={e => set("smtpUser")(e.target.value)} placeholder="you@gmail.com" />
            </Field>
            <Field label="SMTP Password">
              <Input type="password" value={form.smtpPassword || ""} onChange={e => set("smtpPassword")(e.target.value)} placeholder="App password" />
            </Field>
            <Field label="From Email">
              <Input type="email" value={form.smtpFromEmail || ""} onChange={e => set("smtpFromEmail")(e.target.value)} placeholder="noreply@yourcompany.com" />
            </Field>
            <Toggle label="Enable Email Notifications" description="Send OTP codes and alerts via email" checked={!!form.emailEnabled} onChange={tog("emailEnabled")} />
          </Section>

          <Section title="SMS — Twilio">
            <Field label="Account SID">
              <Input value={form.twilioAccountSid || ""} onChange={e => set("twilioAccountSid")(e.target.value)} placeholder="ACxxxxxxxx" />
            </Field>
            <Field label="Auth Token">
              <Input type="password" value={form.twilioAuthToken || ""} onChange={e => set("twilioAuthToken")(e.target.value)} placeholder="Leave blank to keep unchanged" />
            </Field>
            <Field label="From Number">
              <Input value={form.twilioFromNumber || ""} onChange={e => set("twilioFromNumber")(e.target.value)} placeholder="+91..." />
            </Field>
            <Toggle label="Enable SMS OTP" description="Send one-time passwords via SMS" checked={!!form.smsEnabled} onChange={tog("smsEnabled")} />
          </Section>

          <Section title="WhatsApp — Meta Business API" badge="New">
            <InfoBox>Get your credentials from <strong>Meta Business Manager → WhatsApp → API Setup</strong>. The access token and Phone Number ID are shown on the app dashboard.</InfoBox>
            <Field label="Access Token">
              <Input type="password" value={form.waToken || ""} onChange={e => set("waToken")(e.target.value)} placeholder="Leave blank to keep unchanged" />
            </Field>
            <Field label="Phone Number ID">
              <Input value={form.waPhoneNumberId || ""} onChange={e => set("waPhoneNumberId")(e.target.value)} placeholder="123456789012345" />
            </Field>
            <Toggle label="Enable WhatsApp Notifications" description="Send OTP codes and business alerts via WhatsApp" checked={!!form.waEnabled} onChange={tog("waEnabled")} />
          </Section>

          <Section title="Firebase Push Notifications" badge="New">
            <InfoBox>Generate a service account key from <strong>Firebase Console → Project Settings → Service Accounts → Generate new private key</strong>. Paste the full JSON content below.</InfoBox>
            <Field label="Service Account JSON" style={{ gridColumn: "1 / -1" }}>
              <AtomTextarea
                value={form.firebaseServiceAccountJson || ""}
                onChange={e => set("firebaseServiceAccountJson")(e.target.value)}
                placeholder='Leave blank to keep unchanged. Paste full JSON: {"type":"service_account","project_id":"..."}'
                rows={5}
                style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.5 }}
              />
            </Field>
            <Toggle label="Enable Firebase Push Notifications" description="Send real-time push notifications to browsers" checked={!!form.fcmEnabled} onChange={tog("fcmEnabled")} />
          </Section>
        </>
      )}

      {/* ── Print & Tags ── */}
      {tab === "print" && (
        <>
          <Section title="Print & Document Layout" badge="New">
            <InfoBox>These details appear on all printed documents — quotations, invoices, delivery challans, and purchase orders.</InfoBox>
            <Field label="Company Address (printed header)" style={{ gridColumn: "1 / -1" }}>
              <AtomTextarea
                value={form.printCompanyAddress || ""}
                onChange={e => set("printCompanyAddress")(e.target.value)}
                placeholder={"123, Industrial Area, Phase II\nCoimbatore - 641 003, Tamil Nadu\nPhone: +91 98765 43210"}
                rows={3}
              />
            </Field>
            <Field label="Bank Details (printed footer)" style={{ gridColumn: "1 / -1" }}>
              <AtomTextarea
                value={form.printBankDetails || ""}
                onChange={e => set("printBankDetails")(e.target.value)}
                placeholder={"Bank: State Bank of India\nA/C No: 12345678901\nIFSC: SBIN0001234\nBranch: Main Branch, Coimbatore"}
                rows={3}
              />
            </Field>
            <Field label="Terms & Conditions" style={{ gridColumn: "1 / -1" }}>
              <AtomTextarea
                value={form.printTerms || ""}
                onChange={e => set("printTerms")(e.target.value)}
                placeholder={"1. Goods once sold will not be taken back.\n2. All disputes subject to local jurisdiction.\n3. Payment due within 30 days of invoice date."}
                rows={3}
              />
            </Field>
            <Field label="Signature Line Label">
              <Input value={form.printSignatureLabel || ""} onChange={e => set("printSignatureLabel")(e.target.value)} placeholder="Authorised Signatory" />
            </Field>
            <Toggle label="Show Company Logo on Printed Documents" description="Display the logo URL image in the header of all print outputs" checked={form.printShowLogo !== false} onChange={tog("printShowLogo")} />
          </Section>

          {/* ── Tag Designer ── */}
          <div style={{ gridColumn: "1 / -1", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>Product Tag Designer</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Drag rows to reorder · toggle to include/exclude · live preview on right</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>

              {/* ── Left: controls ── */}
              <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Paper & Text</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    {(["58mm","80mm"] as const).map(w => (
                      <button key={w} onClick={() => setForm(p => ({ ...p, tagPrinterWidth: w }))}
                        style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1.5px solid", cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all 0.15s",
                          borderColor: (form.tagPrinterWidth || "58mm") === w ? "var(--brand)" : "var(--line)",
                          background: (form.tagPrinterWidth || "58mm") === w ? "color-mix(in srgb,var(--brand) 10%,transparent)" : "var(--canvas)",
                          color: (form.tagPrinterWidth || "58mm") === w ? "var(--brand)" : "var(--ink)" }}>
                        {w}
                      </button>
                    ))}
                  </div>
                  <Input value={form.tagBrandName || ""} onChange={e => set("tagBrandName")(e.target.value)} placeholder={form.companyName || "Sri Warehouse"} style={{ marginBottom: 8 }} />
                  <Input value={form.tagTagline || ""} onChange={e => set("tagTagline")(e.target.value)} placeholder="Tagline (e.g. Quality Garments)" style={{ marginBottom: 8 }} />
                  <Input value={form.tagFooterText || ""} onChange={e => set("tagFooterText")(e.target.value)} placeholder="Footer (e.g. 100% Cotton · Made in India)" />
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Brand Font Size</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="range" min={8} max={22} step={1}
                      value={form.tagBrandFontSize ?? 14}
                      onChange={e => setForm(p => ({ ...p, tagBrandFontSize: +e.target.value }))}
                      style={{ flex: 1, accentColor: "var(--brand)" }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)", width: 30 }}>{form.tagBrandFontSize ?? 14}pt</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Tag Logo</div>
                  {form.tagLogoData ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <img src={form.tagLogoData} alt="tag logo" style={{ height: 32, borderRadius: 4, border: "1px solid var(--line)" }} />
                      <button onClick={() => setForm(p => ({ ...p, tagLogoData: "" }))}
                        style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}>Remove</button>
                    </div>
                  ) : (
                    <button onClick={() => logoInputRef.current?.click()}
                      style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "1.5px dashed var(--line)", background: "var(--canvas)", color: "var(--muted)", fontSize: 12, cursor: "pointer" }}>
                      + Upload B&W Logo
                    </button>
                  )}
                  <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }} />
                  {form.tagLogoData && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Logo height: {form.tagLogoSize ?? 30}px</div>
                      <input type="range" min={16} max={60} step={2}
                        value={form.tagLogoSize ?? 30}
                        onChange={e => setForm(p => ({ ...p, tagLogoSize: +e.target.value }))}
                        style={{ width: "100%", accentColor: "var(--brand)" }} />
                    </div>
                  )}
                </div>
              </div>

              {/* ── Center: drag-and-drop order ── */}
              <div style={{ flex: "1 1 200px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Component Order</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {tagOrder.map((key, idx) => {
                    const info = COMPONENT_LABELS[key];
                    if (!info) return null;
                    return (
                      <div key={key} draggable
                        onDragStart={() => setDragIdx(idx)}
                        onDragOver={e => { e.preventDefault(); }}
                        onDrop={() => {
                          if (dragIdx === null || dragIdx === idx) return;
                          const next = [...tagOrder];
                          const [moved] = next.splice(dragIdx, 1);
                          next.splice(idx, 0, moved);
                          setForm(p => ({ ...p, tagComponentOrder: next }));
                          setDragIdx(null);
                        }}
                        onDragEnd={() => setDragIdx(null)}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line)",
                          background: dragIdx === idx ? "color-mix(in srgb,var(--brand) 8%,transparent)" : "var(--canvas)",
                          cursor: "grab", userSelect: "none", transition: "background 0.1s",
                        }}>
                        <span style={{ color: "var(--muted)", fontSize: 13 }}>⠿</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{info.label}</div>
                          <div style={{ fontSize: 10, color: "var(--muted)" }}>{info.desc}</div>
                        </div>
                        <button onClick={() => tagToggle(key)}
                          style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "none", cursor: "pointer",
                            background: "color-mix(in srgb,#ef4444 12%,transparent)", color: "#ef4444", fontWeight: 600 }}>
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
                {/* Add back removed components */}
                {DEFAULT_COMPONENT_ORDER.filter(k => !tagOrder.includes(k)).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Hidden (click to re-add):</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {DEFAULT_COMPONENT_ORDER.filter(k => !tagOrder.includes(k)).map(k => (
                        <button key={k} onClick={() => tagToggle(k)}
                          style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px dashed var(--line)", background: "var(--canvas)", color: "var(--muted)", cursor: "pointer" }}>
                          + {COMPONENT_LABELS[k]?.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button onClick={() => setForm(p => ({ ...p, tagComponentOrder: [...DEFAULT_COMPONENT_ORDER] }))}
                  style={{ marginTop: 10, fontSize: 11, padding: "4px 12px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--muted)", cursor: "pointer" }}>
                  Reset to default order
                </button>
              </div>

              {/* ── Right: live tag preview ── */}
              <div style={{ flex: "0 0 auto" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Preview</div>
                <div style={{
                  width: (form.tagPrinterWidth || "58mm") === "80mm" ? 150 : 108,
                  border: "1.5px solid #222", borderRadius: 6, padding: "6px 8px",
                  background: "#fff", color: "#111", fontFamily: "Arial, sans-serif",
                  display: "flex", flexDirection: "column", gap: 3, transition: "width 0.2s",
                }}>
                  {tagOrder.map(key => {
                    const fs = form.tagBrandFontSize ?? 14;
                    const logoH = form.tagLogoSize ?? 30;
                    if (key === "logo" && form.tagLogoData) return (
                      <img key={key} src={form.tagLogoData} alt="" style={{ height: logoH, objectFit: "contain", alignSelf: "center" }} />
                    );
                    if (key === "brand") return (
                      <div key={key}>
                        <div style={{ fontSize: fs * 0.6, fontWeight: 700, color: "#333", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          {form.tagBrandName || form.companyName || "Brand Name"}
                        </div>
                        {form.tagTagline && <div style={{ fontSize: 7, color: "#888" }}>{form.tagTagline}</div>}
                      </div>
                    );
                    if (key === "barcode") return (
                      <div key={key} style={{ background: "#f0f0f0", height: 20, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="70" height="14" viewBox="0 0 70 14">
                          {Array.from({ length: 18 }).map((_, i) => (
                            <rect key={i} x={i * 4} y={0} width={i % 3 === 0 ? 3 : 2} height={14} fill="#000" />
                          ))}
                        </svg>
                      </div>
                    );
                    if (key === "barcode-text") return <div key={key} style={{ fontSize: 7, fontFamily: "monospace", textAlign: "center", color: "#555" }}>FP-20260001</div>;
                    if (key === "item-info") return <div key={key} style={{ fontSize: 9, fontWeight: 700, color: "#111" }}>Cotton Shirt · Red</div>;
                    if (key === "size") return <div key={key} style={{ fontSize: 8, color: "#444" }}>Size: M</div>;
                    if (key === "age-group") return <div key={key} style={{ fontSize: 8, color: "#444" }}>Adult</div>;
                    if (key === "price") return (
                      <div key={key} style={{ borderTop: "1px solid #ddd", paddingTop: 3, marginTop: 2 }}>
                        <div style={{ fontSize: 7, color: "#555" }}>MRP</div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: "#111", lineHeight: 1 }}>₹499</div>
                      </div>
                    );
                    if (key === "sku") return <div key={key} style={{ fontSize: 7, fontFamily: "monospace", color: "#666" }}>SKU: FP-001</div>;
                    if (key === "footer" && form.tagFooterText) return <div key={key} style={{ fontSize: 7, color: "#999", textAlign: "center" }}>{form.tagFooterText}</div>;
                    return null;
                  })}
                </div>
              </div>

            </div>
          </div>
        </>
      )}

      {/* ── Danger Zone ── */}
      {tab === "danger" && (
        <>
          {resetDone && (
            <div style={{ background: "#edf8ee", border: "1px solid #c3e6c5", color: "#2e6e34", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
              ✓ All data has been cleared. You can now create fresh warehouses and data.
            </div>
          )}
          <div style={{ background: "var(--paper)", border: "1.5px solid #ef444433", borderRadius: 14, padding: 24 }}>
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
              <Button
                variant="danger"
                onClick={() => { setResetModal(true); setResetPhrase(""); setResetError(""); setTimeout(() => resetInputRef.current?.focus(), 50); }}
                style={{ flexShrink: 0, whiteSpace: "nowrap", background: "transparent", color: "#dc2626", border: "1.5px solid #dc2626" }}
              >
                Reset All Data
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Reset confirmation modal ── */}
      {resetModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) { setResetModal(false); setResetPhrase(""); } }}>
          <div style={{ background: "var(--paper)", borderRadius: 16, padding: 32, width: "100%", maxWidth: 480, border: "1.5px solid #ef444433", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "center", color: "#dc2626" }}><AlertTriangle size={28} /></div>
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
            <div style={{ marginBottom: 16 }}><ErrorBanner msg={resetError} /></div>
            <div style={{ display: "flex", gap: 12 }}>
              <Button variant="secondary" onClick={() => { setResetModal(false); setResetPhrase(""); setResetError(""); }} style={{ flex: 1, padding: "11px" }}>Cancel</Button>
              <Button
                variant={resetPhrase === RESET_PHRASE ? "danger" : "secondary"}
                onClick={handleReset}
                disabled={resetPhrase !== RESET_PHRASE || resetLoading}
                style={{ flex: 1, padding: "11px" }}
              >
                {resetLoading ? "Deleting…" : "Confirm Reset"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
