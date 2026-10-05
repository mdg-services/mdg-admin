import type { Attachment, AttachmentKind, PresignUploadResponse } from '@dk/shared';

import { api } from './api';
import { compressImage } from './compressImage';

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

/**
 * The same fallback for the documents `/uploads/sign` accepts: PDF, plain text
 * and the two Office Open XML formats. A scan or a report picked through an
 * Android picker arrives with an empty type just as a photograph does, and
 * without this it went up as `application/octet-stream`, which the server
 * refuses. They resolve to kind `file`, so a caller that only takes photographs
 * (`kind === 'image'`) still turns them away.
 */
const DOCUMENT_EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
 * `mdg-client/src/lib/uploadAttachment.ts`, narrowed to the photographs and the
 * documents the admin actually picks.
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
  const documentType = DOCUMENT_EXT_MIME[ext];
  if (documentType) return { kind: 'file', contentType: documentType };

  // The camera-capture path knows it produced an image even when nothing else does.
  if (opts?.assumeImage) return { kind: 'image', contentType: 'image/jpeg' };

  return { kind: 'file', contentType: 'application/octet-stream' };
}

/**
 * The file picker's `accept` for anything sent through `/uploads/sign`: images,
 * PDF, plain text and the two Office Open XML formats — exactly what the server
 * presigns (`ALLOWED_PREFIXES` / `ALLOWED_EXACT` in the backend's uploads
 * route). The old lists also offered .doc, .xls and .csv, which the server
 * refuses as "Content type not allowed", so the picker invited a file the send
 * then failed on with a sentence that did not say what would have worked.
 */
export const UPLOAD_ACCEPT =
  'image/*,.pdf,.docx,.xlsx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain';

/** The sentence for a file the server would refuse, naming what does work. */
export function notSendableMessage(name: string): string {
  return `${name} cannot be sent. Use a photo, a PDF, a Word (.docx) or Excel (.xlsx) file, or a text file.`;
}

/**
 * Whether the server will presign this file — checked at pick time, because
 * `accept` is only a hint: a picker's "all files" still hands back a .doc. The
 * type comes from `resolveFileType`, so a typeless PDF from an Android picker
 * passes.
 */
export function isSendable(file: File): boolean {
  const type = resolveFileType(file).contentType;
  return (
    type.startsWith('image/') ||
    type.startsWith('audio/') ||
    type === 'application/pdf' ||
    type === 'text/plain' ||
    type.startsWith('application/vnd.openxmlformats-officedocument.')
  );
}

/** What `uploadAttachment` shrinks: what a phone camera produces. */
const PHOTO_TYPES = new Set(['image/jpeg', 'image/heic', 'image/heif']);

/**
 * Send one chat attachment: shrink it if it is a photograph, presign, PUT.
 *
 * THE TYPE COMES FROM `resolveFileType`, never from `file.type` alone. This used
 * to presign `file.type || 'application/octet-stream'`, so a photograph taken
 * through the Android shell — whose picker routinely hands back an empty type —
 * went up as octet-stream, `/uploads/sign` answered "Content type not allowed",
 * and the photo stayed staged under the box. Every other admin photo path
 * already resolved the type first; this one had been missed.
 *
 * A CAMERA PHOTOGRAPH (JPEG, HEIC) IS SHRUNK BEFORE THE PRESIGN — never a PNG or
 * a WebP: those are screenshots, logos and charts, `compressImage` re-encodes to
 * JPEG on an unfilled canvas, and a transparent background would arrive black
 * and a screenshot of text blurred. Shrunk with `compressImage`'s defaults
 * (1,600px at q0.70), exactly as the Kavach proof and the register page are. An
 * account manager sends these from a forecourt, and the dealer then downloads
 * them on their own phone; a 4-12 MB camera original was costing both ends a
 * minute of 2G for a picture nobody reads at full size. Before the presign and
 * not after, so the size and type the server signed describe the bytes that are
 * actually PUT. `compressImage` returns null when shrinking is not worth it (or
 * cannot be done, as with a HEIC the canvas cannot decode), and then the
 * original goes as it is.
 */
export async function uploadAttachment(
  file: File,
  conversationId: string,
  durationMs?: number,
): Promise<Attachment> {
  const resolved = resolveFileType(file);
  let upload = file;
  let contentType = resolved.contentType;
  if (PHOTO_TYPES.has(contentType)) {
    const compressed = await compressImage(file, { contentType });
    if (compressed) {
      upload = compressed;
      contentType = compressed.type || contentType;
    }
  }

  // A backstop on what will actually be sent. The pickers already turn away a
  // file over the limit before it gets here.
  if (upload.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('File exceeds 25 MB limit');
  }

  const presign = await api.post<PresignUploadResponse>('/uploads/sign', {
    filename: upload.name,
    contentType,
    size: upload.size,
    scope: 'chat',
    conversationId,
  });

  const putRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: upload,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed (${putRes.status})`);
  }

  return {
    storageKey: presign.storageKey,
    filename: upload.name,
    contentType,
    size: upload.size,
    kind: resolved.kind,
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
