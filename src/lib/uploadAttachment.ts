import type { Attachment, PresignUploadResponse } from '@dk/shared';

import { api } from './api';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export async function uploadAttachment(
  file: File,
  conversationId: string,
  durationMs?: number,
): Promise<Attachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('File exceeds 25 MB limit');
  }

  const contentType = file.type || 'application/octet-stream';
  const presign = await api.post<PresignUploadResponse>('/uploads/sign', {
    filename: file.name,
    contentType,
    size: file.size,
    scope: 'chat',
    conversationId,
  });

  const putRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed (${putRes.status})`);
  }

  const kind: Attachment['kind'] = contentType.startsWith('image/')
    ? 'image'
    : contentType.startsWith('audio/')
      ? 'audio'
      : 'file';

  return {
    storageKey: presign.storageKey,
    filename: file.name,
    contentType,
    size: file.size,
    kind,
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

/** Format a millisecond duration as m:ss (e.g. 1:07). */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
