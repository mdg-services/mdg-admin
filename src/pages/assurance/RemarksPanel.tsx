import { AlertCircle, NotebookPen, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  useCreateRemark,
  useRemarks,
  useRevokeRemark,
  type AssuranceRemark,
} from '@/hooks/api/useRemarks';
import { ApiError } from '@/lib/api';
import {
  checkMeta,
  CHECK_CATALOGUE,
  EMPTY_REMARK_DRAFT,
  MAGNITUDE_ESCALATION_FACTOR,
  MAX_REMARK_DAYS,
  remarkEffect,
  remarkEffectNote,
  remarkExpiry,
  remarkProblems,
  remarkWindow,
  scopeLabel,
  type CheckMeta,
  type RemarkDraft,
} from '@/lib/assuranceCatalogue';
import { cn } from '@/lib/cn';
import { formatYmd, istTodayYmd, isYmd } from '@/lib/format';
import { dealerCodeLabel } from '@dk/shared';

/**
 * A dealer's standing operational remarks.
 *
 * WHAT THIS IS FOR. Some checks fire every day at one outlet for a reason that
 * is true and physical: 1E's tank 6 dip meter is broken, so its dip is typed in
 * by hand and never quite agrees with the meters; 16E's nozzles 5 and 6 do not
 * work. An admin with nowhere to write that down has two options and both are
 * bad — click an override on every report forever until the click stops meaning
 * anything, or widen a threshold for all nine dealers because one tank has a
 * broken gauge.
 *
 * WHY THE LIMITS ARE ON THE SCREEN AND NOT IN A WIKI. Three rules constrain
 * every remark, all three enforced by the server, and an admin who does not
 * know them reads each one as the feature being broken: the 90-day cap silently
 * rewrites the end date they typed; a physical impossibility refuses to be
 * suppressed at all; and a fault that grows past 3x retires the note written
 * about it. Each is stated beside the field it governs, in the words it will
 * actually behave in.
 */
export interface RemarksPanelProps {
  dealerId: string;
  /** The only thing that identifies a dealer. Used for the heading. */
  outletCode?: string | null;
  className?: string;
}

