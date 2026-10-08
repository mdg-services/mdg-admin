import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { BankHolidaySource, DepotHolidayMonthView } from '@dk/shared';

export const depotHolidaysKey = (year: number, month: number) =>
  ['depotHolidays', year, month] as const;

/**
 * One holiday row inside a confirm-month payload. Mirrors the shape the
 * backend's local `depotHolidayInputSchema` validates
 * (`mdg-backend/src/routes/v1/depotHolidays.ts`) — not imported from
 * `@dk/shared/schemas` because this feature does not touch `shared/`, the
 * same way `BankHolidayInput` does for bank holidays.
 */
export interface DepotHolidayInput {
  date: string;
  name: string;
  source: BankHolidaySource;
  type?: string;
  enabled: boolean;
}

export interface ConfirmDepotHolidayMonthInput {
  year: number;
  month: number;
  holidays: DepotHolidayInput[];
}

/**
 * The confirmed + suggested depot-closure rows for one month, plus a
 * manufactured `weekly: true` row for every Sunday (super-admin only). The
 * server merges persisted closures with library suggestions and returns them
 * sorted by date.
 */
export function useDepotHolidayMonthQuery(year: number, month: number) {
  return useQuery({
    queryKey: depotHolidaysKey(year, month),
    queryFn: () =>
      api.get<DepotHolidayMonthView>('/super-admin/depot-holidays/month', {
        year,
        month,
      }),
    staleTime: 30_000,
  });
}

export function useConfirmDepotHolidayMonth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmDepotHolidayMonthInput) =>
      api.put<DepotHolidayMonthView>('/super-admin/depot-holidays/month', input),
    onSuccess: (data) => {
      // Reflect the confirmed month instantly, then invalidate every month so
      // a nearby edit re-fetches when that month is next visited.
      qc.setQueryData(depotHolidaysKey(data.year, data.month), data);
      void qc.invalidateQueries({ queryKey: ['depotHolidays'] });
    },
  });
}
