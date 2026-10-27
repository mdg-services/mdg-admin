import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { ApiError, api } from '@/lib/api';
import {
  readBoard,
  readSetup,
  type RawOnboardingBoard,
  type RawOutletSetup,
} from '@/lib/onboarding';
import type { CallBody } from '@/lib/onboardingCalls';
import { approveBody } from '@/lib/outlets';
import type {
  ApproveRegistrationResult,
  OnboardingBoardView,
  OnboardingConfig,
  OutletSetupAdmin,
  PortalId,
  SendSetupWelcomeResult,
  SetupBilling,
  SetupMessageLang,
} from '@dk/shared';
import type { SaveSetupCompanyInput } from '@dk/shared/schemas';

import { enrolmentsRoot } from './useEnrolments';
import { portalLoginKeys } from './usePortalLogins';

/** Every onboarding query hangs off these roots, so one invalidation refreshes them all. */
export const onboardingRoot = ['onboarding'] as const;
export const outletSetupRoot = ['outletSetup'] as const;

export const onboardingBoardKey = (view: OnboardingBoardView) =>
  ['onboarding', 'board', view] as const;
export const onboardingConfigKey = ['onboarding', 'config'] as const;
export const outletSetupKey = (dealerId: string | undefined) => ['outletSetup', dealerId] as const;

/**
 * The Onboarding page: registrations waiting for a yes, outlets on their way,
 * the funnel and the open "forgot password" requests (`GET /admin/onboarding`).
 *
 * Kept fresh by `useOutletSetupLive` (mounted once, in the shell), which
 * refetches on the server's `outletSetup:changed`; the poll covers a socket
 * that dropped.
 */
export function useOnboardingBoardQuery(view: OnboardingBoardView) {
  return useQuery({
    queryKey: onboardingBoardKey(view),
    queryFn: async () =>
      // Read through `readBoard`: a server one release behind sends no `doneBy`,
      // `portalsNotNeeded` or `welcome`, and the page reads them unguarded.
      readBoard(await api.get<RawOnboardingBoard>('/admin/onboarding', { view })),
    staleTime: 15_000,
    refetchInterval: 120_000,
  });
}

/**
 * What the bill form starts from: the one flat monthly price, GST included, in
 * paise (`GET /admin/onboarding/config`). Only asked for while a bill form is
 * open.
 */
export function useOnboardingConfigQuery(enabled = true) {
  return useQuery({
    queryKey: onboardingConfigKey,
    queryFn: () => api.get<OnboardingConfig>('/admin/onboarding/config'),
    enabled,
    staleTime: 60_000,
  });
}

/**
 * One outlet's setup (`GET /dealers/:id/setup`), or `null` for an outlet from
 * before onboarding v2, which has none: the API answers 404 and that is an
 * answer, not a failure. Any other error is a real one and is left to react-query.
 *
 * `null` is what keeps the old Onboarding tab for those outlets and hides it for
 * the new ones, so it must never be returned for a failed request.
 */
export function useOutletSetupQuery(dealerId: string | undefined) {
  return useQuery({
    queryKey: outletSetupKey(dealerId),
    queryFn: async (): Promise<OutletSetupAdmin | null> => {
      try {
        const setup = await api.get<RawOutletSetup>(`/dealers/${dealerId}/setup`);
        // Defensive: a body without a stage is not a setup. `readSetup` fills what a
        // server one release behind leaves out.
        return setup && typeof setup.stage === 'string' ? readSetup(setup) : null;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !!dealerId,
    staleTime: 15_000,
  });
}

/**
 * Everything one of the buttons changes: the board, every outlet's setup, the
 * dealer record (its status moves when services start), the dealers list, the
 * registrations count on the nav badge and the alerts that clear with it. Run on
 * SETTLED so a failure also pulls the screen back to the truth.
 */
export function refreshAfterChange(qc: QueryClient, dealerId?: string) {
  void qc.invalidateQueries({ queryKey: onboardingRoot });
  void qc.invalidateQueries({ queryKey: outletSetupRoot });
  void qc.invalidateQueries({ queryKey: enrolmentsRoot });
  void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
  void qc.invalidateQueries({ queryKey: ['dealers'] });
  if (dealerId) void qc.invalidateQueries({ queryKey: ['dealer', dealerId] });
}

/**
 * Approve a registration: makes the outlet and its owner, and sends the WhatsApp
 * welcome in one language, `messageLang` (Hinglish or English). Any admin.
 */
export function useApproveRegistration() {
  const qc = useQueryClient();
  return useMutation({
    // `linkToUserId`: add the registration as another outlet of that owner (`lib/outlets.ts`).
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      code?: string;
      linkToUserId?: string;
      messageLang?: SetupMessageLang;
    }) =>
      api.post<ApproveRegistrationResult>(`/admin/registrations/${id}/approve`, approveBody(body)),
    onSettled: () => refreshAfterChange(qc),
  });
}

