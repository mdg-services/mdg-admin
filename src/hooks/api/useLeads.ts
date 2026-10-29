import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { whatsAppResultsRoot } from '@/hooks/api/useWhatsAppResults';
import { api } from '@/lib/api';
import { hasProcessing } from '@/lib/leads';
import { uploadLeadRecording, type UploadLeadRecordingInput } from '@/lib/uploadLeadRecording';
import type {
  LeadCounts,
  LeadDetail,
  LeadList,
  LeadLookup,
  LeadOwnerOption,
  LeadRecording,
  LeadRecordingAudio,
  LeadView,
  LeadViewerList,
} from '@dk/shared';
import type {
  AssignLeadInput,
  CloseLeadInput,
  CreateLeadInput,
  LeadFromWhatsAppInput,
  LeadNoteInput,
  LogLeadContactInput,
  ReopenLeadInput,
  SetLeadFollowUpInput,
} from '@dk/shared/schemas';

/** Every Leads query hangs off this prefix, so one invalidation refreshes the lists, the counts and any open lead. */
export const leadsRoot = ['leads'] as const;
export const leadsListKey = (view: LeadView, q: string) => ['leads', 'list', view, q] as const;
/** Every tab's list, whatever it was searched for. */
export const leadsListRoot = ['leads', 'list'] as const;
/** The nav badge's own small request: counts only, under the same root. */
export const leadCountsKey = ['leads', 'counts'] as const;
export const leadKey = (id: string) => ['leads', 'detail', id] as const;
export const leadViewersKey = ['leads', 'viewers'] as const;
export const leadOwnersKey = ['leads', 'owners'] as const;
export const leadLookupKey = (person: string) => ['leads', 'lookup', person] as const;

/**
 * The Leads page's list for one tab, with the counts and the funnel that go
 * with it. `q` is what was typed in the search box (name, number or place).
 *
 * The previous answer stays on screen while the next tab loads, so the tiles,
 * the tab numbers and the funnel do not blink out on every tab change; the
 * page treats those rows as not yet the right ones (`isPlaceholderData`).
 * Polls every minute: the server works the follow-up clock out every two, and
 * a socket event only says "something changed", not what.
 */
export function useLeadsQuery(view: LeadView, q: string) {
  return useQuery({
    queryKey: leadsListKey(view, q),
    queryFn: () => api.get<LeadList>('/admin/leads', { view, q: q || undefined }),
    staleTime: 15_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Just the counts, for the nav badge. Every admin: leads are everybody's work. */
export function useLeadCountsQuery() {
  return useQuery({
    queryKey: leadCountsKey,
    queryFn: () => api.get<LeadCounts>('/admin/leads/counts'),
    staleTime: 15_000,
    refetchInterval: 120_000,
  });
}

/** What the nav badge shows: leads due now or nobody has called. */
export function useLeadsTodoCount(): number {
  return useLeadCountsQuery().data?.todo ?? 0;
}

/** How often an open lead asks again while a call recording is being listened to. */
const PROCESSING_POLL_MS = 5_000;

/**
 * One lead in full, fetched by id so a link from an alert opens it even when it is not on the page the list shows.
 *
 * While a call recording is being written down and summarised it asks again
 * every five seconds, so the summary appears by itself; otherwise it does not poll.
 */
export function useLeadQuery(id: string | null) {
  return useQuery({
    queryKey: leadKey(id ?? ''),
    queryFn: () => api.get<LeadDetail>(`/admin/leads/${id}`),
    enabled: !!id,
    staleTime: 10_000,
    refetchInterval: (query) =>
      hasProcessing(query.state.data?.recordings) ? PROCESSING_POLL_MS : false,
  });
}

/** People who opened the full film without a personal link: nobody we can name. Only asked for on their tab. */
export function useLeadViewersQuery(enabled: boolean) {
  return useQuery({
    queryKey: leadViewersKey,
    queryFn: () => api.get<LeadViewerList>('/admin/leads/viewers'),
    enabled,
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
}

/** The admins a lead can be given to. Asked for only while the Assign form is open. */
export function useLeadOwnersQuery(enabled: boolean) {
  return useQuery({
    queryKey: leadOwnersKey,
    queryFn: () => api.get<LeadOwnerOption[]>('/admin/leads/owners'),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/**
 * Whether a WhatsApp chat is a lead, for the line in the inbox's contact panel.
 * `null` is "not a lead". It never retries: that panel prints nothing when the
 * answer is no or it cannot be had, and must not hold a retry loop open for it.
 */
export function useLeadLookupQuery(person: string | null) {
  return useQuery({
    queryKey: leadLookupKey(person ?? ''),
    queryFn: () => api.get<LeadLookup | null>('/admin/leads/lookup', { person }),
    enabled: !!person,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * The lists, the counts, the open lead and the `lead_*` alerts that clear or
 * move with a change. On SETTLED, so a failure (somebody else just closed the
 * lead) also pulls the screen back to the truth.
 */
function useRefreshAfterChange() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: leadsRoot });
    void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
  };
}

interface Vars<B> {
  id: string;
  body: B;
}

/** Record that somebody at MDG called, messaged or met them, and what came of it. */
export function useLogLeadContact() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, body }: Vars<LogLeadContactInput>) =>
      api.post<LeadDetail>(`/admin/leads/${id}/contacts`, body),
    onSettled: refresh,
  });
}

/** Choose when to get in touch next. */
export function useSetLeadFollowUp() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, body }: Vars<SetLeadFollowUpInput>) =>
      api.post<LeadDetail>(`/admin/leads/${id}/follow-up`, body),
    onSettled: refresh,
  });
}

