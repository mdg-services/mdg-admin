import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { compressImage } from '@/lib/compressImage';
import { getSocket } from '@/lib/socket';
import { resolveFileType } from '@/lib/uploadAttachment';
import { useAuthStore } from '@/store/auth';
import type { DuOtpAdminView, PresignUploadResponse } from '@dk/shared';
import {
  DOCUMENT_ASK_MAX_BYTES,
  type DuOtpAnswerInput,
  type DuOtpFileSlot,
} from '@dk/shared/schemas';

/**
 * DU OTP Acknowledgement (ADR 0033), as the admin's Data Vault pane reads and
 * drives it. The routes are mounted at `/api/v1/du-otp`; each one answers
 * `{ ok: true, data }`, which `api` unwraps.
 *
 * One cache entry per outlet holds the whole `DuOtpAdminView`. Every answer an
 * admin gives comes back as that same view, so a mutation REPLACES the cached
 * copy instead of invalidating it — the pane moves to the next step with no
 * second round trip. The two calls that start a robot run (`check`, `submit`)
 * answer only a run id; the pane watches the run and re-reads when it lands.
 */
export const duOtpKeys = {
  all: ['duOtp'] as const,
  dealer: (dealerId: string | undefined) => ['duOtp', dealerId] as const,
};

/** A run that started longer ago than this and still says RUNNING is a dead record, not work in flight. */
const RUN_LIVE_WINDOW_MS = 30 * 60 * 1000;

/**
 * Is something happening that will change this view by itself — a run reading
 * or filing, a certificate being fetched, a submit in flight. While it is, the
 * pane re-reads every few seconds as well as on the socket's word, so a dropped
 * socket never leaves "Filing now" on screen after it has finished.
 */
function isMoving(view: DuOtpAdminView | undefined): boolean {
  if (!view) return false;
  const now = Date.now();
  const liveRun = view.runs.some(
    (r) =>
      (r.status === 'RUNNING' || r.status === 'PENDING') &&
      now - new Date(r.startedAt).getTime() < RUN_LIVE_WINDOW_MS,
  );
  return (
    liveRun ||
    view.fetch.state === 'working' ||
    view.groups.some((g) => g.state === 'submitting' || g.entries.some((e) => e.state === 'submitting'))
  );
}

/**
 * `GET /du-otp/dealers/:dealerId` — everything the pane draws for one outlet.
 *
 * `staleTime` is short because the pane is opened on purpose, usually right
 * after an alert, by someone who wants to know what is true now.
 */
export function useDuOtpAdminView(dealerId: string | undefined) {
  return useQuery({
    queryKey: duOtpKeys.dealer(dealerId),
    enabled: !!dealerId,
    queryFn: () => api.get<DuOtpAdminView>(`/du-otp/dealers/${dealerId}`),
    staleTime: 15_000,
    refetchInterval: (query) => (isMoving(query.state.data) ? 4_000 : false),
  });
}

/** Put a view an answer returned into the cache, so the pane shows it at once. */
function cacheView(qc: QueryClient, dealerId: string, view: DuOtpAdminView): void {
  qc.setQueryData<DuOtpAdminView>(duOtpKeys.dealer(dealerId), view);
}

/**
 * Re-read this outlet whenever the server says its DU OTP state moved
 * (`duOtp:changed`: an event appeared or left the portal, the owner answered a
 * step, a submit started or finished, the certificate fetch moved), and when the
 * app comes back to the foreground.
 *
 * Every admin socket gets the event for every outlet, so the payload's
 * `dealerId` is checked: an event for another outlet must not refetch this one.
 *
 * Mounted by the pane itself, not the shell: nothing else draws this view, and
 * an invalidated query with no observer costs nothing. The socket instance is
 * rebuilt when the signed-in account changes, so the effect follows the token.
 * Coming back to a backgrounded phone refetches too, because the app turns
 * refetch-on-focus off globally and the socket's events are lost meanwhile.
 */
export function useDuOtpLive(dealerId: string | undefined): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    if (!dealerId) return;
    const socket = getSocket();
    if (!socket) return;
    const onChanged = (payload: { dealerId: string }) => {
      if (payload.dealerId !== dealerId) return;
      void qc.invalidateQueries({ queryKey: duOtpKeys.dealer(dealerId) });
    };
    socket.on('duOtp:changed', onChanged);
    return () => {
      socket.off('duOtp:changed', onChanged);
    };
  }, [qc, token, dealerId]);

  React.useEffect(() => {
    if (!dealerId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: duOtpKeys.dealer(dealerId) });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc, dealerId]);
}

