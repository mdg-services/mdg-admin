import { api, ApiError } from '@/lib/api';
import {
  recordingAddBody,
  recordingFileProblem,
  recordingPresignBody,
  recordingType,
} from '@/lib/leads';
import type { LeadDetail, LeadRecordingUpload } from '@dk/shared';

/**
 * Get one call recording onto a lead: check the file, sign, send, tell the
 * server it is there.
 *
 * It is the slip photograph's route (`uploadSlipPhoto`) with the same reasons,
 * and they matter more here because a call can be 40 MB:
 *
 * 1. **The PUT is an `XMLHttpRequest`, not `fetch`.** `fetch` reports no upload
 *    progress, and a recording on a phone's connection takes minutes. A bar that
 *    does not move reads as a hang, and a person who thinks it hung picks the
 *    file again and sends it twice.
 * 2. **It can be stopped**, up to the moment the server is told about it. After
 *    that the file is in the bucket and only the server's own delete can take
 *    it out, so "Stop" is not offered for the last step.
 * 3. **There is no shrinking.** The bytes picked are the bytes sent, so the size
 *    and type the server signed are always the real ones.
 *
 * The length of the call is read from the file by the browser while the signing
 * request is in flight, so it costs no waiting. It is optional: a browser that
 * cannot tell (a recording from a voice-memo app often reports no length) sends
 * none and the row simply shows no length.
 */

/** Why an upload did not finish, in the shapes the drawer says different things about. */
export type RecordingUploadFailure =
  | 'NOT_ALLOWED'
  | 'STOPPED'
  | 'NO_CONNECTION'
  | 'UPLOAD_FAILED'
  | 'SERVER_REFUSED';

export class RecordingUploadError extends Error {
  readonly kind: RecordingUploadFailure;

  constructor(kind: RecordingUploadFailure, message: string) {
    super(message);
    this.name = 'RecordingUploadError';
    this.kind = kind;
  }
}

const NO_CONNECTION_WORDS = 'The recording did not go up. Check the connection and try again.';
const FAILED_WORDS = 'The recording did not finish going up. Try again.';
const STOPPED_WORDS = 'Stopped. Nothing was saved.';

/** How long to wait for the browser to read a length out of the file before going without one. */
const DURATION_WAIT_MS = 4000;

