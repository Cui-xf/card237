import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, RoomView, ServerMessage } from '../../shared/protocol';

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'error';

export interface SocketNotice {
  id: number;
  message: string;
}

interface Options {
  roomId: string;
  playerId: string;
  name: string;
  enabled: boolean;
}

interface RoomSocket {
  state: RoomView | null;
  status: SocketStatus;
  fatalMessage: string | null;
  notice: SocketNotice | null;
  send: (message: ClientMessage) => boolean;
}

export function useRoomSocket({ roomId, playerId, name, enabled }: Options): RoomSocket {
  const [state, setState] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<SocketStatus>('idle');
  const [fatalMessage, setFatalMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<SocketNotice | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    let stopped = false;
    let retry = 0;
    let reconnectTimer: number | undefined;
    let heartbeatTimer: number | undefined;
    let socket: WebSocket | undefined;

    setState(null);
    setFatalMessage(null);

    const connect = () => {
      if (stopped) return;

      setStatus(retry === 0 ? 'connecting' : 'reconnecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url =
        `${protocol}//${window.location.host}/api/rooms/${encodeURIComponent(roomId)}/ws` +
        `?playerId=${encodeURIComponent(playerId)}&name=${encodeURIComponent(name)}`;

      socket = new WebSocket(url);
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        if (stopped) return;
        retry = 0;
        setStatus('open');

        if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer);
        heartbeatTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({ type: 'ping', t: Date.now() } satisfies ClientMessage),
            );
          }
        }, 25_000);
      });

      socket.addEventListener('message', (event) => {
        if (stopped) return;

        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }

        if (message.type === 'state') {
          setState(message.state);
          return;
        }

        if (message.type === 'error') {
          setNotice({ id: Date.now() + Math.random(), message: message.message });
          if (message.code === 'JOIN_REJECTED') {
            stopped = true;
            setFatalMessage(message.message);
            setStatus('error');
            socket?.close();
          }
        }
      });

      socket.addEventListener('close', () => {
        if (stopped) return;
        if (heartbeatTimer !== undefined) {
          window.clearInterval(heartbeatTimer);
          heartbeatTimer = undefined;
        }
        socketRef.current = null;
        setStatus('reconnecting');

        const delay = Math.min(8_000, 600 * 2 ** retry);
        retry += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      });

      socket.addEventListener('error', () => {
        if (stopped) return;
        setStatus((current) => (current === 'open' ? current : 'reconnecting'));
      });
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer);
      socket?.close();
      socketRef.current = null;
    };
  }, [roomId, playerId, name, enabled]);

  const send = useCallback((message: ClientMessage): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  return { state, status, fatalMessage, notice, send };
}
