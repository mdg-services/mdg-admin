import { AlertCircle, Plug } from 'lucide-react';
import * as React from 'react';

import { Button, Card, CardContent, EmptyState, Label, Select, Skeleton } from '@/components/ui';
import { useCalibrationClaimOverview } from '@/hooks/api/useCalibrationClaim';
import { ApiError } from '@/lib/api';
import { dealerCodeLabel } from '@dk/shared';

import { ClaimDetail } from './calibrationClaim/ClaimDetail';
import { STAGE_VIEW, claimGates, openClaims, pickClaim } from './calibrationClaim/format';
import { LiveCaptchaBox } from './calibrationClaim/LiveCaptchaBox';
import { StartClaimCard, StartClaimDialog } from './calibrationClaim/StartClaim';
import { useClaimRunner } from './calibrationClaim/useClaimRunner';
import { WemmisLoginCard } from './calibrationClaim/WemmisLoginCard';
import type { DealerVaultPaneProps } from './types';

/**
 * A dealer's calibration subsidy claim: the yearly fee the Legal Metrology office
 * charges for stamping the outlet's dispensing units, part of which IndianOil pays
 * back per nozzle. MDG claims it for the owner (ADR 0029).
 *
 * A claim takes days, because it waits on people — for the papers, then for the
 * owner's signature — so the pane is a status page you come back to, and it keeps
 * itself fresh: every few seconds while the robot is working (or a step is queued
 * and about to start) or a picture code needs typing, every half minute while the
 * claim waits on someone, and not at all when only you can move it.
 *
 * With no open claim the pane offers to start one. With one it shows that claim;
 * with several (a back-dated year beside this year's), a picker chooses which.
 */
export function DealerCalibrationClaimPane({ dealer }: DealerVaultPaneProps) {
  const overviewQ = useCalibrationClaimOverview(dealer.id);
  const runner = useClaimRunner(dealer.id);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [startingAnother, setStartingAnother] = React.useState(false);

  if (overviewQ.isLoading) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (overviewQ.isError) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load the calibration claim"
        description={
          overviewQ.error instanceof ApiError ? overviewQ.error.message : 'Please try again.'
        }
        cta={
          <Button variant="secondary" size="sm" onClick={() => void overviewQ.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const overview = overviewQ.data!;

  if (!overview.attached) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<Plug width={28} height={28} strokeWidth={1.75} />}
            title={`Calibration claims are not set up for ${dealerCodeLabel(dealer.code)}`}
            description="Attach it from the Services tab and this pane fills in."
          />
        </CardContent>
      </Card>
    );
  }

  const claims = overview.claims;
  const open = openClaims(claims);
  const claim = pickClaim(claims, selectedId);
  const gates = claim ? claimGates(claim) : null;
  // A picker is worth having once there is more than one claim to choose from, or
  // when the only ones are closed and there is an earlier one to look back at.
  const showPicker = claims.length > 1 || (claims.length === 1 && !claim);

  return (
    <div className="grid gap-3 md:gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text">Calibration claim</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            The yearly subsidy IndianOil pays for calibrating the dispensing units at outlet{' '}
            {dealerCodeLabel(dealer.code)}.
          </p>
        </div>
        {open.length > 0 && overview.startableYears.length > 0 ? (
          <Button variant="secondary" size="sm" onClick={() => setStartingAnother(true)}>
            Start another year
          </Button>
        ) : null}
      </div>

      {/* First thing on the pane while it exists: the robot is stopped at the
          sign-in with a time limit, waiting for a person to type what it sees. */}
      {overview.liveCaptcha ? (
        <LiveCaptchaBox dealerId={dealer.id} captcha={overview.liveCaptcha} />
      ) : null}

      {open.length === 0 ? (
        <StartClaimCard
          dealerId={dealer.id}
          years={overview.startableYears}
          onStarted={(view) => setSelectedId(view.id)}
        />
      ) : null}

      {showPicker ? (
        <div className="md:max-w-md">
          <Label htmlFor="claim-picker">{claim ? 'Claim' : 'Look back at an earlier claim'}</Label>
          <Select
            id="claim-picker"
            value={claim?.id ?? ''}
            onChange={(e) => setSelectedId(e.target.value || null)}
          >
            {claim ? null : <option value="">Choose a claim…</option>}
            {claims.map((c) => (
              <option key={c.id} value={c.id}>
                FY {c.financialYear} · {STAGE_VIEW[c.stage].label}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {claim && gates ? (
        <ClaimDetail
          dealerId={dealer.id}
          overview={overview}
          claim={claim}
          gates={gates}
          runner={runner}
        />
      ) : (
        <WemmisLoginCard
          dealerId={dealer.id}
          wemmis={overview.wemmis}
          claim={null}
          gates={null}
          runner={runner}
        />
      )}

      <StartClaimDialog
        open={startingAnother}
        onClose={() => setStartingAnother(false)}
        dealerId={dealer.id}
        years={overview.startableYears}
        onStarted={(view) => setSelectedId(view.id)}
      />
    </div>
  );
}
