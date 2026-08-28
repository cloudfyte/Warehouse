import type { ConfirmState } from "@/app/types";

export default function ConfirmDialog({
  state,
  onCancel,
}: {
  state: ConfirmState;
  onCancel: () => void;
}) {
  if (!state) return null;
  return (
    <div className="confirm-backdrop" onMouseDown={onCancel}>
      <div className="confirm-box" onMouseDown={e => e.stopPropagation()}>
        <h3>{state.title}</h3>
        <p>{state.message}</p>
        <div className="confirm-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="danger-btn" onClick={() => { state.onConfirm(); onCancel(); }}>
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
