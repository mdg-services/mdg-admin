import type { Attachment, PresignUploadResponse } from '@dk/shared';

import { api } from './api';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export async function uploadAttachment(
  file: File,
  conversationId: string,
): Promise<Attachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('File exceeds 25 MB limit');
  }

  const presign = await api.post<PresignUploadResponse>('/uploads/sign', {
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    scope: 'chat',
    conversationId,
  });

  const putRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed (${putRes.status})`);
  }

  const kind: Attachment['kind'] = file.type.startsWith('image/')
    ? 'image'
    : 'file';

  return {
    storageKey: presign.storageKey,
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    kind,
  };
}