export function RemarksPanel({
  dealerId,
  outletCode,
  className,
}: RemarksPanelProps) {
  const listQ = useRemarks(dealerId);
  const create = useCreateRemark(dealerId);
  const revoke = useRevokeRemark(dealerId);
  const toast = useToast();

  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<RemarkDraft>(() => ({
    ...EMPTY_REMARK_DRAFT,
    effectiveFrom: istTodayYmd(),
  }));
  // Problems are computed on every keystroke and SHOWN only after a submit
  // attempt: a form that goes red before the first character is typed teaches
  // the operator to ignore the red.
  const [submitted, setSubmitted] = React.useState(false);
  const [revoking, setRevoking] = React.useState<AssuranceRemark | null>(null);

  const remarks = listQ.data ?? [];
  const problems = remarkProblems(draft);
  const today = istTodayYmd();

  function patch(next: Partial<RemarkDraft>) {
    setDraft((d) => ({ ...d, ...next }));
  }

  function toggleCode(code: string) {
    setDraft((d) => ({
      ...d,
      suppresses: d.suppresses.includes(code)
        ? d.suppresses.filter((c) => c !== code)
        : [...d.suppresses, code],
    }));
  }

  function resetForm() {
    setDraft({ ...EMPTY_REMARK_DRAFT, effectiveFrom: istTodayYmd() });
    setSubmitted(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (problems.length > 0) {
      toast.error('The remark is not complete yet', {
        description: problems[0],
      });
      return;
    }
    try {
      await create.mutateAsync({
        scope: {
          ...(draft.productKey.trim()
            ? { productKey: draft.productKey.trim() }
            : {}),
          ...(draft.tankNo.trim() ? { tankNo: Number(draft.tankNo) } : {}),
          ...(draft.nozzleNo.trim() ? { nozzleNo: Number(draft.nozzleNo) } : {}),
        },
        suppresses: draft.suppresses,
        text: draft.text.trim(),
        effectiveFrom: draft.effectiveFrom,
        ...(draft.effectiveTo ? { effectiveTo: draft.effectiveTo } : {}),
      });
      toast.success('Remark recorded', {
        description:
          'It applies to reports generated from here on, and lapses on its own.',
      });
      resetForm();
      setAdding(false);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not save the remark',
      );
    }
  }

  async function onRevoke() {
    const target = revoking;
    if (!target) return;
    try {
      await revoke.mutateAsync(target.id);
      toast.success('Remark withdrawn', {
        description:
          'It stops covering reports from now on. The row stays, so the reason is still answerable later.',
      });
      setRevoking(null);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not withdraw the remark',
      );
    }
  }

  return (
    <div className={cn('grid gap-3 md:gap-4', className)}>
      <WhatARemarkDoes />

      {adding ? (
        <Card>
          <CardHeader>
            <CardTitle>New standing remark</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={onSubmit}>
              <div>
                <Label htmlFor="remark-text" required>
                  What is physically going on
                </Label>
                <Textarea
                  id="remark-text"
                  value={draft.text}
                  onChange={(e) => patch({ text: e.target.value })}
                  placeholder="Tank 6's dip meter is broken, so its dip is entered by hand and never quite agrees with the meters."
                  rows={3}
                  invalid={submitted && draft.text.trim().length < 3}
                />
                <p className="mt-1 text-xs text-text-subtle">
                  Your own words, quoted back to you if the remark ever stops
                  applying. Say the fault, not the finding.
                </p>
              </div>

              <CheckPicker selected={draft.suppresses} onToggle={toggleCode} />

              <div>
                <Label>Scope</Label>
                <p className="mb-2 text-xs text-text-subtle">
                  Optional, and every box left blank is a wildcard. Naming tank 6
                  does NOT cover a finding that names no tank — a product-wide
                  variation is not known to be about tank 6, and treating it as
                  though it were is how one broken gauge excuses a whole outlet.
                </p>
                {/* min-w-0 on each cell: a grid track is sized by its item's
                    min-content, and a `type="number"` field's intrinsic width
                    plus its spinner overflows a 328px drawer without it. */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="min-w-0">
                    <Label htmlFor="remark-product" className="text-xs">
                      Product
                    </Label>
                    <Input
                      id="remark-product"
                      value={draft.productKey}
                      onChange={(e) => patch({ productKey: e.target.value })}
                      placeholder="MS / HSD / XP95"
                      maxLength={32}
                    />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="remark-tank" className="text-xs">
                      Tank
                    </Label>
                    <Input
                      id="remark-tank"
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={draft.tankNo}
                      onChange={(e) => patch({ tankNo: e.target.value })}
                      placeholder="6"
                    />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="remark-nozzle" className="text-xs">
                      Nozzle
                    </Label>
                    <Input
                      id="remark-nozzle"
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={draft.nozzleNo}
                      onChange={(e) => patch({ nozzleNo: e.target.value })}
                      placeholder="5"
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>How long it runs</Label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <Label htmlFor="remark-from" className="text-xs" required>
                      From
                    </Label>
                    <Input
                      id="remark-from"
                      type="date"
                      value={draft.effectiveFrom}
                      onChange={(e) => patch({ effectiveFrom: e.target.value })}
                      invalid={submitted && !isYmd(draft.effectiveFrom)}
                    />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="remark-to" className="text-xs">
                      Until
                    </Label>
                    <Input
                      id="remark-to"
                      type="date"
                      value={draft.effectiveTo}
                      onChange={(e) => patch({ effectiveTo: e.target.value })}
                    />
                  </div>
                </div>
                <ExpiryNote draft={draft} />
              </div>

              <EscalationNote />

              {submitted && problems.length > 0 ? (
                // A `<span>` list and not a `<ul>`: `Callout` puts its children
                // inside a span, and a block list nested in an inline element
                // is invalid HTML.
                <Callout intent="warning">
                  <span className="block font-semibold">
                    {problems.length === 1
                      ? 'One thing to fix'
                      : `${problems.length} things to fix`}
                  </span>
                  {problems.map((p) => (
                    <span key={p} className="mt-0.5 block">
                      {p}
                    </span>
                  ))}
                </Callout>
              ) : null}

              {/* flex-col-reverse below md: the primary action stays last in the
                  DOM, where the tab order wants it, and comes out first on
                  screen, where the thumb is. */}
              <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
                <Button
                  variant="secondary"
                  onClick={() => {
                    resetForm();
                    setAdding(false);
                  }}
                  disabled={create.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={create.isPending}>
                  Record remark
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          action={
            adding ? undefined : (
              <Button
                size="sm"
                onClick={() => setAdding(true)}
                leftIcon={<Plus width={14} height={14} strokeWidth={1.75} />}
              >
                Add a remark
              </Button>
            )
          }
          actionWidth="full"
        >
          <CardTitle>
            Standing remarks
            {outletCode ? ` · ${dealerCodeLabel(outletCode)}` : ''}
          </CardTitle>
          <p className="mt-0.5 text-sm text-text-muted">
            {remarks.length === 0
              ? 'Nothing recorded for this dealer.'
              : `${remarks.length} live remark${remarks.length === 1 ? '' : 's'}.`}
          </p>
        </CardHeader>
        {/* `padding="none"` and the rows carry their own inset. The list
            renders at EVERY width, so a padded CardContent would sit inside
            the card's padding and inside the row's, and put the remark's first
            character 28px in from an already narrow drawer. */}
        <CardContent padding="none">
          {listQ.isLoading ? (
            <div className="grid gap-2 p-3 md:p-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : listQ.isError ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load this dealer's remarks"
              description={(listQ.error as Error).message}
              cta={
                <Button onClick={() => void listQ.refetch()}>Try again</Button>
              }
            />
          ) : remarks.length === 0 ? (
            <EmptyState
              icon={<NotebookPen width={28} height={28} strokeWidth={1.75} />}
              title="No standing remarks"
              description="Nothing at this outlet is currently explained away. Record one when a fault is real, physical and ongoing — a dead dip gauge, a nozzle out of service."
              cta={
                adding ? null : (
                  <Button onClick={() => setAdding(true)}>Add a remark</Button>
                )
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {remarks.map((remark) => (
                <RemarkRow
                  key={remark.id}
                  remark={remark}
                  today={today}
                  onRevoke={() => setRevoking(remark)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={revoking !== null}
        onCancel={() => setRevoking(null)}
        onConfirm={() => void onRevoke()}
        title="Withdraw this remark?"
        confirmLabel="Withdraw"
        confirmVariant="danger"
        loading={revoke.isPending}
        description={
          <span className="grid gap-2 text-sm text-text-muted">
            <span>
              Reports generated from now on will raise this finding again at its
              full severity.
            </span>
            <span className="rounded-md bg-surface-2 px-3 py-2 text-text">
              {revoking?.text}
            </span>
            <span>
              The row stays on the list, stamped with today&apos;s date — months
              from now, &ldquo;the remark covering it was withdrawn on the
              14th&rdquo; is only answerable if it is still there.
            </span>
          </span>
        }
      />
    </div>
  );
}

/**
 * The two sentences that stop this screen being misread.
 *
 * A remark looks like a release button and is not one, and the difference is
 * not obvious from anything else on the page. Stated once, at the top, rather
 * than discovered when a report an admin has explained is still refusing to
 * send.
 */
function WhatARemarkDoes() {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2.5 text-xs text-text-muted">
      <p className="font-semibold text-text">What a remark does</p>
      <p className="mt-1">
        It lowers a finding to the floor that finding&apos;s own check declares
        — never below — in the verdict recorded when the report is generated,
        and it is handed to the second reader so a known fault is not raised
        again as a fresh concern.
      </p>
      <p className="mt-1.5 font-semibold text-text">What it does not do</p>
      <p className="mt-1">
        It does not release a held report on its own. At the moment of sending,
        the gate re-runs the checks live and takes that reading over any stored
        downgrade — and ten of the eleven checks below run there. To send a held
        report, use the release control on that report&apos;s own panel: it
        names a reason and every holding finding, and it is pinned to those
        exact figures.
      </p>
    </div>
  );
}

/**
 * The 90-day cap, said while the admin is looking at the date they typed.
 *
 * The server applies the cap on the way IN, so what is shown here is what will
 * be stored — not a warning about what might happen. Finding out months later
 * that a date was quietly ignored is the failure this prevents.
 */
function ExpiryNote({ draft }: { draft: RemarkDraft }) {
  if (!isYmd(draft.effectiveFrom)) {
    return (
      <p className="mt-2 text-xs text-text-subtle">
        Every remark expires. Whatever end date is chosen, the most that can be
        stored is {MAX_REMARK_DAYS} days from the start.
      </p>
    );
  }
  const { effectiveTo, capped } = remarkExpiry(
    draft.effectiveFrom,
    draft.effectiveTo || null,
  );
  return (
    <p
      className={cn(
        'mt-2 text-xs',
        capped ? 'text-warning' : 'text-text-subtle',
      )}
    >
      This will be stored as ending{' '}
      <span className="font-semibold">{formatYmd(effectiveTo)}</span>.{' '}
      {capped
        ? `The ${formatYmd(draft.effectiveTo)} you picked is past the ${MAX_REMARK_DAYS}-day ceiling, so it is capped on save.`
        : `Nothing here is permanent — ${MAX_REMARK_DAYS} days is the ceiling.`}{' '}
      When it lapses the finding comes back at full severity, and somebody
      re-affirms the remark or fixes the fault.
    </p>
  );
}

/**
 * The third limit: a fault that grew is a new fault wearing the old one's
 * clothes.
 *
 * The last sentence is not a caveat for its own sake. `remarkBody` in the
 * admin route has no `observedAtIssue` field and Zod strips what it does not
 * declare, so a remark written on this screen carries no figure and the 3x
 * comparison has nothing to run against. Quoting the rule without saying that
 * would describe a guard that is not guarding anything.
 */
function EscalationNote() {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2.5 text-xs text-text-muted">
      <p className="font-semibold text-text">
        A remark stops applying if the fault grows
      </p>
      <p className="mt-1">
        A remark is measured against the figure the check reported when it was
        written. Once that figure is more than{' '}
        {MAGNITUDE_ESCALATION_FACTOR}x larger, the remark stops covering it and
        the finding names both numbers — the one it was written against and
        today&apos;s — so a fault that grew by an order of magnitude cannot hide
        behind a note about a small one.
      </p>
      <p className="mt-1.5">
        This form cannot record that figure: the create endpoint does not accept
        one, so a remark written here carries none and the comparison never
        fires. Its {MAX_REMARK_DAYS}-day expiry and the floors above are what
        constrain it.
      </p>
    </div>
  );
}

/**
 * Which checks this remark explains.
 *
 * Split into two groups rather than one list with disabled entries scattered
 * through it. Seven of the eleven checks cannot be suppressed by anything, and
 * an admin scanning for the one that matches their broken gauge should not have
 * to read past them — while still being able to see that they exist and why
 * they are shut.
 */
function CheckPicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (code: string) => void;
}) {
  const explainable = CHECK_CATALOGUE.filter(
    (c) => remarkEffect(c) !== 'FORBIDDEN',
  );
  const forbidden = CHECK_CATALOGUE.filter(
    (c) => remarkEffect(c) === 'FORBIDDEN',
  );

  return (
    <div>
      <Label required>Which checks this explains</Label>
      <p className="mb-2 text-xs text-text-subtle">
        At least one. A remark that names no check explains nothing, and a
        free-floating note would quietly become a licence over whatever fires
        next.
      </p>

      <div className="grid gap-2">
        {explainable.map((meta) => (
          <CheckOption
            key={meta.code}
            meta={meta}
            checked={selected.includes(meta.code)}
            onToggle={() => onToggle(meta.code)}
          />
        ))}
      </div>

      <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Cannot be suppressed
      </p>
      <p className="mb-2 text-xs text-text-subtle">
        These say the report states something a forecourt forbids. No remark, at
        any scope, written by anyone, releases one — a note typed in a hurry must
        never be able to send a report claiming an outlet sold more fuel than has
        ever been in its tanks.
      </p>
      <div className="grid gap-2">
        {forbidden.map((meta) => (
          <CheckOption key={meta.code} meta={meta} checked={false} disabled />
        ))}
      </div>
    </div>
  );
}

function CheckOption({
  meta,
  checked,
  onToggle,
  disabled = false,
}: {
  meta: CheckMeta;
  checked: boolean;
  onToggle?: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2',
        checked ? 'border-brand bg-surface-2' : 'border-border bg-surface',
        disabled && 'bg-surface-2',
      )}
    >
      <Checkbox
        align="start"
        checked={checked}
        disabled={disabled}
        // Never omitted, even on the disabled options: React warns about a
        // `checked` field with no `onChange`, and `disabled` does not silence it.
        onChange={onToggle ?? (() => {})}
        label={
          <span className="block break-words text-sm font-medium text-text">
            {meta.title}
          </span>
        }
        hint={
          <span className="block">
            <span className="block break-words">{meta.meaning}</span>
            {/* The consequence, never a tooltip: `title` attributes do not fire
                on touch, and this is the sentence that decides whether ticking
                the box was worth doing. */}
            <span className="mt-1 block break-words font-medium text-text-muted">
              {remarkEffectNote(meta)}
            </span>
            <span className="mt-1 block break-all font-mono text-[11px] text-text-subtle">
              {meta.code}
            </span>
          </span>
        }
      />
    </div>
  );
}

const WINDOW_LABEL = {
  PENDING: 'Not started yet',
  ACTIVE: 'In force',
  LAPSED: 'Lapsed',
} as const;

function RemarkRow({
  remark,
  today,
  onRevoke,
}: {
  remark: AssuranceRemark;
  today: string;
  onRevoke: () => void;
}) {
  // Not `window`: shadowing the global inside a browser component is how a
  // later edit reaching for `window.matchMedia` finds a remark instead.
  const span = remarkWindow(remark.effectiveFrom, remark.effectiveTo, today);
  const revoked = !!remark.revokedAt;
  const intent = revoked
    ? 'neutral'
    : span.state === 'ACTIVE'
      ? 'success'
      : span.state === 'PENDING'
        ? 'info'
        : 'warning';

  return (
    <li className={cn('p-3 md:p-4', revoked && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 break-words text-sm font-medium text-text">
          {remark.text}
        </p>
        <Badge intent={intent}>
          {revoked ? 'Withdrawn' : WINDOW_LABEL[span.state]}
        </Badge>
      </div>

      <p className="mt-1 text-xs text-text-muted">
        {scopeLabel(remark.scope)}
        {remark.serviceId ? ` · ${remark.serviceId} only` : ' · every service'}
      </p>

      <ul className="mt-2 grid gap-1">
        {remark.suppresses.map((code) => {
          const meta = checkMeta(code);
          return (
            <li key={code} className="min-w-0 text-xs">
              <span className="block break-words text-text">{meta.title}</span>
              <span className="block break-all font-mono text-[11px] text-text-subtle">
                {code}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-xs text-text-subtle">
        {formatYmd(remark.effectiveFrom)} to {formatYmd(remark.effectiveTo)}
        {revoked
          ? ` · withdrawn ${formatYmd(remark.revokedAt?.slice(0, 10))}`
          : span.state === 'ACTIVE'
            ? ` · ${span.daysLeft} day${span.daysLeft === 1 ? '' : 's'} left`
            : ''}
      </p>

      {revoked ? null : (
        <div className="mt-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={onRevoke}
            leftIcon={<Trash2 width={14} height={14} strokeWidth={1.75} />}
          >
            Withdraw
          </Button>
        </div>
      )}
    </li>
  );
}
