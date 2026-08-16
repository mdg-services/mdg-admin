import { CalendarPlus, RefreshCw } from 'lucide-react';
import * as React from 'react';


import {
  Button,
  Input,
  Label,
  MIN_SELECTABLE_YMD,
  useToast,
} from '@/components/ui';
import { useGenerateDsr } from '@/hooks/api/useDsr';
import { ApiError } from '@/lib/api';
import { istTodayYmd, isYmd } from '@/lib/format';

import { useDsrRunWatcher } from './useDsrRunWatcher';

interface Props {
  dealerId: string;
  /** The day to (re)generate. Omit to generate the latest available business day
   *  (the most recent day IRAS has collected — often yesterday, not today). */
  businessDate?: string;
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  /** Fired once the POST is accepted, with the queued run id. */
  onQueued?: (runId: string) => void;
  className?: string;
  /** Block the button (e.g. no valid date chosen yet). */
  disabled?: boolean;
}

/**
 * Generate a dealer's DSR and keep the button "Generating…" until the run
 * actually lands. The POST answers 202 immediately, so on its own the freshly
 * invalidated queries would re-fetch the OLD report; polling the run and
 * invalidating again on a terminal status is what makes the new report appear
 * without a manual refresh.
 *
 * Shared by the Vault list, the full report view and the dealer tab so all three
 * behave identically.
 */
export function GenerateDsrButton({
  dealerId,
  businessDate,
  label = 'Generate',
  variant = 'secondary',
  size = 'sm',
  icon,
  onQueued,
  className,
  disabled,
}: Props) {
  const toast = useToast();
  const generate = useGenerateDsr();
  const run = useDsrRunWatcher(dealerId, 'Report ready — it is showing below.');

  const busy = generate.isPending || run.busy;

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      loading={busy}
      disabled={disabled}
      leftIcon={
        icon ?? (
          <RefreshCw
            width={size === 'sm' ? 14 : 16}
            height={size === 'sm' ? 14 : 16}
            strokeWidth={1.75}
          />
        )
      }
      onClick={(e) => {
        e.stopPropagation();
        generate.mutate(
          { dealerId, businessDate },
          {
            onSuccess: (data) => {
              run.watch(data.runId);
              onQueued?.(data.runId);
              toast.success(
                'Generating the report — this updates when it lands.',
              );
            },
            onError: (err) =>
              toast.error(
                err instanceof ApiError
                  ? err.message
                  : 'Could not start the generation',
              ),
          },
        );
      }}
    >
      {busy ? 'Generating…' : label}
    </Button>
  );
}

/**
 * Generate a DSR for an ARBITRARY past date — including one the dealer has never
 * had a report for. A date input (floored at 2000-01-01, capped at today) feeds
 * a Generate that stays disabled until a valid past date is chosen. The backend
 * collects that date's IRAS shift data inline when it isn't in the Vault yet, so
 * this originates a brand-new back-dated report, not just a regenerate.
 */
export function GenerateDsrForDate({
  dealerId,
  onGenerated,
  className,
}: {
  dealerId: string;
  /**
   * Fired with the chosen date once its run is queued, so the parent can show
   * THAT day's report when it lands — a back-date is not the newest report, so
   * snapping to "latest" would hide the very day the admin just generated.
   */
  onGenerated?: (businessDate: string) => void;
  className?: string;
}) {
  // Recomputed each render (not memoised) so `max` and the validity check advance
  // past IST midnight on a long-open session. IST (matching the backend guard), so
  // a non-IST browser can't offer or reject a day the server disagrees about. A
  // unique id per instance keeps the Label/Input association correct even when the
  // toolbar and empty-state copies mount together.
  const today = istTodayYmd();
  const inputId = React.useId();
  const [date, setDate] = React.useState('');
  const valid = isYmd(date) && date >= MIN_SELECTABLE_YMD && date <= today;

  return (
    <div className={className}>
      <Label htmlFor={inputId}>Generate for a date</Label>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          type="date"
          value={date}
          min={MIN_SELECTABLE_YMD}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
        />
        <GenerateDsrButton
          dealerId={dealerId}
          businessDate={valid ? date : undefined}
          disabled={!valid}
          label="Generate"
          icon={<CalendarPlus width={14} height={14} strokeWidth={1.75} />}
          onQueued={() => {
            if (valid) onGenerated?.(date);
          }}
        />
      </div>
    </div>
  );
}
