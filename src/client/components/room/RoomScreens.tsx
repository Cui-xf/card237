import { AlertTriangle, ArrowLeft, ArrowRight, Loader2, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Logo } from '../Logo';

export function LoadingScreen({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="centered-page page-shell">
      <div className="loading-stack" role="status" aria-live="polite">
        <Logo />
        <div className="loading-orbit" aria-hidden="true">
          <Loader2 size={26} className="animate-spin" />
        </div>
        <p className="text-mint">{label}</p>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={17} aria-hidden="true" />
          返回大厅
        </button>
      </div>
    </div>
  );
}

interface ErrorScreenProps {
  title: string;
  description: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function RoomErrorScreen({
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: ErrorScreenProps) {
  return (
    <div className="centered-page page-shell">
      <div className="gate-card glass" role="alert">
        <div className="gate-icon gate-icon--danger" aria-hidden="true">
          <AlertTriangle size={24} />
        </div>
        <p className="eyebrow">牌桌提示</p>
        <h1 className="gate-title">{title}</h1>
        <p className="gate-description">{description}</p>
        <div className="gate-actions">
          <button type="button" className="btn btn-gold" onClick={onPrimary}>
            {primaryLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button type="button" className="btn btn-ghost" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface NameGateProps {
  roomId: string;
  playerName: string;
  onJoin: (name: string) => void;
  onBack: () => void;
}

export function NameGate({ roomId, playerName, onJoin, onBack }: NameGateProps) {
  const [draft, setDraft] = useState(playerName);
  const trimmed = draft.trim();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed) return;
    onJoin(trimmed);
  };

  return (
    <div className="centered-page page-shell">
      <div className="gate-card glass">
        <Logo />
        <div className="gate-icon" aria-hidden="true">
          <UserRound size={22} />
        </div>
        <p className="eyebrow">房间 {roomId}</p>
        <h1 className="gate-title">先取个昵称</h1>
        <p className="gate-description">昵称会显示在牌桌上，最多 12 个字符。</p>

        <form className="gate-form" onSubmit={submit}>
          <label className="field-label" htmlFor="join-nickname">
            你的昵称
          </label>
          <input
            id="join-nickname"
            className="field"
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 12))}
            placeholder="例如：阿七"
            maxLength={12}
            autoComplete="nickname"
            autoFocus
          />
          <button type="submit" className="btn btn-gold w-full" disabled={!trimmed}>
            进入牌桌
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </form>

        <button type="button" className="text-link" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden="true" />
          返回大厅
        </button>
      </div>
    </div>
  );
}
