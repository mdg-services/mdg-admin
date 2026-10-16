import * as React from 'react';

import { NOT_REACHED_TOAST_MS } from '@/components/share/shareToast';
import {
  Button,
  Callout,
  Checkbox,
  Dialog,
  useToast,
} from '@/components/ui';
import { useAssuranceReport } from '@/hooks/api/useAssurance';
import {
  useDsrShareStatus,
  useSaveDsrShareRule,
  useShareDsr,
  type DsrReportView,
} from '@/hooks/api/useDsr';
import { ApiError } from '@/lib/api';
import { isHolding, shareBlockedReason } from '@/lib/assurance';
import { cn } from '@/lib/cn';
import {
  DSR_SHEET_LABELS,
  DSR_SHEETS,
  type DsrShareStatus,
  type DsrSheet,
  type DsrSheetHolders,
  type DsrSheetPlan,
} from '@dk/shared';

import {
  choiceLabel,
  clampPlan,
  dialogDescription,
  describeRule,
  holdAtClickMessage,
  holdersLine,
  initialPlan,
  nobodyOnApp,
  offersSaveRule,
  oldCopyWarnings,
  plansEqual,
  presetState,
  ruleReachNote,
  sendButtonLabel,
  sendSummary,
  shareToast,
  SHARE_PRESETS,
  sideAvailability,
  sideHint,
  sideTicked,
  withSide,
  type ShareSide,
} from './dsrShareFormat';

interface Props {
  open: boolean;
  onClose: () => void;
  report: DsrReportView;
  /** The status the section already holds; the window opens on its `suggested` plan. */
  status: DsrShareStatus;
  /** Something has already gone out: this is a top-up to more people. */
  sentBefore: boolean;
}

/**
 * "Who gets what": the window an admin sends a DSR from.
 *
 * Two blocks — Daily sales and Stock variation — each ticking Owners and/or
 * Manager, with three quick choices on top. Everything it SAYS is decided in
 * `dsrShareFormat.ts` from the server's `DsrShareStatus`: who already holds each
 * sheet, which sides nobody is on the app for (dead, with the reason as text),
 * what this send would add, and who still holds an old copy it would not replace.
 *
 * The choices are tick boxes inside a Dialog, not a Menu: a Menu closes on every
 * select, so a two-sheet choice cannot live in one.
 *
 * It renders nothing while closed and mounts its state fresh each time it opens,
 * so a window opened a second time starts again from the suggestion, not from the
 * last abandoned edit.
 */
export function DsrShareDialog(props: Props) {
  if (!props.open) return null;
  return <OpenDialog {...props} />;
}

