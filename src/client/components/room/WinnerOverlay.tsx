import { LogOut, RotateCcw, Trophy } from 'lucide-react';

interface WinnerOverlayProps {
  winnerName: string;
  isHost: boolean;
  onRestart: () => void;
  onLeave: () => void;
}

export function WinnerOverlay({
  winnerName,
  isHost,
  onRestart,
  onLeave,
}: WinnerOverlayProps) {
  return (
    <div className="winner-overlay" role="dialog" aria-modal="true" aria-label="本局结束">
      <div className="winner-card glass">
        <div className="winner-trophy" aria-hidden="true">
          <Trophy size={28} />
        </div>
        <p className="eyebrow">本局结束</p>
        <h2 className="winner-title">{winnerName} 获胜</h2>
        <p className="winner-copy">胜负已定，下一局继续。</p>

        <div className="winner-actions">
          {isHost ? (
            <button type="button" className="btn btn-gold" onClick={onRestart}>
              <RotateCcw size={17} aria-hidden="true" />
              再来一局
            </button>
          ) : (
            <span className="winner-wait">等待房主开启新一局…</span>
          )}
          <button type="button" className="btn btn-ghost" onClick={onLeave}>
            <LogOut size={17} aria-hidden="true" />
            离开牌桌
          </button>
        </div>
      </div>
    </div>
  );
}
