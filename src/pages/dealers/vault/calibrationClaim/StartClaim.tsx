import { FilePlus2 } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Dialog,
  Label,
  Select,
  useToast,
} from '@/components/ui';
import { useStartCalibrationClaim } from '@/hooks/api/useCalibrationClaim';
import { ApiError } from '@/lib/api';
import { istTodayYmd } from '@/lib/format';
import type { CalibrationClaimView } from '@dk/shared';

import { currentFinancialYear, defaultStartYear, fyOptionLabel } from './format';

/**
 * Starting a claim: pick the financial year and press one button.
 *
 * The year opens on the current one, because that is the claim almost everybody
 * wants; the earlier years are there for a back-dated claim. Only the years the
 * server says are still open to start are offered, newest first, so a year that
 * already has a claim can never be picked twice.
 */

function StartForm({
  dealerId,
  years,
  onStarted,
}: {
  dealerId: string;
  years: readonly string[];
  onStarted: (view: CalibrationClaimView) => void;
}) {
  const toast = useToast();
  const start = useStartCalibrationClaim(dealerId);
  const current = currentFinancialYear(istTodayYmd());
  const [year, setYear] = React.useState(() => defaultStartYear(years, current));

  // The offer changes under an open form (a claim started elsewhere): never keep
  // a year that is no longer on it.
  React.useEffect(() => {
    if (!years.includes(year)) setYear(defaultStartYear(years, current));
  }, [years, year, current]);

  if (years.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        Every financial year that can be claimed already has a claim.
      </p>
    );
  }

  function onStart() {
    start.mutate(year, {
      onSuccess: (view) => {
        toast.success(
          `Claim started for FY ${view.financialYear}. The first step begins within a minute.`,
        );
        onStarted(view);
      },
      onError: (err) =>
        toast.error(
          err instanceof ApiError ? err.message : 'Could not start the claim. Please try again.',
        ),
    });
  }

  return (
    <div className="grid gap-3 md:max-w-md">
      <div>
        <Label htmlFor="claim-year">Financial year</Label>
        <Select
          id="claim-year"
          value={year}
          disabled={start.isPending}
          onChange={(e) => setYear(e.target.value)}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {fyOptionLabel(y, current)}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-sm text-text-muted">
        MDG gets the certificate and the receipt from the Bihar weights and measures site, checks
        them, and sends the owner a letter to sign. Nothing is filed on IndianOil until you approve
        it.
      </p>
      <div>
        <Button
          loading={start.isPending}
          disabled={!year}
          onClick={onStart}
          leftIcon={<FilePlus2 width={16} height={16} strokeWidth={1.75} />}
        >
          Start the claim
        </Button>
      </div>
    </div>
  );
}

/** The card shown when there is no open claim. */
export function StartClaimCard({
  dealerId,
  years,
  onStarted,
}: {
  dealerId: string;
  years: readonly string[];
  onStarted: (view: CalibrationClaimView) => void;
}) {
  return (
    <Card>
      <CardHeader padding="comfortable">
        <div>
          <CardTitle>Start a claim</CardTitle>
          <CardSubtitle>
            IndianOil pays back part of the yearly calibration fee, per nozzle. MDG claims it for
            the owner.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent>
        <StartForm dealerId={dealerId} years={years} onStarted={onStarted} />
      </CardContent>
    </Card>
  );
}

/** The same form in a dialog, for starting another year while a claim is open. */
export function StartClaimDialog({
  open,
  onClose,
  dealerId,
  years,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  dealerId: string;
  years: readonly string[];
  onStarted: (view: CalibrationClaimView) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} size="md" title="Start another claim">
      <StartForm
        dealerId={dealerId}
        years={years}
        onStarted={(view) => {
          onStarted(view);
          onClose();
        }}
      />
    </Dialog>
  );
}
