import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { CalibrationClaimView, ClaimCheck } from '@dk/shared';

import { canAcknowledge, sortChecks } from './format';

/**
 * The guard rails, with the ones that failed first.
 *
 * A failed BLOCK stops the claim until it is fixed (Corrections) or accepted
 * after a look; a failed warning only asks for a look. "Accept" opens the note box
 * the pane owns — what the admin saw and why it is fine is kept on the check, with
 * their name, so nobody has to remember why a claim went ahead.
 *
 * The checks that passed are folded away behind one line: they are the reassurance
 * that the guard rails ran, not something to read down on every visit.
 */

function LevelIcon({ check }: { check: ClaimCheck }) {
  const common = { width: 16, height: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;
  if (check.ok) return <CheckCircle2 {...common} className="text-success" />;
  if (check.level === 'block') return <XCircle {...common} className="text-danger" />;
  if (check.level === 'warn') return <AlertTriangle {...common} className="text-warning" />;
  return <Info {...common} className="text-info" />;
}

const LEVEL_WORD: Record<ClaimCheck['level'], string> = {
  block: 'Stops the claim',
  warn: 'Take a look',
  info: 'For your information',
};

function CheckRow({
  check,
  onAcknowledge,
  disabled,
}: {
  check: ClaimCheck;
  onAcknowledge: (check: ClaimCheck) => void;
  disabled: boolean;
}) {
  const ack = check.acknowledged;
  return (
    <li className="flex gap-2.5 py-2">
      <span className="mt-0.5 shrink-0">
        <LevelIcon check={check} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm text-text">{check.message}</p>
        {!check.ok ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
            <Badge
              intent={
                check.level === 'block' ? 'danger' : check.level === 'warn' ? 'warning' : 'info'
              }
            >
              {LEVEL_WORD[check.level]}
            </Badge>
          </p>
        ) : null}
        {ack ? (
          <p className="mt-1 break-words text-xs text-text-muted">
            Accepted by {ack.byName}, {formatDateTime(ack.at)}: {ack.note}
          </p>
        ) : null}
        {canAcknowledge(check) ? (
          <div className="mt-1.5">
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => onAcknowledge(check)}
            >
              Accept this after a look
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function ClaimChecks({
  claim,
  actionsDisabled,
  onAcknowledge,
}: {
  claim: CalibrationClaimView;
  /** The claim is closed or busy: the Accept buttons are dead. */
  actionsDisabled: boolean;
  onAcknowledge: (check: ClaimCheck) => void;
}) {
  const [showPassed, setShowPassed] = React.useState(false);
  const { failed, passed } = sortChecks(claim.checks);
  const blocks = failed.filter((c) => c.level === 'block' && !c.acknowledged).length;

  return (
    <Card>
      <CardHeader
        padding="comfortable"
        action={
          claim.checks.length > 0 ? (
            <Badge
              intent={blocks > 0 ? 'danger' : failed.length > 0 ? 'warning' : 'success'}
              className="tabular-nums"
            >
              {failed.length === 0 ? 'All clear' : `${failed.length} to look at`}
            </Badge>
          ) : undefined
        }
      >
        <div>
          <CardTitle>Checks</CardTitle>
          <CardSubtitle>
            The papers are checked against each other and against IndianOil&rsquo;s own list before
            anything is filed.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent>
        {claim.checks.length === 0 ? (
          <p className="text-sm text-text-muted">The checks run once the papers have been read.</p>
        ) : (
          <>
            {failed.length > 0 ? (
              <ul className="divide-y divide-border">
                {failed.map((c) => (
                  <CheckRow
                    key={c.key}
                    check={c}
                    onAcknowledge={onAcknowledge}
                    disabled={actionsDisabled}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text">Every check passed.</p>
            )}
            {passed.length > 0 ? (
              <div className={failed.length > 0 ? 'mt-3' : 'mt-2'}>
                <Button variant="ghost" size="sm" onClick={() => setShowPassed((v) => !v)}>
                  {showPassed
                    ? 'Hide the checks that passed'
                    : `Show the ${passed.length} that passed`}
                </Button>
                {showPassed ? (
                  <ul className="divide-y divide-border">
                    {passed.map((c) => (
                      <CheckRow
                        key={c.key}
                        check={c}
                        onAcknowledge={onAcknowledge}
                        disabled={actionsDisabled}
                      />
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
