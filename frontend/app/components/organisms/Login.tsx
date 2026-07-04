"use client";
import { useState, useEffect } from "react";
import { Eye, EyeOff, Mail, MessageSquare, ArrowLeft, Loader2 } from "lucide-react";

interface Props {
  onLogin: (token: string, refreshToken: string) => void;
}

type OTPChannel = "EMAIL" | "SMS" | "WHATSAPP";

const API = process.env.NEXT_PUBLIC_GRAPHQL_URL || "http://localhost:8000/graphql/";

async function gql(query: string, variables: Record<string, unknown> = {}) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors?.length) throw new Error(j.errors[0].message);
  return j.data;
}

function detectType(v: string): string {
  if (v.includes("@")) return "email";
  const digits = v.replace(/[\s+\-()]/g, "");
  if (/^\d{7,}$/.test(digits)) return "phone";
  return "username";
}

function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  );
}

const CHANNELS: { id: OTPChannel; label: string; icon: React.ReactNode; color: string }[] = [
  { id: "EMAIL",    label: "Email",     icon: <Mail size={18} />,        color: "#6366f1" },
  { id: "WHATSAPP", label: "WhatsApp",  icon: <WaIcon />,                color: "#25d366" },
  { id: "SMS",      label: "SMS",       icon: <MessageSquare size={17} />, color: "#f59e0b" },
];

const I: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 10,
  border: "1.5px solid var(--line)", background: "var(--input-bg)",
  color: "var(--ink)", fontSize: 14.5, outline: "none", boxSizing: "border-box",
  transition: "border-color 0.15s",
};

const BTN: React.CSSProperties = {
  width: "100%", padding: "13px", borderRadius: 10, border: "none",
  background: "var(--primary)", color: "#fff", fontWeight: 700,
  fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center",
  justifyContent: "center", gap: 8,
};

const LBL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "var(--muted)",
  letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6, display: "block",
};

