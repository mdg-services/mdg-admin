import { ActionRow, Button, Callout } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { CalibrationClaimView } from '@dk/shared';

import {
  BLOCKER_FIX_LABEL,
  type BlockerFix,
  type ClaimGates,
  blockerFixes,
  gateForFix,
} from './format';

/**
 * Why the claim has stopped, in the server's own words, with the one or two
 * buttons that get it moving again.
 *
 * Each button is dead, with the reason printed under it, when the claim cannot
 * take that step right now — it is closed, or already working. The pane decides
 * what a button does; this only chooses which ones to offer and draws them.
 */
export function ClaimBlocker({
  claim,
  wemmisSaved,
  gates,
  busy,
  onFix,
}: {
  claim: CalibrationClaimView;
  wemmisSaved: boolean;
  gates: ClaimGates;
  /** True while the action behind this fix is in flight. */
  busy: (fix: BlockerFix) => boolean;
  onFix: (fix: BlockerFix) => void;
}) {
  const blocker = claim.blocker;
  if (!blocker) return null;

  const fixes = blockerFixes(claim, wemmisSaved);
  const reasons = [
    ...new Set(fixes.map((f) => gateForFix(gates, f).reason).filter((r): r is string => !!r)),
  ];

  return (
    <div className="grid gap-2">
      <Callout intent="warning">
        <span className="block break-words">{blocker.message}</span>
        <span className="mt-0.5 block text-text-subtle">Since {formatDateTime(blocker.at)}</span>
      </Callout>
      {fixes.length > 0 ? (
        <ActionRow below="stack" align="start">
          {/* Best fix first in the list, LAST in the DOM: `ActionRow` stacks in
              reverse below md, which puts the primary button on top under the thumb. */}
          {fixes
            .map((fix, i) => ({ fix, primary: i === 0 }))
            .reverse()
            .map(({ fix, primary }) => (
              <Button
                key={fix}
                variant={primary ? 'primary' : 'secondary'}
                size="sm"
                loading={busy(fix)}
                disabled={!gateForFix(gates, fix).ok}
                onClick={() => onFix(fix)}
              >
                {BLOCKER_FIX_LABEL[fix]}
              </Button>
            ))}
        </ActionRow>
      ) : null}
      {reasons.map((r) => (
        <p key={r} className="text-xs text-text-subtle">
          {r}
        </p>
      ))}
    </div>
  );
}