/** Give a lead to an admin, or to nobody. */
export function useAssignLead() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, body }: Vars<AssignLeadInput>) =>
      api.post<LeadDetail>(`/admin/leads/${id}/assign`, body),
    onSettled: refresh,
  });
}

/** A note on the lead. It does not move the follow-up. */
export function useAddLeadNote() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, body }: Vars<LeadNoteInput>) =>
      api.post<LeadDetail>(`/admin/leads/${id}/notes`, body),
    onSettled: refresh,
  });
}

/** Close a lead by hand. */
export function useCloseLead() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, body }: Vars<CloseLeadInput>) =>
      api.post<LeadDetail>(`/admin/leads/${id}/close`, body),
    onSettled: refresh,
  });
}

/** Open a closed lead again. It does not take anybody off the WhatsApp stop list. */
export function useReopenLead() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, body }: Vars<ReopenLeadInput>) =>
      api.post<LeadDetail>(`/admin/leads/${id}/reopen`, body),
    onSettled: refresh,
  });
}

/**
 * The lead a number-adding request left standing. A number that another lead
 * already holds merges the two, and the server answers with the one that
 * survived; read here as an `id` or a whole lead, falling back to the lead the
 * number was typed on.
 */
export function survivingLeadId(res: unknown, fallback: string): string {
  if (typeof res === 'string' && res) return res;
  if (res && typeof res === 'object') {
    const r = res as { id?: unknown; leadId?: unknown; lead?: { id?: unknown } };
    for (const candidate of [r.id, r.leadId, r.lead?.id]) {
      if (typeof candidate === 'string' && candidate) return candidate;
    }
  }
  return fallback;
}

/**
 * Add a lead by hand. The answer is the lead made, or the one that already had
 * the number (`existed`), whose drawer the page opens either way.
 */
export function useCreateLead() {
  const refresh = useRefreshAfterChange();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateLeadInput) => {
      const res = await api.post<LeadDetail & { id: string; existed: boolean }>('/admin/leads', body);
      return { id: res.id || res.lead.id, existed: res.existed === true, detail: res as LeadDetail };
    },
    onSuccess: ({ id, detail }) => {
      qc.setQueryData(leadKey(id), detail);
    },
    onSettled: refresh,
  });
}

