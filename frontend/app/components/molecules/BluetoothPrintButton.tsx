"use client";
import { useBluetooth } from "@/app/lib/useBluetooth";
import Button from "@/app/components/atoms/Button";

interface Props {
  getData: () => Uint8Array;
  label?: string;
  size?: "sm" | "md";
}

/**
 * Self-contained Bluetooth thermal print button.
 * Manages its own BLE connection state; caller just provides getData().
 */
export default function BluetoothPrintButton({ getData, label = "🔵 BT Print", size = "sm" }: Props) {
  const { btConnecting, connectBluetooth, btSend, isConnected } = useBluetooth();

  async function handlePrint() {
    const data = getData();
    const ok = await btSend(data);
    if (!ok) {
      // btSend already shows an alert if it fails; no-op here
    }
  }

  return (
    <Button
      variant="secondary"
      size={size}
      disabled={btConnecting}
      onClick={isConnected ? handlePrint : async () => {
        const char = await connectBluetooth();
        if (char) {
          // auto-print after connect
          const data = getData();
          await btSend(data);
        }
      }}
    >
      {btConnecting ? "Connecting…" : isConnected ? label : `${label} (Connect)`}
    </Button>
  );
}
