import { Info, ServerCrash, ShieldAlert, ShieldCheck } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Callout,
  Checkbox,
  Dialog,
  KeyValueList,
  Label,
  Skeleton,
  Textarea,
  useToast,
  type KeyValueItem,
} from '@/components/ui';
import {
  useAssuranceReport,
  useOverrideAssurance,
} from '@/hooks/api/useAssurance';
import { type DsrReportView } from '@/hooks/api/useDsr';
import { ApiError } from '@/lib/api';
import {
  canSubmitOverride,
  describeScope,
  holdingCodes,
  holdingFindings,
  isHolding,
  overrideApplies,
  summarise,
  MIN_OVERRIDE_REASON,
  SEVERITY_LABEL,
  type AssuranceFinding,
} from '@/lib/assurance';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/store/auth';

/**
 * What the pre-send check made of this report, and the only way to release it.
 *
 * WHY IT IS NOT RED. The page above this already paints a HIGH or LOW variation
 * `danger` on three surfaces — the product figures, the variation card and the
 * advisory band — so on 1E's 2,646,765 L report every one of them was already
 * scarlet before anything was withheld. A fourth red badge in that company reads
 * as decoration. The signal that a report is being withheld is therefore the
 * Share button going dead with the reason printed under it, and this panel is
 * the plain, high-contrast statement of what those reasons are.
 *
 * The findings' `message` is rendered VERBATIM. The catalogue writes each one as
 * one sentence carrying the real figures ("meter sales since 12 Aug exceed every
 * litre the tanks have held"), and a second wording here is a second thing to
 * keep true when a threshold moves.
 */
