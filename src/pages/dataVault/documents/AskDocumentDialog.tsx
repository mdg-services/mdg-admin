import { Check, Search, X } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Callout,
  Checkbox,
  Dialog,
  Input,
  Label,
  MIN_SELECTABLE_YMD,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import { useDealersQuery } from '@/hooks/api/useDealers';
import { useCreateDocumentAsk } from '@/hooks/api/useDocumentAsks';
import { ApiError } from '@/lib/api';
import { istTodayYmd, isYmd } from '@/lib/format';
import { compareDealerCodes, dealerCodeLabel, DOCUMENT_PERIOD_SLUG_MAX } from '@dk/shared';
import { DOCUMENT_ASK_NOTE_MAX } from '@dk/shared/schemas';

import { BulkOutcomeList } from './BulkOutcomeList';
import { DOCUMENT_KINDS, summariseBulk, type BulkOutcome } from './format';

/**
 * "We need this paper from you" — for one dealer or for a dozen.
 *
 * THE BULK PATH IS THE POINT, AND SO IS ITS HONESTY
 * -------------------------------------------------
 * `POST /v1/asks` takes one dealer, so asking eight dealers is eight requests
 * and any of them can legitimately refuse while the others succeed. There are at
 * least four such refusals and none of them is an error in this screen: the
 * dealer is not on the service the paper belongs to, the request is already open
 * and would be a duplicate, MDG has already accepted that period, or the dealer
 * was archived between this list loading and the button being pressed. A button
 * that reports "Done" after two of eight went through is a lie, so this reports
 * both numbers and keeps the server's own sentence beside each dealer that
 * refused.
 *
 * The requests are made ONE AT A TIME rather than with `Promise.all`. The
 * production box is a 908 MB machine that already caps browser concurrency at
 * one after twelve OOM kills; a fan-out of forty writes from a button is not a
 * thing to discover in production. Sequential also makes the result list arrive
 * in the order the dealers are shown, which is the order somebody will read it.
 */

/** How many dealers the picker loads. The whole live estate fits comfortably. */
const DEALER_PAGE_SIZE = 200;

export interface AskDocumentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-tick these dealers — used by "Ask for it" on a row that has none. */
  initialDealerIds?: readonly string[];
  /** Pre-select this kind, so asking from a scoped estate stays in that scope. */
  initialKindCode?: string;
  /** Pre-fill the period, so "ask everyone for last Tuesday's page" is two clicks. */
  initialDate?: string;
}