/** Change the flat monthly price new bills are raised at. Any admin. */
export function useSetMonthlyPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (monthlyPricePaise: number) =>
      api.put<{ monthlyPricePaise: number }>('/admin/onboarding/config/price', { monthlyPricePaise }),
    onSettled: () => void qc.invalidateQueries({ queryKey: onboardingConfigKey }),
  });
}

/** Close a registration: the lead said no. Any admin. */
export function useCloseRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<unknown>(`/admin/registrations/${id}/close`, { reason }),
    onSettled: () => refreshAfterChange(qc),
  });
}

/** The outlet-level steps, all `POST /dealers/:id/setup/<step>`. */
function useSetupStep<TBody extends object>(step: 'start' | 'watch' | 'close') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealerId, body }: { dealerId: string; body: TBody }) =>
      api.post<unknown>(`/dealers/${dealerId}/setup/${step}`, body),
    onSettled: (_data, _err, vars) => refreshAfterChange(qc, vars.dealerId),
  });
}

// "Send bill", "Record payment" and the pause live in `useBilling.ts`.
/** "Start services": begins the watch (or goes straight live when it is zero days). */
export const useStartServices = () =>
  useSetupStep<{ watchDays: number; overrideReason?: string }>('start');
/** End the watch now, or extend it. */
export const useChangeWatch = () =>
  useSetupStep<{ action: 'end' } | { action: 'extend'; days: number }>('watch');
/** Close an outlet's setup: the lead went away. */
export const useCloseOutletSetup = () => useSetupStep<{ reason: string }>('close');

/** A "forgot password" request is dealt with: somebody called and set a temporary password. */
export function usePasswordHelpDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<unknown>(`/admin/password-help/${id}/done`, {}),
    onSettled: () => void qc.invalidateQueries({ queryKey: onboardingRoot }),
  });
}

// ── reminders, calls and the NO reply (workstream B) ─────────────────────────

/** Log a call to an outlet that is on its way. Any admin. Answers the fresh setup, calls included. */
export function useLogOutletCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealerId, body }: { dealerId: string; body: CallBody }) =>
      api.post<OutletSetupAdmin>(`/dealers/${dealerId}/setup/calls`, body),
    onSettled: (_data, _err, vars) => refreshAfterChange(qc, vars.dealerId),
  });
}

/** Log a call to a registration that has not become an outlet yet. Any admin. */
export function useLogRegistrationCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CallBody }) =>
      api.post<unknown>(`/admin/registrations/${id}/calls`, body),
    onSettled: () => refreshAfterChange(qc),
  });
}

/** "Clear NO": a person has checked and the registration is genuine. Any admin. */
export function useClearNotMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dealerId: string) =>
      api.post<OutletSetupAdmin>(`/dealers/${dealerId}/setup/not-me/clear`, {}),
    onSettled: (_data, _err, dealerId) => refreshAfterChange(qc, dealerId),
  });
}

// ── what an admin does FOR the dealer (round 3) ──────────────────────────────

