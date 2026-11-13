import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { BankHolidayMonthView, BankHolidayStatesView } from '@dk/shared';
import type { ConfirmBankHolidayMonthInput } from '@dk/shared/schemas';

export const bankHolidaysKey = (state: string, year: number, month: number) =>
  ['bankHolidays', state, year, month] as const;

export const bankHolidayStatesKey = ['bankHolidays', 'states'] as const;

/**
 * Every state that has outlets: which outlets, which RBI office its list comes
 * from, when that list last downloaded, plus the outlets with no state at all.
 */
export function useBankHolidayStatesQuery() {
  return useQuery({
    queryKey: bankHolidayStatesKey,
    queryFn: () => api.get<BankHolidayStatesView>('/super-admin/bank-holidays/states'),
    staleTime: 60_000,
  });
}

/** One state's holidays for one month (super-admin only). */
export function useBankHolidayMonthQuery(state: string | null, year: number, month: number) {
  return useQuery({
    queryKey: bankHolidaysKey(state ?? '', year, month),
    queryFn: () =>
      api.get<BankHolidayMonthView>('/super-admin/bank-holidays/month', {
        state: state ?? '',
        year,
        month,
      }),
    enabled: Boolean(state),
    staleTime: 30_000,
  });
}

export function useConfirmBankHolidayMonth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmBankHolidayMonthInput) =>
      api.put<BankHolidayMonthView>('/super-admin/bank-holidays/month', input),
    onSuccess: (data) => {
      qc.setQueryData(bankHolidaysKey(data.state, data.year, data.month), data);
      void qc.invalidateQueries({ queryKey: ['bankHolidays'] });
    },
  });
}

/** Download every state's list from RBI now, instead of waiting for 05:30. */
export function useSyncRbiHolidays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<BankHolidayStatesView>('/super-admin/bank-holidays/sync'),
    onSuccess: (data) => {
      qc.setQueryData(bankHolidayStatesKey, data);
      void qc.invalidateQueries({ queryKey: ['bankHolidays'] });
    },
  });
}