function OpenDialog({ onClose, report, status: seedStatus, sentBefore }: Props) {
  const toast = useToast();
  const share = useShareDsr(report.id);
  const ruleM = useSaveDsrShareRule(report.dealerId);
  // Same key as the panel's own verdict query, so no second request.
  const assuranceQ = useAssuranceReport(report.id);

  // Read live: a new owner, or a manager removed, since the section last asked.
  // The plan below is held to it on every render, so a side that disappears
  // while the window is open cannot be sent.
  const statusQ = useDsrShareStatus(report.id);
  const { refetch } = statusQ;
  React.useEffect(() => {
    void refetch();
  }, [refetch]);
  const status = statusQ.data ?? seedStatus;

  const [picked, setPicked] = React.useState<DsrSheetPlan>(() => initialPlan(seedStatus));
  const [remember, setRemember] = React.useState(false);

  const plan = clampPlan(picked, status.outlet);
  const summary = sendSummary(status, plan);
  const warnings = oldCopyWarnings(status, plan);
  const noOne = nobodyOnApp(status.outlet);
  const rule = status.rule;
  const ruleNote = rule ? ruleReachNote(rule, status.outlet) : null;
  const canSaveRule = offersSaveRule(plan, rule);
  // Both mutations freeze the window: a tick changed under a request that is
  // still going would be a choice the admin thinks they made and did not send.
  const busy = share.isPending || ruleM.isPending;

  async function onSend() {
    // Re-checked at the moment of the click, not only when the window opened.
    // The verdict refetches on window focus, so a report can become held while
    // this window sits open — and `disabled` on the button that OPENED it does
    // nothing about the button in here. The server refuses too, but this is the
    // last click before a message that cannot be deleted or edited.
    if (isHolding(assuranceQ.data)) {
      onClose();
      toast.error(holdAtClickMessage(shareBlockedReason(assuranceQ.data)));
      return;
    }
    try {
      const result = await share.mutateAsync({
        sheets: plan,
        ...(remember && canSaveRule ? { saveRule: true } : {}),
      });
      const t = shareToast(result);
      toast.toast({
        intent: t.tone,
        title: t.title,
        description: t.description,
        // A shortfall is the one thing in this toast the admin has to act on.
        ...(t.tone === 'warning' ? { duration: NOT_REACHED_TOAST_MS } : {}),
      });
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to share');
    }
  }

  async function onClearRule() {
    try {
      await ruleM.mutateAsync(null);
      toast.success("This outlet's rule is cleared.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not clear the rule');
    }
  }

  async function onSaveRuleOnly() {
    try {
      await ruleM.mutateAsync(plan);
      setRemember(false);
      toast.success("Saved as this outlet's rule.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the rule');
    }
  }

  return (
    <Dialog
      open
      // Closing while a request is in flight would leave it landing on a window
      // the admin has already dismissed, and a second pick racing it. The
      // backdrop, Escape and the X all come through here.
      onClose={busy ? () => {} : onClose}
      title="Who gets what"
      description={dialogDescription(sentBefore)}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onSend} loading={share.isPending} disabled={summary.addsNothing || ruleM.isPending}>
            {sendButtonLabel(summary, plan)}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {noOne ? <Callout intent="warning">{noOne}</Callout> : null}

        {/* ── One-tap choices ── */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Quick choices
          </p>
          <div className="grid gap-2">
            {SHARE_PRESETS.map((preset) => {
              const state = presetState(preset, status.outlet);
              const active = !state.disabled && plansEqual(plan, clampPlan(preset.plan, status.outlet));
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  disabled={busy || state.disabled}
                  onClick={() => setPicked(clampPlan(preset.plan, status.outlet))}
                  className={cn(
                    'flex min-h-11 w-full flex-col justify-center rounded-md border px-3 py-2 text-left text-sm transition-colors md:min-h-9',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                    state.disabled || busy ? 'cursor-not-allowed' : '',
                    active
                      ? 'border-brand bg-brand/10 font-semibold text-text'
                      : 'border-border-strong bg-surface text-text hover:bg-surface-2',
                    state.disabled && 'text-text-subtle hover:bg-surface',
                  )}
                >
                  <span>{preset.label}</span>
                  {state.reason ? (
                    <span className="block text-xs font-normal text-text-muted">{state.reason}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── One block per sheet ── */}
        {DSR_SHEETS.map((sheet) => (
          <SheetBlock
            key={sheet}
            sheet={sheet}
            status={status}
            plan={plan}
            busy={busy}
            onTick={(side, on) => setPicked(withSide(plan, sheet, side, on))}
          />
        ))}

        {/* ── What this send will add ── */}
        <section
          aria-live="polite"
          className="rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            This send will add
          </p>
          <ul className="mt-1.5 space-y-1 text-text">
            {summary.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        {warnings.length > 0 ? (
          <Callout intent="warning">
            <span className="block font-medium">Somebody would be left with the old figures</span>
            {warnings.map((w) => (
              <span key={w} className="mt-0.5 block">
                {w}
              </span>
            ))}
          </Callout>
        ) : null}

        {/* ── The outlet's rule ── */}
        {rule ? (
          <div className="rounded-md border border-border px-3 py-2 text-sm">
            <p className="text-text-muted">
              This outlet&apos;s rule: <span className="text-text">{describeRule(rule)}</span>
            </p>
            {ruleNote ? <p className="mt-0.5 text-xs text-warning-strong md:text-warning">{ruleNote}</p> : null}
            <Button
              variant="ghost"
              tone="brand"
              size="sm"
              padding="none"
              align="start"
              onClick={onClearRule}
              loading={ruleM.isPending}
              disabled={busy}
            >
              Clear rule
            </Button>
          </div>
        ) : null}

        {canSaveRule && !summary.addsNothing ? (
          <Checkbox
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            disabled={busy}
            align="start"
            label="Save this as the outlet's rule"
            hint="Every later share, the Today board and corrected re-sends will follow it. You can still change it for one send."
          />
        ) : null}

        {canSaveRule && summary.addsNothing ? (
          <div className="grid gap-1.5">
            <p className="text-xs text-text-subtle">
              Nothing new to send, but you can keep this choice for later sends.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={onSaveRuleOnly}
              loading={ruleM.isPending}
              disabled={busy}
              className="w-fit"
            >
              Save as this outlet&apos;s rule
            </Button>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

/**
 * One sheet: its name, the choice in words, who already has it, and a tick box
 * for each side. A side nobody is on the app for is dead, with the reason as
 * text under it (a tooltip never fires on a phone).
 */
function SheetBlock({
  sheet,
  status,
  plan,
  busy,
  onTick,
}: {
  sheet: DsrSheet;
  status: DsrShareStatus;
  plan: DsrSheetPlan;
  busy: boolean;
  onTick: (side: ShareSide, on: boolean) => void;
}) {
  const headingId = React.useId();
  const held: DsrSheetHolders = status.holders[sheet];
  return (
    <div role="group" aria-labelledby={headingId} className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p id={headingId} className="text-sm font-semibold text-text">
          {DSR_SHEET_LABELS[sheet]}
        </p>
        <p className="text-xs font-medium text-text-muted">{choiceLabel(plan[sheet], held)}</p>
      </div>
      <p className="mt-0.5 text-xs text-text-subtle">{holdersLine(held, status.unrecorded)}</p>
      <div className="mt-1 grid">
        {(['owners', 'manager'] as const).map((side) => (
          <SideRow
            key={side}
            side={side}
            checked={sideTicked(plan, sheet, side)}
            busy={busy}
            available={sideAvailability(side, status.outlet)}
            hint={sideHint(side, held, status.outlet)}
            onChange={(on) => onTick(side, on)}
          />
        ))}
      </div>
    </div>
  );
}

function SideRow({
  side,
  checked,
  busy,
  available,
  hint,
  onChange,
}: {
  side: ShareSide;
  checked: boolean;
  busy: boolean;
  available: { available: boolean; reason: string | null };
  hint: string;
  onChange: (on: boolean) => void;
}) {
  const reasonId = React.useId();
  const label = side === 'owners' ? 'Owners' : 'Manager';
  return (
    <>
      <Checkbox
        checked={checked && available.available}
        onChange={(e) => onChange(e.target.checked)}
        disabled={busy || !available.available}
        align="start"
        label={label}
        // A dead box keeps its reason OUT of the dimmed label, below: the
        // reason is the one thing on a dead row the admin has to be able to read.
        hint={available.available ? hint : undefined}
        aria-describedby={available.available ? undefined : reasonId}
      />
      {available.available ? null : (
        <p id={reasonId} className="-mt-1 pb-1.5 pl-7 text-xs text-text-muted md:pl-6">
          {available.reason}
        </p>
      )}
    </>
  );
}
