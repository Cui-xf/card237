import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useId } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = '取消',
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="icon-btn dialog-close" onClick={onCancel} aria-label="关闭">
          <X size={18} aria-hidden="true" />
        </button>

        <div className="dialog-icon" aria-hidden="true">
          <AlertTriangle size={22} />
        </div>
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        <p id={descriptionId} className="dialog-description">
          {description}
        </p>

        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-gold'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