export function AssurancePanel({
  report,
  className,
}: {
  report: DsrReportView;
  className?: string;
}) {
  const toast = useToast();
  const verdictQ = useAssuranceReport(report.id);
  const override = useOverrideAssurance(report.id);
  const [formOpen, setFormOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [acknowledged, setAcknowledged] = React.useState<string[]>([]);
  // The override records an admin id. Resolving it to a name needs `/admins`,
  // which is super-admin-only — a regular admin reading their own release would
  // get a 403 for the privilege. So: "you" when it is theirs, the raw id when it
  // is somebody else's.
  const myId = useAuthStore((s) => s.admin?.id ?? s.user?.id ?? null);
  const myName = useAuthStore((s) => s.admin?.name ?? s.user?.name ?? null);

  const verdict = verdictQ.data ?? null;
  const held = isHolding(verdict);
  const holding = holdingFindings(verdict);
  const codes = holdingCodes(verdict);
  const storedOverride = verdict?.stored?.override ?? report.assurance?.override ?? null;
  const releasedByHand =
    !!storedOverride &&
    !!verdict &&
    overrideApplies(storedOverride, verdict.subjectHash, codes);
  const readiness = canSubmitOverride(reason, acknowledged, codes);

  function openForm() {
    // Fresh every time. A reason left over from the last report is exactly the
    // kind of thing that gets submitted without being re-read.
    setReason('');
    setAcknowledged([]);
    setFormOpen(true);
  }

  function toggleCode(code: string, on: boolean) {
    setAcknowledged((prev) =>
      on ? [...new Set([...prev, code])] : prev.filter((c) => c !== code),
    );
  }

  async function onRelease() {
    if (!readiness.ok) return;
    try {
      await override.mutateAsync({ reason: reason.trim(), acknowledged });
      toast.success('Released. This report can be shared with the dealer now.');
      setFormOpen(false);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not release this report',
      );
    }
  }

  if (verdictQ.isLoading) {
    return (
      <div className={cn('min-w-0', className)}>
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
    );
  }

  if (verdictQ.isError || !verdict) {
    return (
      <div className={cn('min-w-0', className)}>
        {/* Info, not warning: not knowing the verdict is not itself a fault in
            the report, and the server refuses on its own if it has to. */}
        <Callout intent="info" onRetry={() => void verdictQ.refetch()}>
          The correctness check could not be loaded, so this report&apos;s
          verdict is unknown here.
        </Callout>
      </div>
    );
  }

  // The gate re-folds everything it is handed, so it answers PASS or HOLD and
  // never ERROR — an errored check reaches us as the STORED decision. Both are
  // the same sentence to an admin: nothing confirmed these figures.
  const checkErrored =
    verdict.decision === 'ERROR' || verdict.stored?.decision === 'ERROR';

  if (checkErrored && !held) {
    return (
      <div className={cn('min-w-0', className)}>
        <StatementBlock
          icon={<ServerCrash width={16} height={16} strokeWidth={1.75} />}
          title="This report could not be checked"
        >
          <p className="mt-0.5 text-sm text-text-muted">
            The check itself failed. That is a fault on our side, not a problem
            with the dealer&apos;s figures — it does not say the report is wrong,
            only that nothing has confirmed it is right. Regenerating the report
            runs the check again.
          </p>
          <ReasonLines reasons={verdict.reasons} />
        </StatementBlock>
      </div>
    );
  }

  if (held) {
    return (
      <div className={cn('min-w-0', className)}>
        <StatementBlock
          icon={<ShieldAlert width={16} height={16} strokeWidth={1.75} />}
          title={
            checkErrored
              ? 'This report could not be checked, so it is not being sent'
              : 'This report is not being sent'
          }
        >
          <p className="mt-0.5 text-sm text-text-muted">{summarise(verdict)}</p>
          {checkErrored ? (
            <p className="mt-1 text-sm text-text-muted">
              The check that ran when this report was generated failed, which is
              our fault and not the dealer&apos;s.
            </p>
          ) : null}
          {holding.length > 0 ? (
            <KeyValueList className="mt-3" items={findingItems(holding)} />
          ) : (
            <ReasonLines reasons={verdict.reasons} />
          )}
          {storedOverride && !releasedByHand ? (
            <p className="mt-3 text-xs text-text-subtle">
              An earlier release by hand no longer applies — it was granted
              against different figures, or it did not name everything now being
              withheld.
            </p>
          ) : null}
          {codes.length > 0 ? (
            <Button
              className="mt-3 w-full md:w-auto"
              variant="secondary"
              size="sm"
              onClick={openForm}
            >
              Release with a reason
            </Button>
          ) : null}
        </StatementBlock>

        <Dialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="Release this report by hand"
          description="The check will be recorded as overridden against these exact figures, and only for the findings you acknowledge."
          size="md"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setFormOpen(false)}
                disabled={override.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void onRelease()}
                loading={override.isPending}
                disabled={!readiness.ok}
              >
                Release
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <Callout intent="warning">
              Nothing sent to a dealer can be taken back — there is no way to
              delete or edit a message once it is posted. Release this only if
              you have satisfied yourself the figures are right.
            </Callout>

            <div>
              <Label htmlFor="assurance-override-reason" required>
                Why is this report right?
              </Label>
              <Textarea
                id="assurance-override-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. Tank 6's dip meter is out of service and the dip was entered by hand from the manual gauge; the figure is correct."
              />
              <p className="mt-1 text-xs text-text-subtle">
                At least {MIN_OVERRIDE_REASON} characters. It is stored on the
                report and in the activity log.
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-text">
                Acknowledge every finding you are releasing
              </p>
              <div className="grid gap-2">
                {codes.map((code) => {
                  const examples = holding.filter((f) => f.code === code);
                  const first = examples[0];
                  return (
                    <Checkbox
                      key={code}
                      align="start"
                      checked={acknowledged.includes(code)}
                      onChange={(e) => toggleCode(code, e.target.checked)}
                      label={first ? first.message : code}
                      hint={
                        <>
                          <span className="block break-all font-mono">
                            {code}
                          </span>
                          {examples.length > 1 ? (
                            <span className="block">
                              Fires on {examples.length} products on this report.
                            </span>
                          ) : null}
                        </>
                      }
                    />
                  );
                })}
              </div>
            </div>

            {/* The reason the Release button is dead, as text. `title` never
                fires on touch, and this admin is used on phones. */}
            {readiness.why ? (
              <p className="text-xs text-text-muted">{readiness.why}</p>
            ) : null}
          </div>
        </Dialog>
      </div>
    );
  }

  if (releasedByHand && storedOverride) {
    return (
      <div className={cn('min-w-0', className)}>
        <StatementBlock
          icon={<ShieldCheck width={16} height={16} strokeWidth={1.75} />}
          title="Released by hand"
          tone="quiet"
        >
          <KeyValueList
            className="mt-2"
            items={[
              {
                key: 'by',
                label: 'Released by',
                value:
                  storedOverride.adminId === myId
                    ? `${myName ?? 'You'} (you)`
                    : storedOverride.adminId,
                mono: storedOverride.adminId !== myId,
              },
              {
                key: 'at',
                label: 'When',
                value: formatDateTime(storedOverride.at),
              },
              {
                key: 'reason',
                label: 'Reason',
                value: storedOverride.reason,
                block: true,
              },
              {
                key: 'acked',
                label: 'Acknowledged',
                value: (
                  <span className="break-all font-mono text-xs">
                    {storedOverride.acknowledged.join(', ')}
                  </span>
                ),
                block: true,
              },
            ]}
          />
          {holding.length > 0 ? (
            <KeyValueList className="mt-3" items={findingItems(holding)} />
          ) : null}
        </StatementBlock>
      </div>
    );
  }

  if (holding.length > 0) {
    // Findings that would withhold, but the check is not enforcing yet. Said
    // plainly rather than dressed as a hold: the Share button below is live, and
    // a panel that reads like a refusal above a working button teaches an admin
    // to ignore the panel.
    return (
      <div className={cn('min-w-0', className)}>
        <StatementBlock
          icon={<ShieldAlert width={16} height={16} strokeWidth={1.75} />}
          title="Recorded, but nothing is being withheld"
          tone="quiet"
        >
          <p className="mt-0.5 text-sm text-text-muted">{summarise(verdict)}</p>
          <KeyValueList className="mt-3" items={findingItems(holding)} />
        </StatementBlock>
      </div>
    );
  }

  if (verdict.neverChecked) {
    // Not reassuring, not alarming. One line, no box: nothing is being
    // withheld, and nothing has confirmed anything either.
    return (
      <p
        className={cn('flex min-w-0 items-start gap-1.5 text-xs text-text-muted', className)}
      >
        <Info
          width={13}
          height={13}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0"
          aria-hidden
        />
        <span className="min-w-0">
          This report has no stored correctness check — it was generated before
          the check existed, or the check was switched off. That is not the same
          as passing.
        </span>
      </p>
    );
  }

  // A pass is the normal case. One line, and no celebration: the report below is
  // what the admin came to read.
  return (
    <p
      className={cn('flex min-w-0 items-start gap-1.5 text-xs text-text-subtle', className)}
    >
      <ShieldCheck
        width={13}
        height={13}
        strokeWidth={1.75}
        className="mt-0.5 shrink-0"
        aria-hidden
      />
      <span className="min-w-0">
        {summarise(verdict)}
        {verdict.stored?.checkedAt
          ? ` Last checked ${formatDateTime(verdict.stored.checkedAt)}.`
          : ''}
      </span>
    </p>
  );
}