export default function Login({ onLogin }: Props) {
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [channel, setChannel] = useState<OTPChannel>("WHATSAPP");
  const [otpStep, setOtpStep] = useState<"request" | "verify">("request");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [brandName, setBrandName] = useState("GarmentFlow");
  const [brandSubtitle, setBrandSubtitle] = useState("Warehouse ERP");

  useEffect(() => {
    gql(`{ systemSettings { appName appSubtitle } }`)
      .then(d => {
        if (d?.systemSettings?.appName) setBrandName(d.systemSettings.appName);
        if (d?.systemSettings?.appSubtitle) setBrandSubtitle(d.systemSettings.appSubtitle);
      })
      .catch(() => {});
  }, []);

  const identType = detectType(identifier);
  const identHint: Record<string, string> = {
    email: "✓ Email detected",
    phone: "✓ Phone detected",
    username: identifier ? "✓ Username" : "",
  };

  function switchMode(m: "password" | "otp") {
    setMode(m); setError(""); setInfo(""); setOtpStep("request"); setOtpCode("");
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) return;
    setError(""); setLoading(true);
    try {
      const d = await gql(
        `mutation L($id:String!,$pw:String!){loginWithCredentials(identifier:$id,password:$pw){token refreshToken}}`,
        { id: identifier.trim(), pw: password }
      );
      onLogin(d.loginWithCredentials.token, d.loginWithCredentials.refreshToken ?? "");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally { setLoading(false); }
  }

  async function handleRequestOTP(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) return;
    setError(""); setLoading(true);
    try {
      await gql(
        `mutation R($u:String!,$c:String!){requestOtp(username:$u,purpose:"LOGIN",channel:$c){emailSent smsSent waSent message}}`,
        { u: identifier.trim(), c: channel }
      );
      const dest = channel === "EMAIL" ? "email" : channel === "WHATSAPP" ? "WhatsApp" : "SMS";
      setInfo(`OTP sent to your registered ${dest}. Check and enter the 6-digit code below.`);
      setOtpStep("verify");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally { setLoading(false); }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const d = await gql(
        `mutation V($u:String!,$c:String!){verifyOtpLogin(username:$u,code:$c){token refreshToken}}`,
        { u: identifier.trim(), c: otpCode }
      );
      onLogin(d.verifyOtpLogin.token, d.verifyOtpLogin.refreshToken ?? "");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid OTP");
    } finally { setLoading(false); }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--canvas)", padding: "24px 16px", width: "100%",
    }}>
      <div style={{
        background: "var(--paper)", borderRadius: 22, width: "clamp(320px, 65%, 720px)",
        boxShadow: "0 12px 56px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.06)",
        border: "1px solid var(--line)", overflow: "hidden",
      }}>

        {/* ── Header band ── */}
        <div style={{
          padding: "30px 32px 26px",
          background: "linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 70%, #000) 100%)",
        }}>
          {/* Logo row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
                <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
                <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: -0.4, lineHeight: 1.2 }}>
                {brandName}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
                {brandSubtitle || "Warehouse ERP"}
              </div>
            </div>
          </div>

          {/* Mode toggle */}
          <div style={{ display: "flex", background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 3, gap: 3 }}>
            {(["password", "otp"] as const).map(m => (
              <button key={m} type="button" onClick={() => switchMode(m)} style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: mode === m ? 700 : 400,
                background: mode === m ? "rgba(255,255,255,0.95)" : "transparent",
                color: mode === m ? "var(--primary)" : "rgba(255,255,255,0.75)",
                boxShadow: mode === m ? "0 1px 6px rgba(0,0,0,0.15)" : "none",
                transition: "all 0.18s",
              }}>
                {m === "password" ? "Password" : "Login with OTP"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Form area ── */}
        <div style={{ padding: "28px 32px 32px" }}>

          {/* Alerts */}
          {error && (
            <div style={{
              background: "#fff1f0", border: "1px solid #ffc5c2", color: "#8d3e39",
              borderRadius: 10, padding: "11px 14px", fontSize: 13, marginBottom: 20,
              lineHeight: 1.5, display: "flex", gap: 8, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>✕</span>
              <span>{error}</span>
            </div>
          )}
          {info && (
            <div style={{
              background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d",
              borderRadius: 10, padding: "11px 14px", fontSize: 13, marginBottom: 20, lineHeight: 1.5,
            }}>{info}</div>
          )}

          {/* Shared identifier field */}
          {otpStep !== "verify" && (
            <div style={{ marginBottom: 18 }}>
              <label style={LBL}>
                {identType === "email" ? "Email address" : identType === "phone" ? "Phone number" : "Identifier"}
              </label>
              <input
                style={I}
                placeholder="Username, email, or phone"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                autoFocus
                autoComplete="username"
              />
              {identHint[identType] && (
                <span style={{ fontSize: 11, color: "var(--primary)", marginTop: 5, display: "block", fontWeight: 600 }}>
                  {identHint[identType]}
                </span>
              )}
            </div>
          )}

          {/* PASSWORD form */}
          {mode === "password" && (
            <form onSubmit={handlePasswordLogin} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <div style={{ marginBottom: 22 }}>
                <label style={LBL}>Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    style={{ ...I, paddingRight: 48 }}
                    type={showPass ? "text" : "password"}
                    placeholder="Your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPass(p => !p)} style={{
                    position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: "var(--muted)",
                    display: "flex", alignItems: "center", padding: 2,
                  }}>
                    {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              <button style={BTN} disabled={loading || !identifier.trim() || !password}>
                {loading ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Signing in…</> : "Sign in"}
              </button>
            </form>
          )}

          {/* OTP — request step */}
          {mode === "otp" && otpStep === "request" && (
            <form onSubmit={handleRequestOTP} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <div style={{ marginBottom: 22 }}>
                <label style={LBL}>Send OTP via</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {CHANNELS.map(ch => (
                    <button key={ch.id} type="button" onClick={() => setChannel(ch.id)} style={{
                      padding: "12px 8px", borderRadius: 12, cursor: "pointer",
                      border: channel === ch.id ? `2px solid ${ch.color}` : "1.5px solid var(--line)",
                      background: channel === ch.id ? `${ch.color}12` : "var(--input-bg)",
                      color: channel === ch.id ? ch.color : "var(--muted)",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                      transition: "all 0.15s", fontWeight: channel === ch.id ? 700 : 400,
                    }}>
                      <span style={{ color: channel === ch.id ? ch.color : "var(--muted)" }}>{ch.icon}</span>
                      <span style={{ fontSize: 11.5, letterSpacing: 0.2 }}>{ch.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button style={BTN} disabled={loading || !identifier.trim()}>
                {loading
                  ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Sending…</>
                  : `Send OTP via ${CHANNELS.find(c => c.id === channel)?.label}`}
              </button>
            </form>
          )}

          {/* OTP — verify step */}
          {mode === "otp" && otpStep === "verify" && (
            <form onSubmit={handleVerifyOTP} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <div style={{ marginBottom: 22 }}>
                <label style={LBL}>6-digit OTP code</label>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*"
                  style={{
                    ...I, letterSpacing: 14, fontSize: 28, textAlign: "center",
                    fontWeight: 800, fontFamily: "monospace", padding: "14px",
                  }}
                  placeholder="------" value={otpCode} maxLength={6}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  required autoFocus
                />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, textAlign: "center" }}>
                  Sent to your {channel === "EMAIL" ? "email" : channel === "WHATSAPP" ? "WhatsApp" : "SMS"}
                </div>
              </div>
              <button style={BTN} disabled={loading || otpCode.length < 6}>
                {loading
                  ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Verifying…</>
                  : "Verify & Sign in"}
              </button>
              <button type="button" onClick={() => { setOtpStep("request"); setOtpCode(""); setInfo(""); setError(""); }}
                style={{ marginTop: 10, width: "100%", padding: "11px", borderRadius: 10, border: "1.5px solid var(--line)", background: "transparent", color: "var(--muted)", fontSize: 13.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <ArrowLeft size={14} /> Back / Resend OTP
              </button>
            </form>
          )}

          <p style={{ textAlign: "center", marginTop: 24, fontSize: 11.5, color: "var(--muted)" }}>
            {brandName} · Secure Login
          </p>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
