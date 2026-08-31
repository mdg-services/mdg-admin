/**
 * Getting a card out of the browser and into somebody's hands.
 *
 * Separated from `cardCanvas.ts`, which draws: this file is only about
 * transport, and it now has two sources to move — a PNG built in the page, and
 * one the server already rendered and filed.
 */
import { downloadFile } from './downloadFile';
import { isNativeShell } from './nativeBridge';

/**
 * Is the OS share sheet somewhere worth sending a file?
 *
 * On a phone, yes: the sheet is how an image reaches WhatsApp, and it also
 * offers Save to Photos. On a Mac it is `NSSharingServicePicker` — AirDrop,
 * Messages, Notes, Freeform, Reminders. No WhatsApp, and **no way to save the
 * file at all**, so a desktop admin who pressed "Share as image" got a menu of
 * five things they did not want and no picture. That is the bug this answers.
 *
 * The test is the pointer, not the user agent: `(pointer: coarse)` is true on a
 * touchscreen where the sheet is useful and false on any machine driven by a
 * mouse or trackpad, including a touchscreen laptop. Chromium's
 * `userAgentData.mobile` is preferred where it exists because it is a direct
 * answer rather than a proxy for one.
 *
 * The Expo shell always says yes: a blob built in the WebView cannot be handed
 * to the native download bridge (see `downloadFile`), so the sheet is the only
 * route out that can work there at all.
 */
function prefersShareSheet(): boolean {
  if (isNativeShell()) return true;
  const mobile = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
    ?.mobile;
  if (typeof mobile === 'boolean') return mobile;
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    // A browser that refuses matchMedia is not a phone.
    return false;
  }
}

/**
 * What the button should promise, given where this device will actually send
 * the file. A control labelled "Share as image" that opens no share sheet is
 * the complaint that started this; a label that matches the outcome removes it.
 */
export function shareActionLabel(): string {
  return prefersShareSheet() ? 'Share as image' : 'Download image';
}

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded' | 'failed';

export interface SharePngResult {
  outcome: ShareOutcome;
  /** Present when `outcome === 'failed'` — show it. Never fail silently. */
  reason?: string;
}

/**
 * Hand the PNG to whatever this device actually has.
 *
 * The share sheet is offered ONLY where it leads somewhere — see
 * {@link prefersShareSheet}. Everywhere else the file is downloaded, which on a
 * desktop is what "share this image" means in practice: the picture lands in
 * Downloads and gets attached from there.
 *
 * A cancelled sheet is a normal outcome and not an error, and is reported
 * separately so the caller does not congratulate somebody who changed their
 * mind. A sheet that fails for any other reason falls through to the download
 * rather than leaving the operator with nothing.
 */
export async function shareCardPng(blob: Blob, filename: string): Promise<SharePngResult> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (prefersShareSheet() && typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return { outcome: 'shared' };
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return { outcome: 'cancelled' };
      // Anything else — a sheet that refused the file type, a permission
      // policy — is not fatal; the download below still works.
    }
  }
  const res = await downloadFile({ blob, filename, contentType: 'image/png', kind: 'image' });
  return res.ok ? { outcome: 'downloaded' } : { outcome: 'failed', reason: res.reason };
}

/**
 * Share an image the SERVER rendered, from its signed URL.
 *
 * Two routes, because the two runtimes want opposite things. Inside the Expo
 * shell a URL is exactly what the native downloader needs and a blob is exactly
 * what it cannot take, so the URL is handed over untouched. In a browser the
 * bytes are fetched first, which buys the share sheet on a phone and a normal
 * download everywhere else — the same routing as a locally drawn card.
 */
export async function shareSavedImage(urls: {
  downloadUrl: string;
  filename: string;
}): Promise<SharePngResult> {
  if (isNativeShell()) {
    const res = await downloadFile({
      url: urls.downloadUrl,
      filename: urls.filename,
      contentType: 'image/png',
      kind: 'image',
    });
    return res.ok ? { outcome: 'downloaded' } : { outcome: 'failed', reason: res.reason };
  }
  let blob: Blob;
  try {
    const r = await fetch(urls.downloadUrl);
    if (!r.ok) throw new Error(`the image could not be fetched (${r.status})`);
    blob = await r.blob();
  } catch (err) {
    return {
      outcome: 'failed',
      reason: err instanceof Error ? err.message : 'The image could not be fetched.',
    };
  }
  return await shareCardPng(blob, urls.filename);
}
