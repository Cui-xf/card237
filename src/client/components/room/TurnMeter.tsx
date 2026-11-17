import { useNow } from '../../lib/useNow';

const TURN_SECONDS = 30;

export function TurnMeter({
  turnStartedAt,
  active,
}: {
  turnStartedAt: number;
  active: boolean;
}) {
  const now = useNow(1_000);

  if (!active) return null;

  const elapsed = Math.max(0, Math.floor((now - turnStartedAt) / 1_000));
  const percentage = Math.min(100, (elapsed / TURN_SECONDS) * 100);
  const isLong = elapsed >= TURN_SECONDS;

  return (
    <div
      className={`turn-meter ${isLong ? 'is-urgent' : ''}`}
      aria-label={`本回合已进行 ${elapsed} 秒`}
      title="演示计时，服务端超时控制将在规则阶段接入"
    >
      <div className="turn-meter-head">
        <span>本回合</span>
        <span>{elapsed}s</span>
      </div>
      <div className="turn-meter-track" aria-hidden="true">
        <div className="turn-meter-fill" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
