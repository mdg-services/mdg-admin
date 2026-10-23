import { Check, Circle, Minus } from 'lucide-react';

import { Badge, Button, useToast } from '@/components/ui';
import { useCheckPortalLogins } from '@/hooks/api/useHeldMessages';
import { istStamp } from '@/lib/intake';
import {
  CHECKLIST_LABEL,
  canRetryLoginCheck,
  checklistSummary,
} from '@/lib/watchHold';
import { PORTAL_NAMES, type OutletSetupAdmin, type PortalLoginCheck, type SetupChecklistItem } from '@dk/shared';

const errorText = (err: unknown) =>
  err instanceof Error && err.message ? err.message : 'That did not go through.';

/**
 * "Ready to start?": the five lines the server reads off facts before Start
 * services — portal logins that were tried and worked, the DSR's files, services
 * attached, Kavach started, a first run that went well (docs/specs/onboarding-v2.md
 * §5). A line is done, missing, or not needed for what the dealer chose.
 *
 * Nothing here is ticked by hand, so nothing here can be wrong about the outlet.
 * Start still works while a line is missing, but then says why (a reason is kept);
 * `StartServicesDialog` uses this same list.
 *
 * "Try the logins again" appears only where it can help: a login that was saved but
 * never tried, or tried when the portal could not answer. A refused login is never
 * tried again (the owner has to give the right one), so it offers nothing.
 */
export function SetupChecklist({
  dealerId,
  items,
  className,
}: {
  dealerId: string;
  items: readonly SetupChecklistItem[];
  className?: string;
}) {
  const toast = useToast();
  const retry = useCheckPortalLogins();
  if (items.length === 0) return null;

  const logins = items.find((i) => i.key === 'logins_working');
  const summary = checklistSummary(items);

  async function tryAgain() {
    try {
      const { queued } = await retry.mutateAsync(dealerId);
      toast.success(
        queued.length > 0
          ? `Trying ${queued.map((p) => PORTAL_NAMES[p]).join(' and ')} again. The result appears here in a minute.`
          : 'Nothing to try again.',
      );
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <section aria-label="Ready to start?" className={className}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-text">Ready to start?</h3>
        <Badge intent={summary === 'Ready to start' ? 'success' : 'warning'}>{summary}</Badge>
      </div>
      <ul className="grid gap-1.5">
        {items.map((i) => (
          <li key={i.key} className="flex items-start gap-2 text-sm">
            {i.state === 'done' ? (
              <Check width={14} height={14} strokeWidth={2} className="mt-0.5 shrink-0 text-success" aria-hidden />
            ) : i.state === 'missing' ? (
              <Circle width={14} height={14} strokeWidth={2} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            ) : (
              <Minus width={14} height={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-text-subtle" aria-hidden />
            )}
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <span className={i.state === 'missing' ? 'text-text' : 'text-text-muted'}>
                {CHECKLIST_LABEL[i.key]}
                {i.state === 'not_needed' ? <span className="text-text-subtle"> · not needed</span> : null}
              </span>
              {i.detail && i.state !== 'done' ? (
                <p className="text-xs text-text-subtle">{i.detail}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {canRetryLoginCheck(logins) ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          loading={retry.isPending}
          onClick={() => void tryAgain()}
        >
          Try the logins again
        </Button>
      ) : null}
    </section>
  );
}

const CHECK_BADGE: Record<
  PortalLoginCheck['result'],
  { text: string; intent: 'success' | 'danger' | 'warning' | 'info' }
> = {
  ok: { text: 'Worked', intent: 'success' },
  refused: { text: 'Refused', intent: 'danger' },
  could_not_check: { text: 'Could not tell', intent: 'warning' },
  pending: { text: 'Trying now', intent: 'info' },
};

/** What the portal said the last time each saved login was tried, one line each. */
export function LoginChecks({
  checks,
  now,
}: {
  checks: OutletSetupAdmin['loginChecks'];
  now: number;
}) {
  if (checks.length === 0) return null;
  return (
    <ul aria-label="Login tries" className="grid gap-1 text-sm">
      {checks.map((c) => (
        <li key={c.portal} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="w-12 font-medium text-text">{PORTAL_NAMES[c.portal]}</span>
          <Badge intent={CHECK_BADGE[c.result].intent}>{CHECK_BADGE[c.result].text}</Badge>
          {c.at ? <span className="text-xs text-text-subtle">tried {istStamp(c.at, now)}</span> : null}
        </li>
      ))}
    </ul>
  );
}
