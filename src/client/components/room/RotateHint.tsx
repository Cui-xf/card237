import { RotateCw, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { requestLandscapeMode } from '../../lib/orientation';

interface RotateHintProps {
  onDismiss: () => void;
}

export function RotateHint({ onDismiss }: RotateHintProps) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const tryLandscape = async () => {
    setBusy(true);
    setNote('');
    const result = await requestLandscapeMode();
    setBusy(false);

    if (result === 'manual') {
      setNote('当前浏览器不能自动横屏，请把手机横过来，牌桌会自动切换为横屏布局。');
      return;
    }
    if (result === 'fullscreen') {
      setNote('已进入全屏，请把手机横过来开牌。');
      return;
    }
    setNote('已切换为横屏，祝你牌运亨通。');
  };

  return (
    <div
      className="rotate-hint"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotate-hint-title"
    >
      <div className="rotate-hint-card glass">
        <span className="rotate-phone" aria-hidden="true">
          <Smartphone size={34} />
          <RotateCw className="rotate-phone-arrow" size={16} />
        </span>
        <h2 id="rotate-hint-title" className="rotate-title">
          横屏游玩更顺手
        </h2>
        <p className="rotate-copy">
          牌桌已为横屏优化：一屏看清三名玩家、出牌区和手牌，操作按钮就在手牌上方。
          把手机横过来，就像打开小程序游戏一样。
        </p>
        {note && (
          <p className="rotate-note" role="status">
            {note}
          </p>
        )}
        <div className="rotate-actions">
          <button
            type="button"
            className="btn btn-gold"
            onClick={() => void tryLandscape()}
            disabled={busy}
          >
            进入横屏
          </button>
          <button type="button" className="btn btn-ghost" onClick={onDismiss}>
            竖屏继续
          </button>
        </div>
      </div>
    </div>
  );
}
