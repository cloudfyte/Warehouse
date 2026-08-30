"use client";
import { useState, useEffect, type ReactNode } from "react";
import { Eye, EyeOff, LogIn, Send, ArrowLeft, Loader2, Mail, MessageSquare } from "lucide-react";
import { friendlyError } from "@/app/lib/errors";

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
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

function GarmentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="26" height="26">
      <path d="M6 2L2 7l4 2v11h12V9l4-2-4-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 2c0 2.761 2.686 5 6 5s6-2.239 6-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const CHANNELS: { id: OTPChannel; label: string; icon: ReactNode; color: string }[] = [
  { id: "EMAIL",    label: "Email",    icon: <Mail size={17} />,     color: "#5d5fef" },
  { id: "WHATSAPP", label: "WhatsApp", icon: <WaIcon />,             color: "#25d366" },
  { id: "SMS",      label: "SMS",      icon: <MessageSquare size={16} />, color: "#f59e0b" },
];

// Shared style tokens
const I: React.CSSProperties = {
  width: "100%", padding: "13px 44px 13px 42px",
  borderRadius: 12, border: "1.5px solid var(--border, #e5e7eb)",
  background: "var(--input-bg, #fff)", color: "var(--text, #111827)",
  fontSize: 14.5, outline: "none", fontFamily: "inherit",
  transition: "border-color 0.15s, box-shadow 0.15s", boxSizing: "border-box" as const,
};

const LBL: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700,
  color: "var(--muted, #6b7280)", letterSpacing: 0.5,
  textTransform: "uppercase" as const, marginBottom: 7,
};

