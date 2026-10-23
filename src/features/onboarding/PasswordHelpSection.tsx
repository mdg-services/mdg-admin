import { KeyRound } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  useToast,
} from '@/components/ui';
import { usePasswordHelpDone } from '@/hooks/api/useOnboarding';
import { useBusyIds } from '@/hooks/useBusyIds';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { agoLabel, dialHref, phoneLabel } from '@/lib/intake';
import { ageSince } from '@/pages/overview/format';
import { dealerCodeLabel, type PasswordHelpRow } from '@dk/shared';

/**
 * Dealers who pressed "Forgot password" on the sign-in screen.
 *
 * There is no code to prove the phone (the owner chose password sign-in), so a
 * person at MDG calls the number the dealer registered with, sets a temporary
 * password from the outlet's Members tab (the dealer must change it at their
 * next sign-in), and marks the request done here. Until then it stays listed,
 * oldest first, as the server sends it.
 *
 * Draws nothing when there are none: an empty "Password help" card on every
 * visit would be noise on the page's busiest day. On a phone it starts folded to
 * its header and a count: unfolded, two requests took the whole first screen
 * and pushed the list this page is for below the fold. From md it is open.
 */
export function PasswordHelpSection({
  rows,
  now,
}: {
  rows: readonly PasswordHelpRow[];
  now: number;
}) {
  const toast = useToast();
  const done = usePasswordHelpDone();
  const busy = useBusyIds();
  const isMd = useMediaQuery('(min-width: 768px)');
  // `null` follows the screen; a tap on Show / Hide overrides it.
  const [pressed, setPressed] = React.useState<boolean | null>(null);
  const expanded = pressed ?? isMd;

  if (rows.length === 0) return null;

  function markDone(row: PasswordHelpRow) {
    void busy.run(row.id, async () => {
      try {
        await done.mutateAsync(row.id);
        toast.success('Marked as done.');
      } catch (err) {
        toast.error(err instanceof Error && err.message ? err.message : 'That did not go through.');
      }
    });
  }

  return (
    <Card className="mb-4">
      <CardHeader
        action={
          <div className="flex items-center gap-2">
            <Badge intent="warning">{rows.length} open</Badge>
            {isMd ? null : (
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={expanded}
                onClick={() => setPressed(!expanded)}
              >
                {expanded ? 'Hide' : 'Show'}
              </Button>
            )}
          </div>
        }
      >
        <div>
          <CardTitle>Password help</CardTitle>
          {expanded ? (
            <CardSubtitle>
              Call the number they registered with, set a temporary password from the Team tab of
              their outlet, then mark it done.
            </CardSubtitle>
          ) : null}
        </div>
      </CardHeader>
      {expanded ? (
        <CardContent padding="none">
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const tel = dialHref(r.identifier);
              const isEmail = r.identifier.includes('@');
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-3 py-2.5 md:px-4"
                >
                  <div className="min-w-0 flex-1 basis-56 [overflow-wrap:anywhere]">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text">
                      <KeyRound
                        width={13}
                        height={13}
                        strokeWidth={1.75}
                        className="shrink-0 text-text-subtle"
                        aria-hidden
                      />
                      {tel && !isEmail ? (
                        <a
                          href={tel}
                          className="select-text font-medium text-brand underline tabular-nums"
                        >
                          {phoneLabel(r.identifier)}
                        </a>
                      ) : (
                        <span className="select-text font-medium">{r.identifier}</span>
                      )}
                      <span className="text-xs text-text-subtle">
                        asked {agoLabel(ageSince(r.requestedAt, now))}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {r.match ? (
                        <>
                          {r.match.name}
                          {r.match.dealerId && r.match.code ? (
                            <>
                              {' · '}
                              <Link
                                className="font-semibold text-brand underline"
                                to={`/dealers/${r.match.dealerId}?tab=members`}
                              >
                                {dealerCodeLabel(r.match.code)} Team tab
                              </Link>
                            </>
                          ) : null}
                        </>
                      ) : (
                        'No single account matched. Check the number or email with them.'
                      )}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy.isBusy(r.id)}
                    onClick={() => markDone(r)}
                  >
                    Done
                  </Button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}