/**
 * The findings as full-width lines.
 *
 * `block: true` on every one, because these are sentences and not values: at the
 * `rows` default a 140px label column would leave a 360px phone about 190px for
 * "Meter sales of 2,646,765 L since 12 Aug exceed the 40,000 L these tanks hold",
 * which is eleven wrapped lines in a column beside a two-word label.
 */
function findingItems(findings: readonly AssuranceFinding[]): KeyValueItem[] {
  return findings.map((f, i) => {
    const scope = describeScope(f.scope);
    return {
      // The same code fires once per product, so the code alone is not unique.
      key: `${f.code}|${scope}|${i}`,
      label: (
        <span className="break-words">
          {SEVERITY_LABEL[f.severity]}
          {scope ? ` · ${scope}` : ''}
        </span>
      ),
      value: (
        <>
          <span className="block">{f.message}</span>
          <span className="mt-0.5 block break-all font-mono text-xs text-text-subtle">
            {f.code}
          </span>
        </>
      ),
      block: true,
    };
  });
}

/** The API's own refusal lines, when there are no structured findings behind them. */
function ReasonLines({ reasons }: { reasons: readonly string[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-text-muted">
      {reasons.map((r, i) => (
        <li key={i} className="break-words">
          {r}
        </li>
      ))}
    </ul>
  );
}

/**
 * The panel's one container shape.
 *
 * Neutral by design — `border-strong` and `surface-2`, no intent colour. Weight
 * is what separates it from the amber and red already on this page: `'loud'`
 * gets the stronger border and a `text-text` heading, `'quiet'` sits back.
 * `tone` is a prop and not a className because `cn` is plain clsx with no
 * tailwind-merge, so a call-site `border-border` would land beside
 * `border-border-strong` and lose on stylesheet order.
 */
function StatementBlock({
  icon,
  title,
  tone = 'loud',
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: 'loud' | 'quiet';
  children?: React.ReactNode;
}) {
  return (
    <div
      className={
        tone === 'loud'
          ? 'rounded-md border border-border-strong bg-surface-2 px-3 py-2.5'
          : 'rounded-md border border-border bg-surface-2 px-3 py-2.5'
      }
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-text-muted" aria-hidden>
          {icon}
        </span>
        {/* min-w-0 so a long finding sentence wraps inside the block rather than
            pushing it wider than the card it sits in. */}
        <div className="min-w-0 flex-1">
          <p
            className={
              tone === 'loud'
                ? 'text-sm font-semibold text-text'
                : 'text-sm font-medium text-text'
            }
          >
            {title}
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}
