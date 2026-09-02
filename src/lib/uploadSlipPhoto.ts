import { api, ApiError } from '@/lib/api';
import { compressImage } from '@/lib/compressImage';
import { resolveFileType } from '@/lib/uploadAttachment';
import type { PresignUploadResponse } from '@dk/shared';
import { SLIP_PHOTO_MAX_BYTES, SLIP_PHOTO_MIME_TYPES } from '@dk/shared/schemas';

/**
 * Get one photograph of a shift slip into the bucket, on a forecourt phone.
 *
 * Three things happen here and each of them exists because of the connection
 * this runs on rather than because of the picture:
 *
 * 1. **It is shrunk before anything is signed.** The presigned PUT carries the
 *    size and the type the server was told about, so shrinking afterwards would
 *    make both of them describe a file that was never sent. Shrinking first
 *    means the declared size IS the uploaded size, which is what lets the read
 *    route refuse an oversize photograph one round trip earlier.
 * 2. **The PUT is an `XMLHttpRequest`, not `fetch`.** `fetch` has no upload
 *    progress at all, and a 4 MB photograph on 2G is well over a minute — a
 *    spinner that long is indistinguishable from a hang, and an operator who
 *    cannot tell those apart takes the photograph again, which doubles the
 *    upload. XHR is the only thing in a browser that reports bytes sent.
 * 3. **It can be stopped.** The same phone that takes a minute to upload is the
 *    one whose owner changes their mind, and a morning must never be held
 *    hostage to a photograph: typing always wins.
 *
 * THE SLIP PROFILE IS NOT THE ADMIN'S USUAL ONE, deliberately. `compressImage`'s
 * defaults — 1,600px, q0.70 — were chosen so a person could eyeball a
 * handwritten register over 2G. This photograph is not eyeballed for the gist;
 * every character of `48615.550` is read off it, and the last digit of a
 * totaliser is hundreds of litres. So the slip asks for a longer edge and a
 * gentler quality, and leaves every other photograph in the admin exactly as it
 * is. These two numbers are a judgement, not a measurement: one real slip run at
 * both settings settles them, and this is the one place they change.
 */

/** Longest edge kept for a slip. Chosen for digits, not for eyeballs. */
const SLIP_MAX_EDGE = 2400;
/** JPEG quality for a slip. Higher than the register page's for the same reason. */
const SLIP_JPEG_QUALITY = 0.85;
/** Below this a slip is already small enough that re-encoding only loses detail. */
const SLIP_MIN_COMPRESS_BYTES = 900 * 1024;

/**
 * Why an upload did not finish, in the four shapes the panel has to say
 * different things about.
 *
 * `SERVER_REFUSED` carries the server's own sentence and the panel prints it
 * verbatim — the messages the read and presign routes return are already the
 * ones this feature is supposed to say, and re-wording them here would give one
 * refusal two spellings.
 */
export type SlipUploadFailure =
  | 'NOT_A_PHOTO'
  | 'TOO_BIG'
  | 'STOPPED'
  | 'NO_CONNECTION'
  | 'UPLOAD_FAILED'
  | 'SERVER_REFUSED';

export class SlipUploadError extends Error {
  readonly kind: SlipUploadFailure;

  constructor(kind: SlipUploadFailure, message: string) {
    super(message);
    this.name = 'SlipUploadError';
    this.kind = kind;
  }
}

/** What was actually PUT — the body of the read request, verbatim. */
export interface SlipPhotoUpload {
  storageKey: string;
  filename: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  size: number;
}

export interface UploadSlipPhotoInput {
  dealerId: string;
  file: File;
  /** Called as the work moves on, so the panel can say which of the two it is in. */
  onStage?: (stage: 'shrinking' | 'uploading') => void;
  /** 0–100, only while bytes are actually moving. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

function isSlipMime(type: string): type is SlipPhotoUpload['contentType'] {
  return (SLIP_PHOTO_MIME_TYPES as readonly string[]).includes(type);
}

export async function uploadSlipPhoto(input: UploadSlipPhotoInput): Promise<SlipPhotoUpload> {
  const { dealerId, file, onStage, onProgress, signal } = input;
  if (signal?.aborted) throw new SlipUploadError('STOPPED', 'Reading the slip was stopped.');

  /*
   * `assumeImage: true`, and this is not a formality. An Android System WebView
   * camera capture hands back an empty MIME, and telling an operator that the
   * photograph they have just taken is not a photograph is the single most
   * confusing refusal this panel could make.
   */
  const resolved = resolveFileType(file, { assumeImage: true });
  if (resolved.kind !== 'image') {
    throw new SlipUploadError(
      'NOT_A_PHOTO',
      'That is not a photo. Take a photo of the slip, or choose a picture from the phone.',
    );
  }