/**
 * Mark the owner as signed in, for a dealer who cannot use the app yet. A reason
 * is required. It is a stamp, not a real sign-in: the server posts the dealer's
 * next card and says in the chat that the team helped. Any admin. Answers the
 * fresh setup.
 */
export function useMarkSignedIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealerId, body }: { dealerId: string; body: { reason: string } }) =>
      api.post<OutletSetupAdmin>(`/dealers/${dealerId}/setup/sign-in/mark`, body),
    onSettled: (_data, _err, vars) => refreshAfterChange(qc, vars.dealerId),
  });
}

/**
 * Send the "your account is ready" WhatsApp again, in one language. The server
 * keeps the consent rule: when it cannot send, the answer is the words and a
 * `wa.me` link for a person to send by hand (`welcome.sent` is false). A second
 * send after one went needs `force`, or the server answers 409 `WELCOME_ALREADY_SENT`.
 */
export function useSendSetupWelcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dealerId,
      body,
    }: {
      dealerId: string;
      body: { messageLang?: SetupMessageLang; force?: true };
    }) => api.post<SendSetupWelcomeResult>(`/dealers/${dealerId}/setup/welcome/send`, body),
    onSettled: (_data, _err, vars) => refreshAfterChange(qc, vars.dealerId),
  });
}

/** Record that a person sent the welcome from their own phone, so nobody sends it twice. */
export function useWelcomeHandSent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dealerId: string) =>
      api.post<OutletSetupAdmin>(`/dealers/${dealerId}/setup/welcome/hand-sent`, {}),
    onSettled: (_data, _err, dealerId) => refreshAfterChange(qc, dealerId),
  });
}

/**
 * Choose, or change, the oil company for the dealer: the same save the owner's company
 * card makes, and the logins the outlet is asked for follow it. The server refuses before
 * the owner's first sign-in (409 `SIGN_IN_FIRST`) and once the services have started
 * (409 `SETUP_OVER`). Any admin. Answers the fresh setup.
 */
export function useSaveCompanyForDealer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealerId, body }: { dealerId: string; body: SaveSetupCompanyInput }) =>
      api.put<OutletSetupAdmin>(`/dealers/${dealerId}/setup/company`, body),
    // The portals asked for change with the company, so the vault's cards and the ask
    // dialog's list are read again too.
    onSettled: (_data, _err, vars) => {
      refreshAfterChange(qc, vars.dealerId);
      void qc.invalidateQueries({ queryKey: portalLoginKeys.dealer(vars.dealerId) });
    },
  });
}

/**
 * Fill, or change, the bill-to details for the dealer: the same save the owner's
 * billing card makes, so an open bill is refreshed too. The server refuses before
 * the first sign-in (409 `SIGN_IN_FIRST`), while the company is not chosen (409
 * `COMPANY_FIRST`) and once the bill is paid (409 `SETUP_LOCKED`).
 */
export function useSaveBillingForDealer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealerId, body }: { dealerId: string; body: SetupBilling }) =>
      api.put<OutletSetupAdmin>(`/dealers/${dealerId}/setup/billing`, body),
    onSettled: (_data, _err, vars) => refreshAfterChange(qc, vars.dealerId),
  });
}

/** Say one portal login is not needed for this outlet, so the logins step stops asking for it. */
export function useMarkPortalNotNeeded() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dealerId,
      body,
    }: {
      dealerId: string;
      body: { portal: PortalId; reason: string };
    }) => api.post<OutletSetupAdmin>(`/dealers/${dealerId}/setup/portal-not-needed`, body),
    onSettled: (_data, _err, vars) => refreshAfterChange(qc, vars.dealerId),
  });
}

/** Take the mark back: the logins step asks for that portal again. */
export function useUndoPortalNotNeeded() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealerId, portal }: { dealerId: string; portal: PortalId }) =>
      api.del<OutletSetupAdmin>(`/dealers/${dealerId}/setup/portal-not-needed/${portal}`),
    onSettled: (_data, _err, vars) => refreshAfterChange(qc, vars.dealerId),
  });
}
