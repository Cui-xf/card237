import { useCallback, useEffect, useState } from 'react';
import { Toast, type ToastData, type ToastTone } from './components/Toast';
import { goToLobby, useHashRoute } from './lib/hashRoute';
import { getPlayerId, getSavedName, saveName } from './lib/identity';
import { LobbyPage } from './pages/LobbyPage';
import { RoomPage } from './pages/RoomPage';

export function App() {
  const route = useHashRoute();
  const [playerId] = useState<string>(() => getPlayerId());
  const [playerName, setPlayerName] = useState<string>(() => getSavedName());
  const [toast, setToast] = useState<ToastData | null>(null);

  useEffect(() => {
    const trimmed = playerName.trim();
    if (trimmed) saveName(trimmed);
  }, [playerName]);

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    setToast({ id: Date.now() + Math.random(), message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3_400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <div className="app-shell">
      <div className="app-backdrop" aria-hidden="true" />

      {route.name === 'room' ? (
        <RoomPage
          key={route.roomId}
          roomId={route.roomId}
          playerId={playerId}
          playerName={playerName}
          onPlayerNameChange={setPlayerName}
          notify={notify}
          onBack={goToLobby}
        />
      ) : (
        <LobbyPage
          playerName={playerName}
          onPlayerNameChange={setPlayerName}
          notify={notify}
        />
      )}

      <Toast key={toast?.id ?? 'none'} toast={toast} />
    </div>
  );
}
