import { useEffect, useState } from 'react';

export type Route = { name: 'lobby' } | { name: 'room'; roomId: string };

export function parseHash(hash: string): Route {
  const match = /^#\/room\/([A-Za-z0-9]{1,12})\/?$/.exec(hash);
  if (!match) return { name: 'lobby' };
  return { name: 'room', roomId: match[1].toUpperCase() };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const update = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    return () => {
      window.removeEventListener('hashchange', update);
      window.removeEventListener('popstate', update);
    };
  }, []);

  return route;
}

export function goToRoom(roomId: string): void {
  window.location.hash = `#/room/${roomId.toUpperCase()}`;
}

export function goToLobby(): void {
  window.location.hash = '#/';
}
