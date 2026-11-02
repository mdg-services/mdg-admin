import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { compressImage } from '@/lib/compressImage';
import { resolveFileType } from '@/lib/uploadAttachment';
import {
  CLAIM_UPLOAD_MAX_BYTES,
  claimPollInterval,
  upsertClaim,
} from '@/pages/dealers/vault/calibrationClaim/format';
import type {
  CalibrationClaimOverview,
  CalibrationClaimView,
  ClaimFileUrls,
  ClaimUploadSlot,
  PresignUploadResponse,
  WemmisLoginStatus,
} from '@dk/shared';
import type { CalibrationClaimActionInput } from '@dk/shared/schemas';

import { LIVE_CAPTCHA_KEY } from './useLiveCaptchaPrompts';

/**
 * The calibration claim's endpoints, mounted at `/api/v1/calibration-claim`.
 *
 * Shaped like `useLoadPlanner.ts`: one key root so a write can clear everything
 * this feature caches, and one overview read the whole pane draws from. Unlike
 * the Load Planner the overview POLLS — a claim is moved on by robots and by the
 * owner, not only by the admin looking at it — and how often is decided by
 * `claimPollInterval` from what the claim is waiting for.
 *
 * Every write that answers with a claim writes that claim into the cached
 * overview straight away, so a press shows its result without waiting for the
 * next poll, and then re-reads, because the overview also carries what the answer
 * does not (a picture code waiting for a person, the years still open to start).
 *
 * "Run now" is not here: a claim's portal runs are queued by the claim itself
 * (a button posts an action; the server starts the run), never by the generic
 * run-now route.
 */
export const calibrationClaimKeys = {
  all: ['calibrationClaim'] as const,
  overview: (dealerId: string | undefined) => ['calibrationClaim', 'overview', dealerId] as const,
  files: (claimId: string | undefined, slot: string | undefined) =>
    ['calibrationClaim', 'files', claimId, slot] as const,
  claimFiles: (claimId: string) => ['calibrationClaim', 'files', claimId] as const,
  live: LIVE_CAPTCHA_KEY,
};

/**
 * Everything one dealer's pane needs: whether the service is attached, the
 * claims (newest first), the eMaaptaul login, the settings, any picture code
 * waiting for a person, and the financial years a claim may still be started for.
 */
export function useCalibrationClaimOverview(dealerId: string | undefined) {
  return useQuery({
    queryKey: calibrationClaimKeys.overview(dealerId),
    enabled: !!dealerId,
    queryFn: () => api.get<CalibrationClaimOverview>(`/calibration-claim/dealers/${dealerId}`),
    staleTime: 30_000,
    refetchInterval: (query) => claimPollInterval(query.state.data),
  });
}

/** Write one claim's new state into the cached overview, then re-read the rest. */
function cacheClaim(qc: QueryClient, dealerId: string, view: CalibrationClaimView): void {
  const key = calibrationClaimKeys.overview(dealerId);
  qc.setQueryData<CalibrationClaimOverview>(key, (old) => (old ? upsertClaim(old, view) : old));
  void qc.invalidateQueries({ queryKey: key });
}

/** `POST /calibration-claim/dealers/:dealerId/claims` — start a claim for a financial year ("2026-27"). */
export function useStartCalibrationClaim(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (financialYear: string) =>
      api.post<CalibrationClaimView>(`/calibration-claim/dealers/${dealerId}/claims`, {
        financialYear,
      }),
    onSuccess: (view) => cacheClaim(qc, dealerId, view),
  });
}

export interface ClaimActionVars {
  claimId: string;
  action: CalibrationClaimActionInput;
}

/**
 * `POST /calibration-claim/claims/:claimId/action` — every button on a claim.
 *
 * One mutation for all of them, so `variables.action.type` says WHICH button is
 * in flight and each can show its own spinner while the rest stay still.
 *
 * A refusal re-reads the pane at once. The server turns a press down when the claim
 * is no longer what the admin was looking at (the values changed since the Approve
 * box opened, a run started, the stage moved on), so the toast with its sentence is
 * only half of "look again": the other half is a pane that shows what is there now.
 */
export function useCalibrationClaimAction(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ claimId, action }: ClaimActionVars) =>
      api.post<CalibrationClaimView>(`/calibration-claim/claims/${claimId}/action`, action),
    onSuccess: (view) => cacheClaim(qc, dealerId, view),
    onError: () => {
      void qc.invalidateQueries({ queryKey: calibrationClaimKeys.overview(dealerId) });
    },
  });
}

export interface UploadClaimPaperVars {
  claimId: string;
  slot: ClaimUploadSlot;
  file: File;
}

/** The paper could not leave the browser — nothing was filed. Said in words, not as a fetch error. */
const UPLOAD_UNREACHABLE =
  'The upload could not reach the server. Check the connection and try again.';