export function AskDocumentDialog({
  open,
  onClose,
  initialDealerIds,
  initialKindCode,
  initialDate,
}: AskDocumentDialogProps) {
  const toast = useToast();
  const today = istTodayYmd();

  const [kindCode, setKindCode] = React.useState(initialKindCode ?? DOCUMENT_KINDS[0]?.code ?? '');
  const [date, setDate] = React.useState(initialDate ?? today);
  const [label, setLabel] = React.useState('');
  const [note, setNote] = React.useState('');
  const [dueInDays, setDueInDays] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [picked, setPicked] = React.useState<string[]>([...(initialDealerIds ?? [])]);
  const [error, setError] = React.useState<string | null>(null);
  const [outcomes, setOutcomes] = React.useState<BulkOutcome[] | null>(null);
  const [running, setRunning] = React.useState(false);

  /**
   * The pre-ticked dealers, as a VALUE rather than a reference.
   *
   * `initialDealerIds` is an array literal at every call site, so it is a new
   * object on every render of the page — and an effect keyed on it would re-run
   * constantly, wiping the admin's half-made selection on every keystroke
   * anywhere else on the screen. Keyed on the contents, the effect runs when the
   * contents actually change and at no other time.
   */
  const initialDealerKey = (initialDealerIds ?? []).join(',');

  // Re-seed on every open. A dialog that remembered the last dealer set would
  // quietly ask a second outlet for a paper on the next open — the mistake
  // nobody notices until a dealer rings to say they have already sent it.
  React.useEffect(() => {
    if (!open) return;
    setKindCode(initialKindCode ?? DOCUMENT_KINDS[0]?.code ?? '');
    setDate(initialDate ?? today);
    setLabel('');
    setNote('');
    setDueInDays('');
    setQuery('');
    setPicked(initialDealerKey ? initialDealerKey.split(',') : []);
    setError(null);
    setOutcomes(null);
    setRunning(false);
  }, [open, initialKindCode, initialDate, today, initialDealerKey]);

  const dealersQ = useDealersQuery({ pageSize: DEALER_PAGE_SIZE });
  const create = useCreateDocumentAsk();

  const kind = DOCUMENT_KINDS.find((k) => k.code === kindCode);
  const needsLabel = kind?.freeform ?? false;

  const dealers = React.useMemo(() => {
    const items = dealersQ.data?.items ?? [];
    // Archived dealers cannot be asked for anything — the route refuses them —
    // so they are dropped here rather than offered and then refused one by one.
    return items
      .filter((d) => !d.archivedAt)
      .slice()
      .sort((a, b) => compareDealerCodes(a.code, b.code));
  }, [dealersQ.data]);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? dealers.filter((d) => (d.code ?? '').toLowerCase().includes(needle))
    : dealers;

  function toggle(id: string): void {
    setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  /** The BASE period key. The server composes the `:<slug>` suffix from `label`. */
  function periodKeyFromForm(): string {
    if (!kind) return '';
    switch (kind.periodKind) {
      case 'DAY':
        return date;
      case 'MONTH':
        return date.slice(0, 7);
      case 'YEAR':
        return date.slice(0, 4);
      case 'NONE':
        return '';
      default:
        return '';
    }
  }

  async function submit(): Promise<void> {
    if (!kind || running) return;
    setError(null);
    setOutcomes(null);

    if (picked.length === 0) {
      setError('Pick at least one dealer.');
      return;
    }
    // "A document MDG asked for" tells a dealer nothing, and the label is also
    // what keeps two freeform asks made on the same day from collapsing onto one
    // row. The route enforces both; refusing here means the admin is told before
    // eight requests go out and eight fail identically.
    if (needsLabel && label.trim().length < 3) {
      setError('Say what you are asking for — the dealer only ever sees these words.');
      return;
    }
    if (kind.periodKind !== 'NONE' && (!isYmd(date) || date < MIN_SELECTABLE_YMD || date > today)) {
      setError('Pick a real period that has already happened.');
      return;
    }
    const due = dueInDays.trim();
    if (due !== '' && (!/^\d{1,3}$/.test(due) || Number(due) > 365)) {
      setError('A due date is a whole number of days from today, up to 365.');
      return;
    }

    setRunning(true);
    const results: BulkOutcome[] = [];
    const byId = new Map(dealers.map((d) => [d.id, d.code]));
    // Sequential, deliberately — see the file header.
    for (const dealerId of picked) {
      const code = byId.get(dealerId) ?? dealerId;
      try {
        await create.mutateAsync({
          dealerId,
          kindCode: kind.code,
          periodKind: kind.periodKind,
          periodKey: periodKeyFromForm(),
          ...(needsLabel ? { label: label.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(due !== '' ? { dueInDays: Number(due) } : {}),
        });
        results.push({ dealerCode: code, ok: true, message: 'Asked' });
      } catch (err) {
        results.push({
          dealerCode: code,
          ok: false,
          // The server's own sentence, shown as written: it already says WHY —
          // "MDG does not run tt-density for this outlet", "already accepted",
          // "already has an open ask" — and rewording it here would lose the
          // only thing that tells the admin what to do instead.
          message: err instanceof ApiError ? err.message : 'Could not ask for it',
        });
      }
    }
    setRunning(false);
    setOutcomes(results);

    const summary = summariseBulk(results, 'asked');
    if (results.every((r) => r.ok)) {
      toast.success(summary);
      onClose();
      return;
    }
    toast.error(summary);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Ask for a document"
      description="The dealer gets a notification straight away, in Hindi, with your words under it."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            {outcomes ? 'Close' : 'Cancel'}
          </Button>
          <Button
            onClick={() => void submit()}
            loading={running}
            disabled={running || picked.length === 0}
            leftIcon={<Check width={16} height={16} strokeWidth={1.75} />}
          >
            {picked.length > 1 ? `Ask ${picked.length} dealers` : 'Ask'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Callout intent="warning">{error}</Callout> : null}
        {outcomes ? (
          <BulkOutcomeList outcomes={outcomes} summary={summariseBulk(outcomes, 'asked')} />
        ) : null}

        <div className="grid gap-3 [&>*]:min-w-0 md:grid-cols-2">
          <div>
            <Label htmlFor="ask-kind" required>
              Which paper
            </Label>
            <Select
              id="ask-kind"
              value={kindCode}
              onChange={(e) => setKindCode(e.target.value)}
              disabled={running}
            >
              {DOCUMENT_KINDS.map((k) => (
                <option key={k.code} value={k.code}>
                  {k.titleEn}
                </option>
              ))}
            </Select>
            {kind ? <p className="mt-1 text-xs text-text-muted">{kind.hintEn}</p> : null}
          </div>

          {kind && kind.periodKind !== 'NONE' ? (
            <div>
              <Label htmlFor="ask-period" required>
                {kind.periodKind === 'DAY'
                  ? 'Which day'
                  : kind.periodKind === 'MONTH'
                    ? 'Which month'
                    : 'Which year'}
              </Label>
              {/* ONE piece of state for every period shape. A DAY kind uses the
                  day, a MONTH kind takes the month out of it and a YEAR kind the
                  year, so there is only ever one notion on this form of "which
                  period" — and only one thing that can be wrong. The CONTROL
                  changes, because a month picker for a day and a date picker for
                  a year are both ways of asking somebody to enter a value they
                  are not being asked for. */}
              <Input
                id="ask-period"
                type={
                  kind.periodKind === 'DAY'
                    ? 'date'
                    : kind.periodKind === 'MONTH'
                      ? 'month'
                      : 'number'
                }
                value={
                  kind.periodKind === 'DAY'
                    ? date
                    : kind.periodKind === 'MONTH'
                      ? date.slice(0, 7)
                      : date.slice(0, 4)
                }
                min={
                  kind.periodKind === 'DAY'
                    ? MIN_SELECTABLE_YMD
                    : kind.periodKind === 'MONTH'
                      ? MIN_SELECTABLE_YMD.slice(0, 7)
                      : MIN_SELECTABLE_YMD.slice(0, 4)
                }
                max={
                  kind.periodKind === 'DAY'
                    ? today
                    : kind.periodKind === 'MONTH'
                      ? today.slice(0, 7)
                      : today.slice(0, 4)
                }
                disabled={running}
                onChange={(e) => {
                  // A `month` input hands back `YYYY-MM` and a year box `YYYY`;
                  // the state stays a full day either way, so `periodKeyFromForm`
                  // has exactly one shape to slice.
                  const next = e.target.value;
                  setDate(
                    next.length === 7 ? `${next}-01` : next.length === 4 ? `${next}-01-01` : next,
                  );
                }}
              />
              <p className="mt-1 text-xs text-text-muted">
                A period that has not happened yet is refused — you cannot owe a paper for
                tomorrow.
              </p>
            </div>
          ) : null}
        </div>

        {needsLabel ? (
          <div>
            <Label htmlFor="ask-label" required>
              What exactly you need
            </Label>
            <Input
              id="ask-label"
              value={label}
              maxLength={DOCUMENT_PERIOD_SLUG_MAX}
              disabled={running}
              placeholder="e.g. Electricity bill for August"
              onChange={(e) => setLabel(e.target.value)}
            />
            <p className="mt-1 text-xs text-text-muted">
              These are the only words the dealer sees, and two requests made on the same day
              are told apart by them. Hindi is fine.
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 [&>*]:min-w-0 md:grid-cols-[1fr_auto]">
          <div>
            <Label htmlFor="ask-note">A message with it (optional)</Label>
            {/* `maxLength` is the ROUTE'S cap, imported, never a number typed
                here: one that drifted above it would let an admin finish a note
                the server then refuses, and the whole ask is lost at the last
                step with the words still on screen. */}
            <Textarea
              id="ask-note"
              value={note}
              rows={2}
              maxLength={DOCUMENT_ASK_NOTE_MAX}
              disabled={running}
              placeholder="Shown under the title on their phone, word for word."
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ask-due">Wanted within (days)</Label>
            <Input
              id="ask-due"
              inputMode="numeric"
              value={dueInDays}
              disabled={running}
              placeholder="e.g. 3"
              className="md:w-32"
              onChange={(e) => setDueInDays(e.target.value)}
            />
            {/* A day count and not a date, because the SERVER owns what "in three
                days" means in IST — a laptop clock a day out is not the authority
                on that. And a due date passing is not a transition: the request
                stays open and the row simply reads overdue. */}
            <p className="mt-1 text-xs text-text-muted">
              Leave it blank for no deadline. Passing it does not close the request.
            </p>
          </div>
        </div>

        {/* ── Who ── */}
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="ask-dealer-search">
              Which dealers{picked.length > 0 ? ` · ${picked.length} picked` : ''}
            </Label>
            {picked.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={running}
                onClick={() => setPicked([])}
                leftIcon={<X width={14} height={14} strokeWidth={1.75} />}
              >
                Clear
              </Button>
            ) : null}
          </div>
          <div className="relative">
            <Search
              width={15}
              height={15}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
            />
            <Input
              id="ask-dealer-search"
              type="search"
              value={query}
              disabled={running}
              placeholder="Search by code"
              className="pl-9"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {dealersQ.isLoading ? (
            <div className="mt-2 grid gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : dealersQ.isError ? (
            <Callout intent="warning" className="mt-2" onRetry={() => void dealersQ.refetch()}>
              Could not load the dealer list.
            </Callout>
          ) : visible.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">No dealer matches that code.</p>
          ) : (
            // Its own scroller, capped, so a fifty-dealer estate does not push the
            // Ask button off a 740px phone screen. `overscroll-contain` keeps a
            // fling inside the list instead of bubbling to the sheet behind it.
            <ul className="mt-2 max-h-60 overflow-y-auto overscroll-contain rounded-md border border-border">
              {visible.map((dealer) => (
                <li key={dealer.id} className="border-b border-border last:border-b-0">
                  <Checkbox
                    checked={picked.includes(dealer.id)}
                    disabled={running}
                    onChange={() => toggle(dealer.id)}
                    label={dealerCodeLabel(dealer.code)}
                    // The whole row is the hit area; `Checkbox` already carries
                    // the `min-h-11` floor, so this only widens it to the list
                    // and gives the text somewhere to sit.
                    labelClassName="w-full px-3 py-2"
                  />
                </li>
              ))}
            </ul>
          )}
          {dealersQ.data && dealersQ.data.total > dealers.length ? (
            <p className="mt-1 text-xs text-text-subtle">
              Showing {dealers.length} of {dealersQ.data.total} dealers. Search by code to reach
              the rest.
            </p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
