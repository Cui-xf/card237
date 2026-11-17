import { AlertCircle, Info } from 'lucide-react';

export type ToastTone = 'info' | 'error';

export interface ToastData {
  id: number;
  message: string;
  tone: ToastTone;
}

export function Toast({ toast }: { toast: ToastData | null }) {
  if (!toast) return null;

  return (
    <div
      className={`toast glass ${toast.tone === 'error' ? 'toast-error' : 'toast-info'}`}
      role="status"
      aria-live="polite"
    >
      {toast.tone === 'error' ? (
        <AlertCircle size={18} aria-hidden="true" />
      ) : (
        <Info size={18} aria-hidden="true" />
      )}
      <span>{toast.message}</span>
    </div>
  );
}
