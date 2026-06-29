import { io, type Socket } from 'socket.io-client';

import { useAuthStore } from '@/store/auth';
import type { ClientToServerEvents, ServerToClientEvents } from '@dk/shared';

export type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:4000/api/v1';

/**
 * Derive the Socket.IO origin from the REST base URL.
 * E.g. `http://localhost:4000/api/v1` -> `http://localhost:4000`.
 */
function socketOrigin(): string {
  try {
    const url = new URL(BASE_URL);
    return `${url.protocol}//${url.host}`;
  } catch {
    return window.location.origin;
  }
}

let socket: ChatSocket | null = null;
let connectedToken: string | null = null;

export function getSocket(): ChatSocket | null {
  const token = useAuthStore.getState().token;
  if (!token) {
    if (socket) {
      socket.disconnect();
      socket = null;
      connectedToken = null;
    }
    return null;
  }
  if (socket && connectedToken === token) return socket;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socket = io(socketOrigin(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
  });
  connectedToken = token;
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    connectedToken = null;
  }
}

// Subscribe to auth store and reconnect/disconnect when the token changes.
useAuthStore.subscribe((state, prev) => {
  if (state.token === prev.token) return;
  if (!state.token) {
    disconnectSocket();
  } else {
    // Force re-creation so the new token is used.
    disconnectSocket();
    getSocket();
  }
});
