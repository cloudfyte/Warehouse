"use client";
import { WifiOff, RefreshCw } from "lucide-react";
import Button from "@/app/components/atoms/Button";

interface Props {
  message: string;
  onRetry: () => void;
  onLogout: () => void;
  /** True while a retry is in flight, so the button can say so. */
  retrying?: boolean;
}

/**
 * The heading already says we can't reach the server, so drop that half of the
 * message when it is the connection error and keep only the advice.
 */
function detail(message: string) {
  const trimmed = message.replace(/^Can't reach the server\.\s*/i, "").trim();
  return trimmed || "Your device is offline, or the server is restarting. This usually clears in a moment.";
}

/**
 * Shown only on a cold start that never got any data — once the app has data
 * on screen, a failed refresh is a banner, not a takeover (see page.tsx).
 *
 * The previous version was bare red text on a white page with two unstyled
 * buttons, which read as a crashed server rather than a dropped connection.
 */
export default function ConnectionError({ message, onRetry, onLogout, retrying = false }: Props) {
  return (
    <div style={{
      minHeight: "100dvh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16,
        boxShadow: "0 8px 32px rgba(0,0,0,0.06)",
        padding: "40px 36px", maxWidth: 420, width: "100%", textAlign: "center",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%", margin: "0 auto 20px",
          background: "var(--canvas)", color: "var(--muted)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <WifiOff size={26} />
        </div>

        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
          Can&apos;t reach the server
        </h2>
        <p style={{ margin: "0 0 24px", fontSize: 13, lineHeight: 1.65, color: "var(--muted)" }}>
          {detail(message)}
        </p>

        <Button variant="primary" onClick={onRetry} disabled={retrying} style={{ width: "100%", padding: "11px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <RefreshCw size={15} style={retrying ? { animation: "spin 1s linear infinite" } : undefined} />
            {retrying ? "Reconnecting…" : "Try again"}
          </span>
        </Button>

        <button
          type="button"
          onClick={onLogout}
          style={{
            marginTop: 14, background: "none", border: "none", cursor: "pointer",
            fontSize: 12.5, color: "var(--muted)", textDecoration: "underline",
          }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