/**
 * "Add as lead" for somebody a WhatsApp campaign went to: a row of Message
 * results, or a chat in the inbox. The server finds the campaign and the
 * greeting it used; the answer is the lead made, or the one that already had
 * the number (`existed`), like `useCreateLead`.
 *
 * Besides the Leads queries (which also carry the inbox's lead lookup) it
 * refreshes Message results, so the row turns into a link to the lead.
 */
export function useAddLeadFromWhatsApp() {
  const refresh = useRefreshAfterChange();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: LeadFromWhatsAppInput) => {
      const res = await api.post<LeadDetail & { id: string; existed: boolean }>(
        '/admin/leads/from-whatsapp',
        body,
      );
      return {
        id: res.id || res.lead.id,
        existed: res.existed === true,
        detail: res as LeadDetail,
      };
    },
    onSuccess: ({ id, detail }) => {
      qc.setQueryData(leadKey(id), detail);
    },
    onSettled: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: whatsAppResultsRoot });
    },
  });
}

/** Give a share-link lead the number somebody knows for them. */
export function useAddLeadPhone() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: async ({ id, body }: Vars<{ mobile: string }>) =>
      survivingLeadId(await api.post<unknown>(`/admin/leads/${id}/phone`, body), id),
    onSettled: refresh,
  });
}

// ── Call recordings ─────────────────────────────────────────────────────────

/** The same refresh as `useRefreshAfterChange`, without the alerts: a recording moves no alert. */
function useRefreshLeads() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: leadsRoot });
}

/**
 * Put a call recording on a lead: sign, send, tell the server. The server's
 * answer is the whole lead, which goes straight into the open drawer so the new
 * recording shows (as "listening") without waiting for the next fetch.
 */
export function useUploadLeadRecording() {
  const qc = useQueryClient();
  const refresh = useRefreshLeads();
  return useMutation({
    mutationFn: (input: UploadLeadRecordingInput) => uploadLeadRecording(input),
    onSuccess: (detail, { id }) => {
      qc.setQueryData(leadKey(id), detail);
    },
    onSettled: refresh,
  });
}

/**
 * A short-lived link to play one recording. Asked for when somebody presses
 * Play, never kept: a link runs out, and the answer to "it stopped" is another.
 */
export function fetchLeadRecordingAudio(
  leadId: string,
  recordingId: string,
  signal?: AbortSignal,
): Promise<LeadRecordingAudio> {
  return api.get<LeadRecordingAudio>(
    `/admin/leads/${leadId}/recordings/${recordingId}/audio`,
    undefined,
    signal,
  );
}

interface RecordingVars {
  id: string;
  recordingId: string;
}

/**
 * Wait for the lead to be read again before saying done. Retry and Remove
 * change what the card shows, and a button that stopped spinning on the old
 * card ("failed", still there) would look as if nothing had happened.
 */
function useRefreshLeadsAndWait() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: leadsRoot });
}

/** Listen to a recording that failed once more. */
export function useRetryLeadRecording() {
  const refresh = useRefreshLeadsAndWait();
  return useMutation({
    mutationFn: ({ id, recordingId }: RecordingVars) =>
      api.post<unknown>(`/admin/leads/${id}/recordings/${recordingId}/retry`),
    onSettled: refresh,
  });
}

/** Take a recording and its summary off the lead, for everybody. */
export function useDeleteLeadRecording() {
  const refresh = useRefreshLeadsAndWait();
  return useMutation({
    mutationFn: ({ id, recordingId }: RecordingVars) =>
      api.del<unknown>(`/admin/leads/${id}/recordings/${recordingId}`),
    onSettled: refresh,
  });
}

/**
 * When the last recording on an open lead finishes being listened to, the
 * list's "Last call" line has something new to say. Refresh the lists once,
 * then, rather than wait for their minute.
 */
export function useRefreshListsWhenAnalysed(recordings: readonly Pick<LeadRecording, 'status'>[]) {
  const qc = useQueryClient();
  const busy = hasProcessing(recordings);
  const wasBusy = React.useRef(busy);
  React.useEffect(() => {
    if (wasBusy.current && !busy) void qc.invalidateQueries({ queryKey: leadsListRoot });
    wasBusy.current = busy;
  }, [busy, qc]);
}
