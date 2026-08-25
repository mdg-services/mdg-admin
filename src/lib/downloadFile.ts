import { isNativeShell, requestNativeDownload } from './nativeBridge';

export interface DownloadFileRequest {
  /** A fetchable URL. Required in the native shell. */
  url?: string;
  /** A locally built file. Browser-only path — see the note below. */
  blob?: Blob;
  filename: string;
  contentType?: string;
  kind?: 'image' | 'file' | 'audio';
}

export interface DownloadFileResult {
  ok: boolean;
  /** 'gallery' = saved into the phone's photos; 'browser' = handed to Chrome. */
  mode?: 'gallery' | 'browser';
  /** Present when `ok === false` — show it in a toast. Never fail silently. */
  reason?: string;
}

/**
 * Save a file to the device, by whichever route actually works where the app is
 * running.
 *
 * Three things that look fine in a browser do nothing inside the Expo shell,
 * and each of them shipped here at some point: a cross-origin `<a download>`
 * (the attribute is ignored across origins, and the anchor navigates the
 * WebView off the app), a synthetic `target="_blank"` click (the shell runs
 * `setSupportMultipleWindows={false}`, so the second window is simply dropped),
 * and a `blob:` URL (Android's download manager cannot read one). What does
 * work is the shell's two-phase `media:download` bridge, with `window.open` as
 * the fallback for an older binary that never acks.
 *
 * The one honest limitation: a file built in the browser — a CSV assembled from
 * data already on screen — exists only as a blob, so inside the shell there is
 * nothing to hand over. That case returns `ok: false` with a reason to show,
 * rather than a tap that appears to do nothing. The fix is a server-side export
 * URL, not a front-end trick.
 *
 * Always returns a result. A silent no-op is indistinguishable from a broken
 * app, and it is the worst outcome available.
 */
export async function downloadFile(
  req: DownloadFileRequest,
): Promise<DownloadFileResult> {
  const { url, blob, filename, contentType, kind } = req;

  if (!url && !blob) {
    return { ok: false, reason: 'There is no file to download.' };
  }

  if (isNativeShell()) {
    if (!url) {
      return {
        ok: false,
        reason:
          'This file is built inside the app and cannot be saved from here. Open the admin in a browser to download it.',
      };
    }
    const result = await requestNativeDownload({
      id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      filename,
      ...(contentType ? { contentType } : {}),
      ...(kind ? { kind } : {}),
    });
    if (result.ok) return { ok: true, mode: result.mode ?? 'browser' };
    // A refusal is final; only silence means an old shell with no handler, and
    // that one still has the browser route below.
    if (!result.timedOut) {
      return { ok: false, reason: result.error || 'The download failed.' };
    }
  }

  if (url) {
    try {
      window.open(url, '_blank', 'noopener');
      return { ok: true, mode: 'browser' };
    } catch {
      return { ok: false, reason: 'The download could not be started.' };
    }
  }

  if (!blob) return { ok: false, reason: 'There is no file to download.' };

  // Browser + blob: an anchor is safe here because a blob URL is same-origin,
  // so `download` is honoured and no navigation happens.
  try {
    const payload = contentType ? new Blob([blob], { type: contentType }) : blob;
    const objectUrl = URL.createObjectURL(payload);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoked on the next tick: revoking synchronously can beat the click in
    // some engines and produce an empty file.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    return { ok: true, mode: 'browser' };
  } catch {
    return { ok: false, reason: 'The file could not be saved.' };
  }
}
