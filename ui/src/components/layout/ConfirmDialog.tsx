import { useState, type ReactNode } from "react";
import { apiMessage } from "../../lib/errors";
import { Button, InlineError } from "../ui";
import { Sheet } from "./Sheet";

export function ConfirmDialog({
  cancelLabel = "Cancel",
  confirmLabel,
  danger = false,
  message,
  onCancel,
  onConfirm,
  title,
}: {
  cancelLabel?: string;
  confirmLabel: string;
  danger?: boolean;
  message: ReactNode;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  title: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet title={title} onCancel={submitting ? () => undefined : onCancel}>
      <div className="confirm-dialog">
        <div className="confirm-dialog__message">{message}</div>
        <InlineError message={error} />
        <div className="form-actions">
          <Button
            disabled={submitting}
            onClick={onCancel}
            type="button"
            variant="ghost"
          >
            {cancelLabel}
          </Button>
          <Button
            disabled={submitting}
            onClick={handleConfirm}
            type="button"
            variant={danger ? "danger" : "primary"}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
