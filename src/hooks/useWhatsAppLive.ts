import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useToast } from '@/components/ui';
import { incomingHeadline } from '@/features/whatsapp/format';
import {
  playIncomingSound,
  showDesktopNotification,
  unlockSound,
} from '@/features/whatsapp/notify';
import {
  refreshWhatsAppLive,
  useWhatsAppUnreadChats,
  whatsAppKeys,
} from '@/hooks/api/useWhatsAppInbox';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import type { WhatsAppChangedEvent, WhatsAppIncomingEvent } from '@dk/shared';

/** A toast is a headline, not a message: long previews are cut. */
const PREVIEW_CHARS = 140;
/** Long enough to read and to reach for the button. */
const TOAST_MS = 8000;
/**
 * At most one refresh this often. A campaign makes a stream of delivery
 * statuses, one per recipient, and each used to refetch the lists in every open
 * tab. The first event of a quiet spell refreshes at once (a new message shows
 * straight away); the rest of a burst is gathered into one refresh at the end.
 */
const REFRESH_THROTTLE_MS = 2500;

/**
 * The WhatsApp inbox, alive on every screen — mounted once, in the app shell,
 * and only doing anything for a super-admin.
 *
 * - Keeps the lists, the open chat, the nav badge and the page title current
 *   from the server's `whatsapp:changed`, and again whenever the tab comes back
 *   into view (the socket's events are lost while a tab sleeps, and the app
 *   turns refetch-on-focus off globally).
 * - On `whatsapp:incoming` — somebody wrote — tells the admin, unless they are
 *   already looking at that very chat: a toast with an Open button, a soft
 *   sound, and, while the tab is hidden and the browser has been given leave,
 *   a system notification. On the inbox page itself there is no toast: the list
 *   is live there and the sound plays, as in WhatsApp Web, and a toast on that
 *   page sat on top of the chat's Send button.
 * - Puts "(3) " in front of the tab's title while three chats have something
 *   unread, so a tab at the back of the window still says so.
 *
 * Two copies of this would refresh every query twice for one event and ring
 * twice for one message; the nav badge needs it on every screen anyway, so it
 * lives in the shell and nowhere else.
 */
export function useWhatsAppLive(): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const isSuperAdmin = useIsSuperAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const unread = useWhatsAppUnreadChats();

  // The socket handlers below are set up once per login and outlive many
  // renders, so what they need from the router is read through refs.
  const openChat = React.useRef<string | null>(null);
  const onInbox = React.useRef(false);
  const go = React.useRef(navigate);
  // One toast per person at a time: a second message from the same chat
  // replaces the first instead of stacking under it.
  const toasts = React.useRef(new Map<string, string>());
  React.useEffect(() => {
    go.current = navigate;
    onInbox.current = location.pathname === '/whatsapp';
    openChat.current = onInbox.current ? new URLSearchParams(location.search).get('chat') : null;
    // Arriving at the inbox with a toast still up from another screen: it would
    // sit over the box for the rest of its eight seconds.
    if (onInbox.current) {
      toasts.current.forEach((id) => toast.dismiss(id));
      toasts.current.clear();
    }
  }, [navigate, location.pathname, location.search, toast]);

  React.useEffect(() => {
    if (!isSuperAdmin) return;
    const socket = getSocket();
    if (!socket) return;

    const toGo = (person: string) => go.current(`/whatsapp?chat=${encodeURIComponent(person)}`);

    // Throttled, leading and trailing: the people the events were about are
    // gathered until the refresh runs, which then happens once for all of them.
    const persons = new Set<string>();
    let timer: number | null = null;
    let lastRun = 0;
    const flush = () => {
      timer = null;
      lastRun = Date.now();
      const changed = new Set(persons);
      persons.clear();
      refreshWhatsAppLive(qc, changed, openChat.current);
    };
    const onChanged = (e: WhatsAppChangedEvent) => {
      e.persons.forEach((p) => persons.add(p));
      if (timer !== null) return;
      const wait = lastRun + REFRESH_THROTTLE_MS - Date.now();
      if (wait <= 0) flush();
      else timer = window.setTimeout(flush, wait);
    };

    const onIncoming = (e: WhatsAppIncomingEvent) => {
      const visible = document.visibilityState === 'visible';
      // Looking at that very chat: the message is on screen and is being read.
      if (visible && openChat.current === e.person) return;

      const headline = incomingHeadline(e.name, e.phone);
      const preview =
        e.preview.length > PREVIEW_CHARS ? `${e.preview.slice(0, PREVIEW_CHARS).trimEnd()}…` : e.preview;
      // No toast on the inbox page: the list there moves by itself and the
      // sound plays. Every other screen gets one.
      if (!onInbox.current) {
        const previous = toasts.current.get(e.person);
        if (previous) toast.dismiss(previous);
        toasts.current.set(
          e.person,
          toast.info(`New WhatsApp · ${headline}`, {
            description: preview,
            duration: TOAST_MS,
            action: { label: 'Open', onSelect: () => toGo(e.person) },
          }),
        );
      }

      playIncomingSound();
      if (!visible) {
        showDesktopNotification({
          tag: e.person,
          title: headline,
          body: preview,
          onClick: () => {
            window.focus();
            toGo(e.person);
          },
        });
      }
    };

    // Events sent while the connection was down are gone; ask for the state.
    let connectedBefore = socket.connected;
    const onConnect = () => {
      if (connectedBefore) void qc.invalidateQueries({ queryKey: whatsAppKeys.all });
      connectedBefore = true;
    };

    socket.on('whatsapp:changed', onChanged);
    socket.on('whatsapp:incoming', onIncoming);
    socket.on('connect', onConnect);
    return () => {
      socket.off('whatsapp:changed', onChanged);
      socket.off('whatsapp:incoming', onIncoming);
      socket.off('connect', onConnect);
      if (timer !== null) window.clearTimeout(timer);
    };
    // `token` is a dependency even though the effect never reads it: a new
    // login can swap the instance `getSocket()` returns, and a listener on a
    // discarded socket is an inbox that has silently stopped updating.
  }, [qc, token, isSuperAdmin, toast]);

  React.useEffect(() => {
    if (!isSuperAdmin) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: whatsAppKeys.all });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc, isSuperAdmin]);

  // Browsers keep sound off until the page has been touched once.
  React.useEffect(() => {
    if (!isSuperAdmin) return;
    const unlock = () => unlockSound();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [isSuperAdmin]);

  React.useEffect(() => {
    if (!isSuperAdmin || unread <= 0) return;
    const plain = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = `(${unread}) ${plain}`;
    return () => {
      document.title = plain;
    };
  }, [isSuperAdmin, unread]);
}
