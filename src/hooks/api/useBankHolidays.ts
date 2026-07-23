import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { api } from '@/lib/api';
import type {
  BankHolidayMonthView,
  BankHolidayPendingConfirmation,
} from '@dk/shared';
import type { ConfirmBankHolidayMonthInput } from '@dk/shared/schemas';

export const bankHolidaysKey = (year: number, month: number) =>
  ['bankHolidays', year, month] as const;

export const bankHolidaysPendingKey = ['bankHolidays', 'pending'] as const;

/**
 * Months (current + coming) that still have library-suggested national holidays
 * the admin hasn't confirmed. Powers the nav badge + Overview banner. Only
 * super-admins can read this, so the query is disabled for everyone else.
 */
export function useBankHolidayPendingQuery() {
  const isSuperAdmin = useIsSuperAdmin();
  return useQuery({
    queryKey: bankHolidaysPendingKey,
    queryFn: () =>
      api.get<BankHolidayPendingConfirmation>(
        '/super-admin/bank-holidays/pending',
      ),
    enabled: isSuperAdmin,
    staleTime: 60_000,
  });
}

/**
 * The confirmed + suggested bank-holiday rows for one month (super-admin only).
 * The server merges persisted holidays with library suggestions and returns them
 * sorted by date; suggestions carry `id:null, persisted:false, enabled:true`.
 */
export function useBankHolidayMonthQuery(year: number, month: number) {
  return useQuery({
    queryKey: bankHolidaysKey(year, month),
    queryFn: () =>
      api.get<BankHolidayMonthView>('/super-admin/bank-holidays/month', {
        year,
        month,
      }),
    staleTime: 30_000,
  });
}

export function useConfirmBankHolidayMonth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmBankHolidayMonthInput) =>
      api.put<BankHolidayMonthView>('/super-admin/bank-holidays/month', input),
    onSuccess: (data) => {
      // Reflect the confirmed month instantly, then invalidate every month so a
      // roll-forward that touches an adjacent month re-fetches when visited.
      qc.setQueryData(bankHolidaysKey(data.year, data.month), data);
      void qc.invalidateQueries({ queryKey: ['bankHolidays'] });
      // Confirming a month clears/updates the pending-confirmation badge.
      void qc.invalidateQueries({ queryKey: bankHolidaysPendingKey });
    },
  });
}