/**
 * `POST /du-otp/dealers/:dealerId/check` — read IndianOil's list now. It opens
 * its own login, so it answers with a run id and THEN drives the portal; the
 * caller watches the run rather than re-reading at the moment of the click,
 * when there is nothing new to read yet.
 */
export function useCheckDuOtp(dealerId: string | undefined) {
  return useMutation({
    mutationFn: () => api.post<{ runId: string }>(`/du-otp/dealers/${dealerId}/check`, {}),
  });
}

/** `POST /du-otp/dealers/:dealerId/ask` — post the step-by-step box to the owners' chat again. */
export function useAskDuOtp(dealerId: string | undefined) {
  return useMutation({
    mutationFn: () => api.post<{ posted: number }>(`/du-otp/dealers/${dealerId}/ask`, {}),
  });
}

/**
 * `POST /du-otp/dealers/:dealerId/answer` — an admin fills a step on the owner's
 * behalf. The same body the owner's box sends; the answer is the whole view
 * again, which replaces the cached one.
 */
export function useAnswerDuOtp(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DuOtpAnswerInput) =>
      api.post<DuOtpAdminView>(`/du-otp/dealers/${dealerId}/answer`, input),
    onSuccess: (view) => {
      if (dealerId) cacheView(qc, dealerId, view);
    },
  });
}

export interface SubmitDuOtpVars {
  group: string;
  /** Fill the portal's row and stop before Submit: proves the page, files nothing. */
  dryRun: boolean;
}

/**
 * `POST /du-otp/dealers/:dealerId/submit` — file a group with IndianOil, or try
 * the fill without filing. Answers with a run id; the caller watches it.
 */
export function useSubmitDuOtp(dealerId: string | undefined) {
  return useMutation({
    mutationFn: (vars: SubmitDuOtpVars) =>
      api.post<{ runId: string }>(`/du-otp/dealers/${dealerId}/submit`, vars),
  });
}

export interface UploadDuOtpPaperVars {
  group: string;
  slot: DuOtpFileSlot;
  file: File;
}

/** What went wrong in the browser, said in words rather than as a fetch error. */
const UPLOAD_UNREACHABLE =
  'The upload could not reach the server. Check the connection and try again.';

/**
 * Give a paper to a group: shrink a photo, presign (scope `du-otp`, which needs
 * the dealer), PUT the bytes, then tell the group where they are. The server
 * turns a photo into a PDF; the answer is the whole view.
 *
 * THE TYPE COMES FROM `resolveFileType`, never from `file.type` alone — an
 * Android picker routinely hands back an empty type, and the presign refuses an
 * octet-stream. A photo is shrunk BEFORE the presign because the signed PUT
 * carries the size and type it was told. The shrink keeps more detail than the
 * chat default: the paper is a printed certificate whose small print somebody at
 * IndianOil may have to read.
 */
export function useUploadDuOtpPaper(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ group, slot, file }: UploadDuOtpPaperVars) => {
      if (!dealerId) throw new Error('No outlet is open.');
      const resolved = resolveFileType(file, { assumeImage: false });
      let upload = file;
      let contentType = resolved.contentType;
      if (resolved.kind === 'image') {
        const shrunk = await compressImage(file, { contentType, maxEdge: 2200, quality: 0.82 });
        if (shrunk) {
          upload = shrunk;
          contentType = shrunk.type || contentType;
        }
      }
      if (upload.size > DOCUMENT_ASK_MAX_BYTES) {
        throw new Error('That file is too large. Send a smaller scan or photo (10 MB at most).');
      }
      const filename = upload.name || `${slot}.${resolved.kind === 'image' ? 'jpg' : 'pdf'}`;

      const presign = await api.post<PresignUploadResponse>('/uploads/sign', {
        filename,
        contentType,
        size: upload.size,
        scope: 'du-otp',
        dealerId,
      });
      let put: Response;
      try {
        put = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: upload,
        });
      } catch {
        throw new Error(UPLOAD_UNREACHABLE);
      }
      if (!put.ok) throw new Error(`The upload did not finish (error ${put.status}). Try again.`);

      return api.post<DuOtpAdminView>(`/du-otp/dealers/${dealerId}/answer`, {
        step: 'file',
        group,
        slot,
        key: presign.storageKey,
        filename,
      } satisfies DuOtpAnswerInput);
    },
    onSuccess: (view) => {
      if (dealerId) cacheView(qc, dealerId, view);
    },
  });
}