export interface UploadLeadRecordingInput {
  /** The lead the recording belongs to. */
  id: string;
  file: File;
  /** Called as the work moves on, so the drawer can say which part it is in. */
  onStage?: (stage: 'sending' | 'saving') => void;
  /** 0–100, only while bytes are actually moving. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export async function uploadLeadRecording(input: UploadLeadRecordingInput): Promise<LeadDetail> {
  const { id, file, onStage, onProgress, signal } = input;
  if (signal?.aborted) throw new RecordingUploadError('STOPPED', STOPPED_WORDS);

  // The picker already said so, once. This is the backstop for any other way in.
  const problem = recordingFileProblem(file);
  const contentType = recordingType(file);
  if (problem || !contentType) {
    throw new RecordingUploadError(
      'NOT_ALLOWED',
      problem ?? 'That is not a recording we can take.',
    );
  }

  // Started now and awaited last: by the time the file is up it has long since answered.
  const length = readAudioLength(file, signal);

  onStage?.('sending');
  onProgress?.(0);
  let upload: LeadRecordingUpload;
  try {
    upload = await api.post<LeadRecordingUpload>(
      `/admin/leads/${id}/recordings/presign`,
      recordingPresignBody(file, contentType),
      signal,
    );
  } catch (err) {
    if (signal?.aborted) throw new RecordingUploadError('STOPPED', STOPPED_WORDS);
    if (err instanceof ApiError) {
      // The server's own sentence for a refusal is already the one to show.
      throw err.status === 0
        ? new RecordingUploadError('NO_CONNECTION', NO_CONNECTION_WORDS)
        : new RecordingUploadError('SERVER_REFUSED', err.message);
    }
    throw new RecordingUploadError('UPLOAD_FAILED', FAILED_WORDS);
  }

  await putWithProgress(upload, file, contentType, onProgress, signal);
  const durationSec = await length;

  // Past this point the file is in the bucket: no signal, so a Stop cannot leave it there unclaimed.
  onStage?.('saving');
  try {
    return await api.post<LeadDetail>(
      `/admin/leads/${id}/recordings`,
      recordingAddBody(upload.key, file, contentType, durationSec),
    );
  } catch (err) {
    if (err instanceof ApiError) {
      throw err.status === 0
        ? new RecordingUploadError('NO_CONNECTION', NO_CONNECTION_WORDS)
        : new RecordingUploadError('SERVER_REFUSED', err.message);
    }
    throw new RecordingUploadError('UPLOAD_FAILED', FAILED_WORDS);
  }
}

/**
 * How long the recording runs, in seconds, as the browser reads it off the
 * file, or `null` when it cannot say or does not in time. A recording made in a
 * browser (WebM) reports an endless length, which is no length at all.
 */
export function readAudioLength(file: Blob, signal?: AbortSignal): Promise<number | null> {
  return new Promise<number | null>((resolve) => {
    let url: string | null = null;
    let audio: HTMLAudioElement | null = null;
    let timer = 0;

    const finish = (seconds: number | null) => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (audio) {
        audio.onloadedmetadata = null;
        audio.onerror = null;
        // Releases the file handle, which a bare `src = ''` does not.
        audio.removeAttribute('src');
        audio.load();
        audio = null;
      }
      if (url) URL.revokeObjectURL(url);
      url = null;
      resolve(seconds);
    };
    const onAbort = () => finish(null);

    try {
      audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const d = audio?.duration ?? NaN;
        finish(Number.isFinite(d) && d > 0 ? d : null);
      };
      audio.onerror = () => finish(null);
      timer = window.setTimeout(() => finish(null), DURATION_WAIT_MS);
      if (signal) {
        if (signal.aborted) return finish(null);
        signal.addEventListener('abort', onAbort);
      }
      url = URL.createObjectURL(file);
      audio.src = url;
    } catch {
      finish(null);
    }
  });
}

/**
 * The PUT itself, with the two things `fetch` cannot do: say how many bytes
 * have gone, and be stopped half way. Exactly one of resolve and reject runs,
 * and the listener on the signal is taken off whichever way it ends so a long
 * recording is not held in memory by a finished request.
 *
 * The headers are the ones the link was signed for, set as given: a storage
 * link signed for one content type refuses the same bytes sent as another.
 */
function putWithProgress(
  upload: LeadRecordingUpload,
  body: File,
  contentType: string,
  onProgress: ((percent: number) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const done = () => signal?.removeEventListener('abort', onAbort);
    const fail = (kind: RecordingUploadFailure, message: string) => {
      done();
      reject(new RecordingUploadError(kind, message));
    };

    xhr.open('PUT', upload.uploadUrl, true);
    const headers = upload.headers ?? {};
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    if (!Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) {
      xhr.setRequestHeader('Content-Type', contentType);
    }

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !e.total) return;
      // Held at 99 until the storage answers: the last byte leaving is not the
      // file arriving, and a bar parked at 100% with nothing happening is the hang this is for.
      onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        done();
        onProgress?.(100);
        resolve();
        return;
      }
      fail('UPLOAD_FAILED', FAILED_WORDS);
    };
    xhr.onerror = () => fail('NO_CONNECTION', NO_CONNECTION_WORDS);
    xhr.ontimeout = () => fail('NO_CONNECTION', NO_CONNECTION_WORDS);
    xhr.onabort = () => fail('STOPPED', STOPPED_WORDS);

    if (signal) {
      if (signal.aborted) {
        fail('STOPPED', STOPPED_WORDS);
        return;
      }
      signal.addEventListener('abort', onAbort);
    }

    xhr.send(body);
  });
}
