"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { X, ScanLine, Keyboard } from "lucide-react";

interface BarcodeScannerProps {
  onDetected: (barcode: string) => void
  onClose: () => void
}

declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => {
      detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>
    }
  }
}

export default function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError("");
    if (!("BarcodeDetector" in window)) {
      setError("Camera barcode scanning not supported in this browser. Use manual entry.");
      setMode("manual");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = new window.BarcodeDetector!({ formats: ["code_128", "ean_13", "ean_8", "qr_code", "code_39", "itf"] });
      setScanning(true);

      const tick = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            stopCamera();
            onDetected(barcodes[0].rawValue);
            return;
          }
        } catch { /* frame not ready */ }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError("Camera access denied or unavailable.");
      setMode("manual");
    }
  }, [onDetected, stopCamera]);

  useEffect(() => {
    if (mode === "camera") startCamera();
    else stopCamera();
    return stopCamera;
  }, [mode, startCamera, stopCamera]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--paper)", borderRadius: 18, width: "min(480px, 95vw)", overflow: "hidden", boxShadow: "0 24px 64px #0006" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ScanLine size={20} color="var(--primary)" />
            <span style={{ fontWeight: 700, fontSize: 16 }}>Scan Barcode</span>
          </div>
          <button onClick={() => { stopCamera(); onClose(); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--line)" }}>
          {(["camera", "manual"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{ flex: 1, padding: "11px 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                background: mode === m ? "var(--primary)" : "transparent",
                color: mode === m ? "#fff" : "var(--muted)",
                borderBottom: mode === m ? "2px solid var(--primary)" : "2px solid transparent" }}>
              {m === "camera" ? "📷 Camera" : "⌨️ Manual"}
            </button>
          ))}
        </div>

        <div style={{ padding: 24 }}>
          {mode === "camera" && (
            <>
              <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#111", aspectRatio: "4/3" }}>
                <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                {/* Scan guide overlay */}
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                  <div style={{ width: "70%", height: 80, border: "2px solid var(--primary)", borderRadius: 10, boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)", position: "relative" }}>
                    <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2, background: "var(--primary)", opacity: scanning ? 0.8 : 0, animation: scanning ? "scan-line 1.8s ease-in-out infinite" : "none" }} />
                  </div>
                </div>
              </div>
              {scanning && <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, marginTop: 12 }}>Point camera at a barcode…</p>}
              <style>{`@keyframes scan-line { 0%,100%{top:10%} 50%{top:90%} }`}</style>
            </>
          )}

          {mode === "manual" && (
            <div>
              <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16, marginTop: 0 }}>
                Type or paste the barcode / SKU number:
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  autoFocus
                  value={manual}
                  onChange={e => setManual(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && manual.trim()) { onDetected(manual.trim()); onClose(); } }}
                  placeholder="Barcode or SKU…"
                  style={{ flex: 1, padding: "11px 14px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--canvas)", color: "var(--ink)", fontSize: 14, outline: "none" }}
                />
                <button onClick={() => { if (manual.trim()) { onDetected(manual.trim()); onClose(); } }}
                  disabled={!manual.trim()}
                  style={{ padding: "11px 18px", borderRadius: 9, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                  Search
                </button>
              </div>
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
                Tip: USB/Bluetooth barcode scanners type into the field automatically — just scan!
              </p>
            </div>
          )}

          {error && (
            <div style={{ background: "#fff1f0", border: "1px solid #ffc5c2", color: "#8d3e39", borderRadius: 9, padding: "10px 14px", fontSize: 13, marginTop: 14 }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
