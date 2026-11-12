import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  AnnouncementOptions,
  AnnouncementPreview,
  AnnouncementView,
} from '@dk/shared';
import type {
  CreateAnnouncementInput,
  PreviewAnnouncementInput,
} from '@dk/shared/schemas';

/**
 * Announcements to many pumps at once (ADR 0039). Super-admin only: a message in
 * a chat cannot be taken back, so the whole page is behind that gate.
 */
export const announcementsKey = ['announcements'] as const;

/** The services the "pumps with a service" picker offers, each with how many run it. */
export function useAnnouncementOptions() {
  return useQuery({
    queryKey: [...announcementsKey, 'options'],
    queryFn: () => api.get<AnnouncementOptions>('/super-admin/announcements/options'),
    staleTime: 60_000,
  });
}

/**
 * Who a send would reach, without sending anything. A query rather than a
 * mutation so the list follows the form: change the audience or the target and
 * the recipients change under the admin's eyes, before Send is ever pressed.
 */
export function useAnnouncementPreview(input: PreviewAnnouncementInput | null) {
  return useQuery({
    queryKey: [...announcementsKey, 'preview', input],
    queryFn: () =>
      api.post<AnnouncementPreview>('/super-admin/announcements/preview', input),
    enabled: input !== null,
    staleTime: 0,
  });
}

/** Newest first. Polls while any announcement is still being posted. */
export function useAnnouncements() {
  return useQuery({
    queryKey: [...announcementsKey, 'list'],
    queryFn: () => api.get<AnnouncementView[]>('/super-admin/announcements'),
    staleTime: 0,
    refetchInterval: (q) =>
      q.state.data?.some((a) => a.status === 'sending') ? 2_000 : false,
  });
}

/** One send with what happened at each pump. Polls until it is finished. */
export function useAnnouncement(id: string | null) {
  return useQuery({
    queryKey: [...announcementsKey, 'one', id],
    queryFn: () => api.get<AnnouncementView>(`/super-admin/announcements/${id}`),
    enabled: id !== null,
    staleTime: 0,
    refetchInterval: (q) => (q.state.data?.status === 'sending' ? 2_000 : false),
  });
}

export function useSendAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAnnouncementInput) =>
      api.post<AnnouncementView>('/super-admin/announcements', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: announcementsKey }),
  });
}
