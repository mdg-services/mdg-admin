import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useToast } from '@/components/ui';
import {
  chatIsOpenOnLine,
  chatKeyOf,
  inboxTitle,
  incomingHeadline,
  incomingHref,
  parseLine,
  wantsIncomingToast,
} from '@/features/whatsapp/format';
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
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import type { WhatsAppChangedEvent, WhatsAppIncomingEvent, WhatsAppLine } from '@dk/shared';

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
 * doing its work for every signed-in admin.
 *
 * - Keeps the lists, the open chat, the nav badge and the page title current
 *   from the server's `whatsapp:changed`, and again whenever the tab comes back
 *   into view (the socket's events are lost while a tab sleeps, and the app
 *   turns refetch-on-focus off globally).
 * - On `whatsapp:incoming` — somebody wrote — tells the admin, unless they are
 *   already looking at that very chat ON THAT NUMBER: a toast with an Open
 *   button, a soft sound, and, while the tab is hidden and the browser has been
 *   given leave, a system notification. All of them name the number the message
 *   came to ("Ramesh · to Dealer's Kavach"), and Open goes to that number's
 *   inbox. On the inbox page the list is live and the sound plays, as in
 *   WhatsApp Web, and a toast on that page sat on top of the chat's Send
 *   button — so there is none, EXCEPT for a message to the other number, which
 *   nothing on screen but a badge would show.
 * - Puts "(3) " in front of the tab's title while three chats have something
 *   unread, so a tab at the back of the window still says so — and, on the
 *   inbox page, names the number ("WhatsApp · Dealer's Kavach") so a tab at the
 *   back says which inbox it is.
 *
 * Two copies of this would refresh every query twice for one event and ring
 * twice for one message; the nav badge needs it on every screen anyway, so it
 * lives in the shell and nowhere else.
 */
export function useWhatsAppLive(): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const signedIn = !!token;
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const unread = useWhatsAppUnreadChats();

  // The socket handlers below are set up once per login and outlive many
  // renders, so what they need from the router is read through refs.
  const openChat = React.useRef<string | null>(null);
  const openLine = React.useRef<WhatsAppLine | null>(null);
  const onInbox = React.useRef(false);
  const go = React.useRef(navigate);
  // One toast per chat at a time: a second message to the same chat on the same
  // number replaces the first instead of stacking under it.
  const toasts = React.useRef(new Map<string, string>());
  // The number the inbox page is showing, from its address. Null elsewhere, and
  // for the moment before the page has put it there.
  const viewedLine = location.pathname === '/whatsapp' ? parseLine(new URLSearchParams(location.search).get('line')) : null;
  React.useEffect(() => {
    go.current = navigate;
    onInbox.current = location.pathname === '/whatsapp';
    const params = new URLSearchParams(location.search);
    openChat.current = onInbox.current ? params.get('chat') : null;
    openLine.current = onInbox.current ? parseLine(params.get('line')) : null;
    // Arriving at the inbox with a toast still up from another screen: it would
    // sit over the box for the rest of its eight seconds.
    if (onInbox.current) {
      toasts.current.forEach((id) => toast.dismiss(id));
      toasts.current.clear();
    }
  }, [navigate, location.pathname, location.search, toast]);

  React.useEffect(() => {
    if (!signedIn) return;
    const socket = getSocket();
    if (!socket) return;

    const toGo = (person: string, line: WhatsAppLine | null) => go.current(incomingHref(person, line));

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
      // Looking at that very chat on that very number: the message is on
      // screen and is being read. The same person on the other number is not it.
      if (
        chatIsOpenOnLine({
          visible,
          openPerson: openChat.current,
          openLine: openLine.current,
          eventPerson: e.person,
          eventLine: e.line,
        })
      ) {
        return;
      }

      const headline = incomingHeadline(e.name, e.phone, e.line);
      const preview =
        e.preview.length > PREVIEW_CHARS ? `${e.preview.slice(0, PREVIEW_CHARS).trimEnd()}…` : e.preview;
      const chatKey = e.line ? chatKeyOf(e.line, e.person) : e.person;
      // No toast for a message to the number the inbox page is showing: its list
      // moves by itself and the sound plays. Every other screen gets one, and so
      // does a message to the OTHER number.
      if (wantsIncomingToast({ onInbox: onInbox.current, viewedLine: openLine.current, eventLine: e.line })) {
        const previous = toasts.current.get(chatKey);
        if (previous) toast.dismiss(previous);
        toasts.current.set(
          chatKey,
          toast.info(`New WhatsApp · ${headline}`, {
            description: preview,
            duration: TOAST_MS,
            action: { label: 'Open', onSelect: () => toGo(e.person, e.line) },
          }),
        );
      }

      playIncomingSound();
      if (!visible) {
        showDesktopNotification({
          tag: chatKey,
          title: headline,
          body: preview,
          onClick: () => {
            window.focus();
            toGo(e.person, e.line);
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
  }, [qc, token, signedIn, toast]);

  React.useEffect(() => {
    if (!signedIn) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: whatsAppKeys.all });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc, signedIn]);

  // Browsers keep sound off until the page has been touched once.
  React.useEffect(() => {
    if (!signedIn) return;
    const unlock = () => unlockSound();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [signedIn]);

  // The tab's title: the unread count, and on the inbox page the number it is
  // showing. Written in one place so neither can overwrite the other.
  React.useEffect(() => {
    if (!signedIn) return;
    const plain = document.title.replace(/^\(\d+\)\s*/, '');
    const base = viewedLine ? inboxTitle(viewedLine) : plain;
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
    return () => {
      document.title = plain;
    };
  }, [signedIn, unread, viewedLine]);
}
