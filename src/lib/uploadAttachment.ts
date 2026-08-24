import type { Attachment, AttachmentKind, PresignUploadResponse } from '@dk/shared';

import { api } from './api';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Extension → MIME fallbacks for when the browser reports an empty File.type. */
const IMAGE_EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * Resolve a picked file's kind AND a concrete Content-Type, defending against
 * the Android System WebView pickers that hand back a `File` whose `type` is the
 * empty string — common with `content://` providers and camera captures, and the
 * admin portal is used from a phone.
 *
 * Without it a photograph taken through the shell fails a `file.type
 * .startsWith('image/')` check, so the operator is told their photo is not a
 * photo, and it presigns as `application/octet-stream`, which the server refuses
 * for a register page anyway. The same guard as
 * `mdg-client/src/lib/uploadAttachment.ts`, narrowed to the image cases the
 * admin actually picks.
 */
export function resolveFileType(
  file: File,
  opts?: { assumeImage?: boolean },
): { kind: AttachmentKind; contentType: string } {
  const rawType = (file.type || '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (rawType) {
    const kind: AttachmentKind = rawType.startsWith('image/')
      ? 'image'
      : rawType.startsWith('audio/')
        ? 'audio'
        : 'file';
    return { kind, contentType: rawType };
  }

  const ext = extensionOf(file.name);
  const byExt = IMAGE_EXT_MIME[ext];
  if (byExt) return { kind: 'image', contentType: byExt };

  // The camera-capture path knows it produced an image even when nothing else does.
  if (opts?.assumeImage) return { kind: 'image', contentType: 'image/jpeg' };

  return { kind: 'file', contentType: 'application/octet-stream' };
}

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
