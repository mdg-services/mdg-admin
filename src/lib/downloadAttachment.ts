import type { Attachment } from '@dk/shared';

import { api } from './api';
import { isNativeShell, requestNativeDownload } from './nativeBridge';

/** How the download was ultimately delivered to the user. */
export type DownloadMode = 'gallery' | 'browser';

/**
 * Presign a FRESH attachment-disposition URL for a stored object. The signed
 * `attachment.url` that rode in on the message expires, so a download tapped on
 * an older message would 403 — always fetch a new one. `disposition=attachment`
 * makes the browser save the navigation instead of rendering it; `filename`
 * overrides the name derived from the storage key (a bare UUID for voice notes)
 * so the saved file keeps the attachment's original name.
 */
export async function fetchFreshDownloadUrl(
  attachment: Attachment,
): Promise<string> {
  const { url } = await api.get<{ url: string }>('/uploads/download-url', {
    key: attachment.storageKey,
    disposition: 'attachment',
    filename: attachment.filename,
  });
  return url;
}

/**
 * Download an attachment. In the native shell, images go through the
 * 'media:download' bridge (gallery save when the module exists; the shell
 * falls back to the browser otherwise); an old shell that never answers gets
 * the window.open fallback — its nav gate hands the URL to Chrome, which
 * downloads it thanks to the attachment disposition. A plain browser just
 * navigates (no CORS involved). Throws when every path failed.
 */
export async function downloadAttachment(
  attachment: Attachment,
): Promise<DownloadMode> {
  const url = await fetchFreshDownloadUrl(attachment);
  if (isNativeShell()) {
    const result = await requestNativeDownload({
      id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      filename: attachment.filename,
      contentType: attachment.contentType,
      kind: attachment.kind,
    });
    if (result.ok) return result.mode ?? 'browser';
    if (!result.timedOut) throw new Error(result.error || 'Download failed');
    // Old shell without the handler — fall through to the browser path.
  }
  window.open(url, '_blank', 'noopener');
  return 'browser';
}