/**
 * File a paper an admin holds into one of the claim's slots:
 * shrink a photo, presign (scope `calibration`, under the claim's folder), PUT the
 * bytes, then tell the claim where they are.
 *
 * THE TYPE COMES FROM `resolveFileType`, never from `file.type` alone — an Android
 * picker routinely hands back an empty type, and the presign would refuse an
 * octet-stream. A photo is shrunk BEFORE the presign: the signed PUT carries the
 * size and type it was told, so shrinking afterwards would make both describe a
 * file that was never sent. A PDF is sent as it is.
 */
export function useUploadClaimPaper(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ claimId, slot, file }: UploadClaimPaperVars) => {
      const resolved = resolveFileType(file, { assumeImage: false });
      let upload = file;
      let contentType = resolved.contentType;
      if (resolved.kind === 'image') {
        const shrunk = await compressImage(file, { contentType });
        if (shrunk) {
          upload = shrunk;
          contentType = shrunk.type || contentType;
        }
      }
      if (upload.size > CLAIM_UPLOAD_MAX_BYTES) {
        throw new Error('That file is too large. Send a smaller scan or photo (10 MB at most).');
      }
      const filename = upload.name || `${slot}.${resolved.kind === 'image' ? 'jpg' : 'pdf'}`;

      const presign = await api.post<PresignUploadResponse>('/uploads/sign', {
        filename,
        contentType,
        size: upload.size,
        scope: 'calibration',
        dealerId,
        claimId,
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

      return api.post<CalibrationClaimView>(
        `/calibration-claim/claims/${claimId}/documents/${slot}`,
        {
          storageKey: presign.storageKey,
          filename,
          contentType,
          size: upload.size,
        },
      );
    },
    onSuccess: (view, vars) => {
      cacheClaim(qc, dealerId, view);
      // A replaced paper keeps its slot, so any signed link already fetched is the old file.
      void qc.invalidateQueries({ queryKey: calibrationClaimKeys.claimFiles(vars.claimId) });
    },
  });
}

/** The query behind both "view" and "download": short-lived signed links for one paper. */
function fileUrlsQuery(claimId: string, slot: string) {
  return {
    queryKey: calibrationClaimKeys.files(claimId, slot),
    queryFn: () => api.get<ClaimFileUrls>(`/calibration-claim/claims/${claimId}/files/${slot}`),
  };
}

/**
 * `GET /calibration-claim/claims/:claimId/files/:slot` — fetched only while a paper
 * is open. The links are signatures that expire, so a copy that outlived one would
 * answer 403 on click; a minute is well inside `expiresIn`.
 */
export function useClaimFileUrls(
  claimId: string | undefined,
  slot: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    ...fileUrlsQuery(claimId ?? '', slot ?? ''),
    enabled: enabled && !!claimId && !!slot,
    staleTime: 60_000,
    retry: false,
  });
}

/** The same links, read on demand for a Download button that is not showing the paper. */
export function fetchClaimFileUrls(
  qc: QueryClient,
  claimId: string,
  slot: string,
): Promise<ClaimFileUrls> {
  return qc.fetchQuery({ ...fileUrlsQuery(claimId, slot), staleTime: 30_000 });
}

/** Write the login status into the overview so the card shows it at once, then re-read. */
function cacheWemmis(qc: QueryClient, dealerId: string, wemmis: WemmisLoginStatus): void {
  const key = calibrationClaimKeys.overview(dealerId);
  qc.setQueryData<CalibrationClaimOverview>(key, (old) => (old ? { ...old, wemmis } : old));
  void qc.invalidateQueries({ queryKey: key });
}

export interface SaveWemmisLoginVars {
  username: string;
  password: string;
}

/** `PUT /calibration-claim/dealers/:dealerId/wemmis-login` — an admin types the eMaaptaul login. */
export function useSaveWemmisLogin(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveWemmisLoginVars) =>
      api.put<WemmisLoginStatus>(`/calibration-claim/dealers/${dealerId}/wemmis-login`, body),
    onSuccess: (status) => cacheWemmis(qc, dealerId, status),
  });
}

/** `DELETE /calibration-claim/dealers/:dealerId/wemmis-login` — forget the saved login. */
export function useClearWemmisLogin(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.del<WemmisLoginStatus>(`/calibration-claim/dealers/${dealerId}/wemmis-login`),
    onSuccess: (status) => cacheWemmis(qc, dealerId, status),
  });
}

export interface AnswerLiveCaptchaVars {
  sessionId: string;
  answer: string;
}

/** `POST /calibration-claim/live/:sessionId` — type the picture code the robot could not read. */
export function useAnswerLiveCaptcha(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, answer }: AnswerLiveCaptchaVars) =>
      api.post<{ ok: true }>(`/calibration-claim/live/${sessionId}`, { answer }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: calibrationClaimKeys.overview(dealerId) });
      void qc.invalidateQueries({ queryKey: calibrationClaimKeys.live });
    },
  });
}