const ERR: React.CSSProperties = {
  fontSize: 12, color: "#e53e3e", marginTop: 5, display: "block", fontWeight: 500,
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
  const [identErr, setIdentErr] = useState("");
  const [passErr, setPassErr] = useState("");
  const [otpErr, setOtpErr] = useState("");
  const [info, setInfo] = useState("");
  const [brandName, setBrandName] = useState("GarmentFlow");
  const [brandSubtitle, setBrandSubtitle] = useState("Warehouse ERP");

  useEffect(() => {
    // publicSettings, not systemSettings: the latter is @login_required, so this
    // request always failed here and the customer's own login page fell back to
    // the stock "GarmentFlow" branding.
    gql(`{ publicSettings { appName appSubtitle } }`)
      .then(d => {
        if (d?.publicSettings?.appName) setBrandName(d.publicSettings.appName);
        if (d?.publicSettings?.appSubtitle) setBrandSubtitle(d.publicSettings.appSubtitle);
      })
      .catch(() => {});
  }, []);

  const identType = detectType(identifier);
  const identHint: Record<string, string> = {
    email: "✓ Email detected",
    phone: "✓ Phone detected",
    username: identifier ? "✓ Username" : "",
  };

  function clearFieldErrors() { setIdentErr(""); setPassErr(""); setOtpErr(""); }

  function switchMode(m: "password" | "otp") {
    setMode(m); setError(""); setInfo(""); setOtpStep("request"); setOtpCode(""); clearFieldErrors();
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setIdentErr(""); setPassErr(""); setError("");
    let ok = true;
    if (!identifier.trim()) { setIdentErr("Please enter your username, email or phone."); ok = false; }
    if (!password) { setPassErr("Please enter your password."); ok = false; }
    if (!ok) return;
    setLoading(true);
    try {
      const d = await gql(
        `mutation L($id:String!,$pw:String!){loginWithCredentials(identifier:$id,password:$pw){token refreshToken}}`,
        { id: identifier.trim(), pw: password }
      );
      onLogin(d.loginWithCredentials.token, d.loginWithCredentials.refreshToken ?? "");
    } catch (err: unknown) {
      setError(friendlyError(err));
    } finally { setLoading(false); }
  }

  async function handleRequestOTP(e: React.FormEvent) {
    e.preventDefault();
    setIdentErr(""); setError("");
    if (!identifier.trim()) { setIdentErr("Please enter your username, email or phone."); return; }
    setLoading(true);
    try {
      await gql(
        `mutation R($u:String!,$c:String!){requestOtp(username:$u,purpose:"LOGIN",channel:$c){emailSent smsSent waSent message}}`,
        { u: identifier.trim(), c: channel }
      );
      const dest = channel === "EMAIL" ? "email" : channel === "WHATSAPP" ? "WhatsApp" : "SMS";
      setInfo(`OTP sent to your registered ${dest}. Enter the 6-digit code below.`);
      setOtpStep("verify");
    } catch (err: unknown) {
      setError(friendlyError(err));
    } finally { setLoading(false); }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setOtpErr(""); setError("");
    if (!otpCode.trim()) { setOtpErr("Please enter the OTP code sent to you."); return; }
    setLoading(true);
    try {
      const d = await gql(
        `mutation V($u:String!,$c:String!){verifyOtpLogin(username:$u,code:$c){token refreshToken}}`,
        { u: identifier.trim(), c: otpCode }
      );
      onLogin(d.verifyOtpLogin.token, d.verifyOtpLogin.refreshToken ?? "");
    } catch (err: unknown) {
      setError(friendlyError(err));
    } finally { setLoading(false); }
  }

  return (
    <>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .login-input:focus {
          border-color: var(--primary, #5d5fef) !important;
          box-shadow: 0 0 0 3px rgba(93,95,239,0.12) !important;
        }
        .login-input { border: 1.5px solid var(--border, #e5e7eb); }
        .login-btn-primary {
          background: linear-gradient(135deg, var(--primary, #5d5fef) 0%, color-mix(in srgb, var(--primary, #5d5fef) 75%, #000) 100%);
          box-shadow: 0 4px 18px color-mix(in srgb, var(--primary, #5d5fef) 40%, transparent), 0 1px 3px rgba(0,0,0,0.15);
          transition: transform 0.12s, box-shadow 0.12s;
        }
        .login-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 28px color-mix(in srgb, var(--primary, #5d5fef) 48%, transparent), 0 2px 6px rgba(0,0,0,0.12);
        }
        .login-btn-primary:active:not(:disabled) { transform: translateY(0); }
        .login-btn-primary:disabled { opacity: 0.65; cursor: not-allowed; }
        .login-form-anim { animation: fadeUp 0.24s ease both; }
        .login-channel-pill { transition: all 0.15s; }
        .login-channel-pill:hover { opacity: 0.85; }
        @media (max-width: 768px) {
          /* Dark hero fills top; white card slides up from bottom */
          .login-shell { flex-direction: column !important; min-height: 100dvh !important; background: #0c1220 !important; }
          .login-left {
            position: static !important; height: auto !important; width: 100% !important;
            min-height: 0 !important; flex-shrink: 0 !important; flex: none !important;
            padding: 52px 24px 36px !important;
            flex-direction: column !important; align-items: center !important;
            text-align: center !important; gap: 0 !important;
          }
          /* Show a simplified hero headline on mobile */
          .login-hero { display: flex !important; flex-direction: column !important; align-items: center !important; margin-top: 16px !important; flex: 0 0 auto !important; }
          .login-hero > div:first-child { justify-content: center !important; }
          .login-hero h1 { font-size: 22px !important; text-align: center !important; margin-bottom: 0 !important; }
          .login-hero > p { display: none !important; }
          .login-features, .login-left-footer { display: none !important; }
          /* White card with rounded top slides up */
          .login-right {
            min-height: 0 !important; flex: 1 !important;
            padding: 32px 20px 44px !important;
            display: flex !important; align-items: flex-start !important; justify-content: center !important;
            border-radius: 28px 28px 0 0 !important;
            box-shadow: 0 -4px 32px rgba(0,0,0,0.35) !important;
          }
        }
        @media (max-width: 480px) {
          .login-right > div { max-width: 100% !important; }
          .login-left { padding: 44px 20px 28px !important; }
        }
      `}</style>

      {/* ── Shell ── */}
      <div className="login-shell" style={{ display: "flex", minHeight: "100dvh", background: "#0c1220" }}>

        {/* ── Left decorative panel ── */}
        <div className="login-left" style={{
          position: "sticky", top: 0, height: "100dvh", width: "44%", flexShrink: 0,
          display: "flex", flexDirection: "column", padding: "48px 44px",
          overflow: "hidden", background: "#0c1220",
        }}>
          {/* Fabric crosshatch pattern */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: `
              repeating-linear-gradient(45deg, rgba(255,255,255,0.028) 0px, rgba(255,255,255,0.028) 1px, transparent 1px, transparent 28px),
              repeating-linear-gradient(-45deg, rgba(255,255,255,0.028) 0px, rgba(255,255,255,0.028) 1px, transparent 1px, transparent 28px)
            `,
          }} />
          {/* Glow orbs */}
          <div style={{
            position: "absolute", width: 440, height: 440, borderRadius: "50%",
            background: "radial-gradient(circle, color-mix(in srgb, var(--primary, #5d5fef) 28%, transparent) 0%, transparent 70%)",
            top: -90, right: -110, pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", width: 300, height: 300, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 70%)",
            bottom: 40, left: -60, pointerEvents: "none",
          }} />

          {/* Brand row */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative", zIndex: 1 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 15, flexShrink: 0,
              background: "linear-gradient(135deg, var(--primary, #5d5fef), color-mix(in srgb, var(--primary, #5d5fef) 60%, #000))",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.12) inset, 0 8px 32px color-mix(in srgb, var(--primary,#5d5fef) 45%, transparent)",
            }}>
              <GarmentIcon />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: -0.5, lineHeight: 1.2 }}>
                {brandName}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 500, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 2 }}>
                {brandSubtitle || "Warehouse ERP"}
              </div>
            </div>
          </div>

          {/* Hero text */}
          <div className="login-hero" style={{ marginTop: 56, position: "relative", zIndex: 1, flex: 1 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase",
              color: "#10b981", marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ display: "block", width: 28, height: 2, background: "#10b981", borderRadius: 2 }} />
              Garment Industry Platform
            </div>
            <h1 style={{
              fontSize: 38, fontWeight: 900, color: "#fff", letterSpacing: -1.2,
              lineHeight: 1.12, marginBottom: 20,
            }}>
              From fabric to{"\n"}
              <span style={{
                backgroundImage: "linear-gradient(90deg, #818cf8, #10b981)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>finished goods,</span>
              {"\n"}all in one place.
            </h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, maxWidth: 320, marginBottom: 40 }}>
              Track every metre of cloth from procurement through cutting, stitching, and sales — with full financial visibility.
            </p>
          </div>

          {/* Feature bullets */}
          <div className="login-features" style={{ display: "flex", flexDirection: "column", gap: 18, position: "relative", zIndex: 1 }}>
            {[
              { dot: "rgba(93,95,239,0.2)", border: "rgba(93,95,239,0.3)", emoji: "🧵", title: "End-to-end production", sub: "PO → cutting → stitching → finished goods" },
              { dot: "rgba(16,185,129,0.18)", border: "rgba(16,185,129,0.25)", emoji: "📦", title: "Multi-warehouse inventory", sub: "Real-time stock across all locations" },
              { dot: "rgba(245,158,11,0.18)", border: "rgba(245,158,11,0.25)", emoji: "📊", title: "Financial analytics", sub: "Revenue, margins, credit, and aging reports" },
            ].map(f => (
              <div key={f.title} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: f.dot, border: `1px solid ${f.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, marginTop: 1,
                }}>
                  {f.emoji}
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 2 }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{f.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="login-left-footer" style={{
            marginTop: 32, position: "relative", zIndex: 1,
            display: "flex", alignItems: "center", gap: 8,
            fontSize: 11, color: "rgba(255,255,255,0.25)",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981", flexShrink: 0 }} />
            System secured · SSL encrypted
          </div>
        </div>

        {/* ── Right form panel ── */}
        <div className="login-right" style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--canvas, #f9fafb)", padding: "40px 24px", minHeight: "100dvh",
        }}>
          <div className="login-form-anim" style={{ width: "100%", maxWidth: 420 }}>

            {/* Header */}
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: "var(--ink, #111827)", letterSpacing: -0.6, marginBottom: 6 }}>
                Welcome back
              </h2>
              <p style={{ fontSize: 14, color: "var(--muted, #6b7280)", lineHeight: 1.5 }}>
                Sign in to manage your warehouse operations.
              </p>
            </div>

            {/* Mode toggle */}
            <div style={{
              display: "flex", background: "var(--canvas, #e5e7eb)", borderRadius: 10,
              padding: 3, gap: 3, marginBottom: 28,
              border: "1px solid var(--line, #e5e7eb)",
            }}>
              {(["password", "otp"] as const).map(m => (
                <button key={m} type="button" onClick={() => switchMode(m)} style={{
                  flex: 1, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: mode === m ? 700 : 500,
                  background: mode === m ? "var(--paper, #fff)" : "transparent",
                  color: mode === m ? "var(--ink, #111827)" : "var(--muted, #6b7280)",
                  boxShadow: mode === m ? "0 1px 6px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.17s",
                }}>
                  {m === "password" ? "Password" : "Login with OTP"}
                </button>
              ))}
            </div>

            {/* Error banner */}
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

            {/* Info banner */}
            {info && (
              <div style={{
                background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d",
                borderRadius: 10, padding: "11px 14px", fontSize: 13, marginBottom: 20, lineHeight: 1.5,
              }}>{info}</div>
            )}

            {/* PASSWORD FORM */}
            {mode === "password" && (
              <form onSubmit={handlePasswordLogin} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {/* Identifier */}
                {(
                  <div style={{ marginBottom: 18 }}>
                    <label style={LBL}>
                      {identType === "email" ? "Email address" : identType === "phone" ? "Phone number" : "Identifier"}
                    </label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted, #6b7280)", display: "flex", pointerEvents: "none" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                        </svg>
                      </span>
                      <input
                        className="login-input"
                        style={{ ...I, borderColor: identErr ? "#e53e3e" : undefined }}
                        placeholder="Username, email, or phone"
                        value={identifier}
                        onChange={e => { setIdentifier(e.target.value); if (identErr) setIdentErr(""); }}
                        autoFocus
                        autoComplete="username"
                      />
                    </div>
                    {identErr
                      ? <span style={ERR}>{identErr}</span>
                      : identHint[identType] && (
                        <span style={{ fontSize: 11, color: "var(--primary, #5d5fef)", marginTop: 5, display: "block", fontWeight: 600 }}>
                          {identHint[identType]}
                        </span>
                      )
                    }
                  </div>
                )}

                {/* Password */}
                <div style={{ marginBottom: 24 }}>
                  <label style={LBL}>Password</label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted, #6b7280)", display: "flex", pointerEvents: "none" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                      </svg>
                    </span>
                    <input
                      className="login-input"
                      style={{ ...I, borderColor: passErr ? "#e53e3e" : undefined }}
                      type={showPass ? "text" : "password"}
                      placeholder="Your password"
                      value={password}
                      onChange={e => { setPassword(e.target.value); if (passErr) setPassErr(""); }}
                      autoComplete="current-password"
                    />
                    <button type="button" onClick={() => setShowPass(p => !p)} style={{
                      position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--muted, #6b7280)", display: "flex", alignItems: "center", padding: 2,
                    }}>
                      {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  {passErr && <span style={ERR}>{passErr}</span>}
                </div>

                <button className="login-btn-primary" style={{
                  width: "100%", padding: "14px", borderRadius: 12, border: "none",
                  color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  fontFamily: "inherit",
                }} type="submit" disabled={loading}>
                  {loading
                    ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Signing in…</>
                    : <><LogIn size={16} /> Sign in</>
                  }
                </button>
              </form>
            )}

            {/* OTP — request step */}
            {mode === "otp" && otpStep === "request" && (
              <form onSubmit={handleRequestOTP} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {/* Identifier */}
                <div style={{ marginBottom: 18 }}>
                  <label style={LBL}>Identifier</label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted, #6b7280)", display: "flex", pointerEvents: "none" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                      </svg>
                    </span>
                    <input
                      className="login-input"
                      style={{ ...I, borderColor: identErr ? "#e53e3e" : undefined }}
                      placeholder="Username, email, or phone"
                      value={identifier}
                      onChange={e => { setIdentifier(e.target.value); if (identErr) setIdentErr(""); }}
                      autoFocus
                      autoComplete="username"
                    />
                  </div>
                  {identErr && <span style={ERR}>{identErr}</span>}
                </div>

                {/* Channel selector */}
                <div style={{ marginBottom: 24 }}>
                  <label style={LBL}>Send OTP via</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    {CHANNELS.map(ch => (
                      <button key={ch.id} type="button" onClick={() => setChannel(ch.id)}
                        className="login-channel-pill"
                        style={{
                          padding: "13px 8px", borderRadius: 12, cursor: "pointer",
                          border: channel === ch.id ? `2px solid ${ch.color}` : `1.5px solid var(--line, #e5e7eb)`,
                          background: channel === ch.id ? `${ch.color}12` : "var(--input-bg, #fff)",
                          color: channel === ch.id ? ch.color : "var(--muted, #6b7280)",
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
                          fontWeight: channel === ch.id ? 700 : 500, fontSize: 12,
                          fontFamily: "inherit",
                        }}>
                        <span style={{ color: channel === ch.id ? ch.color : "var(--muted, #6b7280)" }}>{ch.icon}</span>
                        {ch.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button type="submit" className="login-btn-primary" style={{
                  width: "100%", padding: "14px", borderRadius: 12, border: "none",
                  color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  fontFamily: "inherit",
                }} disabled={loading}>
                  {loading
                    ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Sending…</>
                    : <><Send size={15} /> Send OTP via {CHANNELS.find(c => c.id === channel)?.label}</>
                  }
                </button>
              </form>
            )}

            {/* OTP — verify step */}
            {mode === "otp" && otpStep === "verify" && (
              <form onSubmit={handleVerifyOTP} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                <div style={{ marginBottom: 24 }}>
                  <label style={LBL}>6-digit OTP code</label>
                  <input
                    className="login-input"
                    type="text" inputMode="numeric" pattern="[0-9]*"
                    style={{
                      width: "100%", padding: "16px", borderRadius: 12,
                      background: "var(--input-bg, #fff)", color: "var(--ink, #111827)",
                      fontSize: 30, letterSpacing: 18, textAlign: "center",
                      fontWeight: 800, fontFamily: "'Courier New', monospace", outline: "none",
                      transition: "border-color 0.15s, box-shadow 0.15s", boxSizing: "border-box",
                      borderColor: otpErr ? "#e53e3e" : undefined,
                    }}
                    placeholder="——————" value={otpCode} maxLength={6}
                    onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "")); if (otpErr) setOtpErr(""); }}
                    autoFocus
                  />
                  {otpErr
                    ? <span style={{ ...ERR, textAlign: "center" }}>{otpErr}</span>
                    : <div style={{ fontSize: 11, color: "var(--muted, #6b7280)", marginTop: 8, textAlign: "center" }}>
                        Sent to your {channel === "EMAIL" ? "email" : channel === "WHATSAPP" ? "WhatsApp" : "SMS"}
                      </div>
                  }
                </div>

                <button type="submit" className="login-btn-primary" style={{
                  width: "100%", padding: "14px", borderRadius: 12, border: "none",
                  color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  fontFamily: "inherit", marginBottom: 10,
                }} disabled={loading || otpCode.length < 6}>
                  {loading
                    ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Verifying…</>
                    : <><LogIn size={16} /> Verify & Sign in</>
                  }
                </button>

                <button type="button" onClick={() => { setOtpStep("request"); setOtpCode(""); setInfo(""); setError(""); }}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 12,
                    border: "1.5px solid var(--line, #e5e7eb)", background: "transparent",
                    color: "var(--muted, #6b7280)", fontSize: 13.5, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    fontFamily: "inherit",
                  }}>
                  <ArrowLeft size={14} /> Back / Resend OTP
                </button>
              </form>
            )}

            {/* Footer */}
            <div style={{
              marginTop: 28, textAlign: "center", fontSize: 12,
              color: "var(--muted, #6b7280)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 5px #10b981", display: "inline-block" }} />
              {brandName} · Secure Login
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
