import type { Attachment } from '@dk/shared';

import { api } from './api';

/**
 * Download an attachment through a FRESH signed URL — the URLs embedded on
 * messages expire, so always re-sign. `disposition=attachment` makes the
 * browser save the navigation instead of rendering it, so a plain
 * `window.open` is the whole download flow. `filename` overrides the name
 * derived from the storage key (a bare UUID for voice notes) so the saved
 * file keeps the attachment's original name.
 */
export async function downloadAttachment(attachment: Attachment): Promise<void> {
  const { url } = await api.get<{ url: string }>('/uploads/download-url', {
    key: attachment.storageKey,
    disposition: 'attachment',
    filename: attachment.filename,
  });
  window.open(url, '_blank', 'noopener');
}
