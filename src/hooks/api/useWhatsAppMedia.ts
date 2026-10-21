import * as React from 'react';

import { buildUrl } from '@/lib/api';
import { isNativeShell } from '@/lib/nativeBridge';
import { clearAuth, getAuthToken } from '@/store/auth';

/**
 * A photo, voice note, video or file somebody sent us, fetched through the
 * server with the admin's own token.
 *
 * It cannot be an `<img src>`: a tag cannot carry the Authorization header, and
 * the file is a stranger's, so the server will not hand it to anyone who has
 * not signed in. The bytes are fetched, held as a blob, and shown through an
 * object URL.
 *
 * The blobs are kept in memory for the visit — scrolling back up through a
 * chat must not fetch every photo again over a slow link — with a cap on how
 * many and how large, oldest out first. The object URL is made per component
 * and revoked when it goes, so a URL is never left pointing at nothing for the
 * next component to be handed.
 */

const MAX_ENTRIES = 40;
const MAX_BYTES = 64 * 1024 * 1024;

const blobs = new Map<string, Blob>();
const inflight = new Map<string, Promise<Blob>>();
let totalBytes = 0;

/** Why a file did not come: `gone` — Meta no longer has it; `missing` — nothing to fetch; `error` — try again. */
export class MediaFailure extends Error {
  readonly kind: 'gone' | 'missing' | 'error';

  constructor(kind: 'gone' | 'missing' | 'error', message: string) {
    super(message);
    this.name = 'MediaFailure';
    this.kind = kind;
  }
}

function remember(id: string, blob: Blob): void {
  const old = blobs.get(id);
  if (old) {
    totalBytes -= old.size;
    blobs.delete(id);
  }
  blobs.set(id, blob);
  totalBytes += blob.size;
  // Oldest first. The one just stored is never the one to go.
  while (blobs.size > 1 && (blobs.size > MAX_ENTRIES || totalBytes > MAX_BYTES)) {
    const oldest = blobs.keys().next().value;
    if (oldest === undefined || oldest === id) break;
    totalBytes -= blobs.get(oldest)?.size ?? 0;
    blobs.delete(oldest);
  }
}

async function download(id: string): Promise<Blob> {
  const token = getAuthToken();
  let res: Response;
  try {
    res = await fetch(buildUrl(`/admin/whatsapp/media/${encodeURIComponent(id)}`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new MediaFailure('error', 'Could not reach the server.');
  }
  if (res.ok) return res.blob();
  if (res.status === 401) clearAuth();

  let code: string | null = null;
  let message: string | null = null;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? null;
    message = body.error?.message ?? null;
  } catch {
    // Not the usual envelope: the status says enough.
  }
  if (res.status === 410 || code === 'WHATSAPP_MEDIA_GONE') {
    throw new MediaFailure('gone', message ?? 'WhatsApp no longer has this file.');
  }
  if (res.status === 404) throw new MediaFailure('missing', message ?? 'There is no file for this message.');
  throw new MediaFailure('error', message ?? 'Could not load this file.');
}

/** The file for one inbound message, from memory when this visit has already fetched it. */
export function fetchWhatsAppMedia(id: string): Promise<Blob> {
  const held = blobs.get(id);
  if (held) {
    // Touched, so what the admin is looking at is the last to be dropped.
    blobs.delete(id);
    blobs.set(id, held);
    return Promise.resolve(held);
  }
  const running = inflight.get(id);
  if (running) return running;
  const started = download(id)
    .then((blob) => {
      remember(id, blob);
      return blob;
    })
    .finally(() => {
      inflight.delete(id);
    });
  inflight.set(id, started);
  return started;
}

export type WhatsAppMediaState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string; mime: string }
  | { status: 'gone' }
  | { status: 'missing' }
  | { status: 'error'; message: string };

/**
 * Load a message's file once `enabled` is true — and keep it loaded: pass a
 * value that, once true, stays true, or the object URL is revoked under a
 * picture still on screen.
 */
export function useWhatsAppMedia(
  id: string,
  enabled: boolean,
): { state: WhatsAppMediaState; retry: () => void } {
  const [state, setState] = React.useState<WhatsAppMediaState>({ status: 'idle' });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ status: 'loading' });
    fetchWhatsAppMedia(id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: 'ready', url: objectUrl, mime: blob.type });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof MediaFailure && err.kind !== 'error') setState({ status: err.kind });
        else setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load this file.' });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, enabled, attempt]);

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}

/**
 * Hand a file to the person: open it where the browser can show it (a PDF, a
 * picture), save it otherwise. Throws a `MediaFailure` with words to show.
 *
 * Resolves `'opened'`, or `'not-here'` when this is the native app, where it
 * does nothing at all and says nothing: a click on an anchor to a `blob:` URL is
 * dropped by the app's WebView (the shell has no second window to open it in,
 * and Android's download manager cannot read a blob). The caller tells the
 * admin so, in words, rather than leave a tap that appears to do nothing — see
 * `lib/downloadFile.ts`. The file is not even fetched.
 */
export async function openWhatsAppMedia(id: string, filename: string): Promise<'opened' | 'not-here'> {
  if (isNativeShell()) return 'not-here';
  const blob = await fetchWhatsAppMedia(id);
  const url = URL.createObjectURL(blob);
  const viewable = /^(application\/pdf|image\/|text\/plain)/.test(blob.type);
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  if (viewable) a.target = '_blank';
  else a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Long enough for the new tab or the save to have read it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'opened';
}
