import { History, MessageCircle, Send } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  ChatMessage,
  GameLogEntry,
  PublicSeat,
} from '../../shared/protocol';
import { formatTime, seatTextClass } from '../lib/format';

interface ChatPanelProps {
  chat: ChatMessage[];
  log: GameLogEntry[];
  seats: (PublicSeat | null)[];
  canChat: boolean;
  onSend: (text: string) => boolean;
}

type Tab = 'chat' | 'log';

export function ChatPanel({ chat, log, seats, canChat, onSend }: ChatPanelProps) {
  const [tab, setTab] = useState<Tab>('chat');
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [chat.length, log.length, tab]);

  const seatIndexByPlayer = new Map(
    seats
      .map((seat, index) => (seat ? ([seat.playerId, index] as const) : null))
      .filter((entry): entry is readonly [string, number] => entry !== null),
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (onSend(text)) setDraft('');
  };

  return (
    <section className="chat-panel" aria-label="牌桌聊天与动态">
      <div className="chat-tabs" role="tablist" aria-label="聊天与牌局动态">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'chat'}
          className={`chat-tab ${tab === 'chat' ? 'is-active' : ''}`}
          onClick={() => setTab('chat')}
        >
          <MessageCircle size={15} aria-hidden="true" />
          聊天
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'log'}
          className={`chat-tab ${tab === 'log' ? 'is-active' : ''}`}
          onClick={() => setTab('log')}
        >
          <History size={15} aria-hidden="true" />
          动态
        </button>
      </div>

      <div
        ref={listRef}
        className="chat-list"
        role="tabpanel"
        aria-label={tab === 'chat' ? '聊天消息' : '牌局动态'}
      >
        {tab === 'chat' ? (
          chat.length === 0 ? (
            <p className="panel-empty">还没有人说话，打个招呼吧。</p>
          ) : (
            chat.map((message) => {
              const seat = seatIndexByPlayer.get(message.playerId);
              return (
                <article key={message.id} className="chat-message">
                  <div className="chat-meta">
                    <span className={`chat-name ${seatTextClass(seat)}`}>{message.name}</span>
                    <time dateTime={new Date(message.at).toISOString()}>
                      {formatTime(message.at)}
                    </time>
                  </div>
                  <p className="chat-text">{message.text}</p>
                </article>
              );
            })
          )
        ) : log.length === 0 ? (
          <p className="panel-empty">牌局开始后，这里会显示出牌记录。</p>
        ) : (
          log.map((entry) => (
            <div key={entry.id} className={`log-row log-${entry.kind}`}>
              <span className="log-dot" aria-hidden="true" />
              <span className="log-text">{entry.text}</span>
              <time dateTime={new Date(entry.at).toISOString()}>{formatTime(entry.at)}</time>
            </div>
          ))
        )}
      </div>

      <form className="chat-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="chat-input">
          输入聊天内容
        </label>
        <input
          id="chat-input"
          className="field chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, 120))}
          placeholder={canChat ? '说点什么…' : '加入牌桌后可聊天'}
          maxLength={120}
          disabled={!canChat}
          autoComplete="off"
        />
        <button
          type="submit"
          className="btn btn-gold chat-send"
          disabled={!canChat || draft.trim().length === 0}
          aria-label="发送消息"
        >
          <Send size={17} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