  onStage?.('shrinking');
  let upload = file;
  let contentType = resolved.contentType;
  /*
   * `compressImage` returns null whenever shrinking is not safe — a HEIC the
   * canvas cannot decode, an animated GIF, a decode that threw, a result bigger
   * than the original. The original is then sent as it stands and the size cap
   * below refuses it if it is too big, which is the honest order: a photograph
   * that cannot be shrunk is not a photograph that should be silently corrupted.
   */
  const compressed = await compressImage(file, {
    contentType,
    maxEdge: SLIP_MAX_EDGE,
    quality: SLIP_JPEG_QUALITY,
    minBytes: SLIP_MIN_COMPRESS_BYTES,
  });
  if (compressed) {
    upload = compressed;
    contentType = compressed.type || contentType;
  }
  if (signal?.aborted) throw new SlipUploadError('STOPPED', 'Reading the slip was stopped.');

  /*
   * The type is checked against the three the read route accepts, not against
   * "is it an image". A HEIC cannot be shrunk by a browser canvas and cannot be
   * shown back on the screen where the operator is meant to check it against the
   * paper — and a verification screen with no evidence on it is worse than no
   * screen at all. Refused here so the refusal costs no upload.
   */
  if (!isSlipMime(contentType)) {
    throw new SlipUploadError(
      'NOT_A_PHOTO',
      'That is not a photo the screen can show back to you. Take it again with the camera, or choose a JPEG or PNG.',
    );
  }
  if (upload.size > SLIP_PHOTO_MAX_BYTES) {
    throw new SlipUploadError(
      'TOO_BIG',
      'That photo is too large. Take it again with the camera’s normal setting.',
    );
  }

  const filename = upload.name || 'slip.jpg';
  let presign: PresignUploadResponse;
  try {
    presign = await api.post<PresignUploadResponse>(
      '/uploads/sign',
      { filename, contentType, size: upload.size, scope: 'slip', dealerId },
      signal,
    );
  } catch (err) {
    if (signal?.aborted) throw new SlipUploadError('STOPPED', 'Reading the slip was stopped.');
    // The presign route's own words — "Only MDG can send a shift slip.", the
    // size and type refusals — are the right sentences already.
    if (err instanceof ApiError) {
      throw new SlipUploadError(
        err.status === 0 ? 'NO_CONNECTION' : 'SERVER_REFUSED',
        err.status === 0
          ? 'The slip did not go up — check the connection and try again. Nothing has been filled in.'
          : err.message,
      );
    }
    throw new SlipUploadError('UPLOAD_FAILED', 'The slip did not finish uploading. Nothing has been filled in.');
  }

  onStage?.('uploading');
  onProgress?.(0);
  await putWithProgress(presign.uploadUrl, upload, contentType, onProgress, signal);

  return { storageKey: presign.storageKey, filename, contentType, size: upload.size };
}

/**
 * The PUT itself, with the two things `fetch` cannot do.
 *
 * `xhr.upload.onprogress` is the only bytes-sent signal a browser gives, and
 * `xhr.abort()` is the only way to stop one that is already flying. Everything
 * else here is bookkeeping so that exactly one of resolve/reject runs: an
 * aborted request fires `abort` and then `loadend`, and a listener left on the
 * signal after the request has finished would keep the whole photograph
 * reachable for as long as the panel is open.
 */
function putWithProgress(
  url: string,
  body: File,
  contentType: string,
  onProgress: ((percent: number) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();

    const done = () => {
      signal?.removeEventListener('abort', onAbort);
    };

    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !e.total) return;
      // Capped at 99: the last byte being sent is not the same as the bucket
      // having accepted it, and a bar that sits at 100% while nothing happens is
      // exactly the hang this progress exists to rule out.
      onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      reject(
        new SlipUploadError(
          'UPLOAD_FAILED',
          'The slip did not finish uploading. Nothing has been filled in.',
        ),
      );
    };
    xhr.onerror = () => {
      done();
      reject(
        new SlipUploadError(
          'NO_CONNECTION',
          'The slip did not go up — check the connection and try again. Nothing has been filled in.',
        ),
      );
    };
    xhr.onabort = () => {
      done();
      reject(new SlipUploadError('STOPPED', 'Reading the slip was stopped.'));
    };
    xhr.ontimeout = () => {
      done();
      reject(
        new SlipUploadError(
          'NO_CONNECTION',
          'The slip did not go up — check the connection and try again. Nothing has been filled in.',
        ),
      );
    };

    if (signal) {
      if (signal.aborted) {
        done();
        reject(new SlipUploadError('STOPPED', 'Reading the slip was stopped.'));
        return;
      }
      signal.addEventListener('abort', onAbort);
    }

    xhr.send(body);
  });
}
