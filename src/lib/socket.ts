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

/**
 * Keep the socket when the SAME person's token is re-stamped; rebuild it only
 * when the account actually changes.
 *
 * `requireAuth` rolls a token forward once it is an hour old and hands the new
 * one back on `X-Refreshed-Token`, which `lib/api.ts` swaps into this store.
 * Treating that as an account change destroyed the live connection —
 * `removeAllListeners()` and all — and handed back a fresh socket that nothing
 * had subscribed to. Any hook that does not name `token` in its dependencies
 * never re-subscribes, so an open conversation simply stopped receiving
 * messages about an hour into every shift. The dealer app shipped the same
 * fault; this is the same fix.
 */
useAuthStore.subscribe((state, prev) => {
  if (state.token === prev.token) return;

  if (!state.token) {
    disconnectSocket();
    return;
  }

  const live = socket;
  const who = (s: { admin?: { id?: string } | null; user?: { id?: string } | null }) =>
    s.admin?.id ?? s.user?.id ?? null;
  const identity = who(state);

  if (live && prev.token && identity && identity === who(prev)) {
    // Read at handshake time only, so the live connection and its rooms are
    // untouched; this just arms the next reconnect with the current token.
    live.auth = { token: state.token };
    connectedToken = state.token;
    return;
  }

  disconnectSocket();
  getSocket();
});
