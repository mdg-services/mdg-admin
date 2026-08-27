import { AlertCircle, ChevronRight, Clock } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  EmptyState,
  FilterBar,
  Input,
  Label,
  Pagination,
  Select,
  Skeleton,
  StatusChip,
} from '@/components/ui';
import { useRunsQuery } from '@/hooks/api/useRuns';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { formatDateTime, formatDuration, groupByDay } from '@/lib/format';
import { serviceLabel } from '@/lib/serviceLabel';
import type { ServiceRun, ServiceRunStatus } from '@dk/shared';

const STATUSES: Array<{ value: '' | ServiceRunStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILED', label: 'Failed' },
];

const PAGE_SIZE = 25;

export function RunHistoryPage() {
  const [search, setSearch] = useSearchParams();
  const [open, setOpen] = React.useState<ServiceRun | null>(null);

  const dealerId = search.get('dealerId') ?? undefined;
  const serviceId = search.get('serviceId') ?? undefined;
  const status =
    (search.get('status') as ServiceRunStatus | null) ?? undefined;
  const from = search.get('from') ?? undefined;
  const to = search.get('to') ?? undefined;
  const page = Number(search.get('page') ?? '1');

  const { data, isLoading, isError, error, isFetching } = useRunsQuery({
    dealerId,
    serviceId,
    status,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to).toISOString() : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  function update(key: string, value: string | undefined) {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearch(next, { replace: true });
  }

  const grouped = data ? groupByDay(data.items) : [];
  const activeFilters = [dealerId, serviceId, status, from, to].filter(
    Boolean,
  ).length;

  function clearFilters() {
    const next = new URLSearchParams(search);
    for (const key of ['dealerId', 'serviceId', 'status', 'from', 'to', 'page']) {
      next.delete(key);
    }
    setSearch(next, { replace: true });
  }

  return (
    <div>
      <PageHeader
        title="Run history"
        subtitle="Timeline of every service execution."
      />

      {/* Five stacked filters were ~330px of a 640px screen, so the first run
          on the page started below the fold on every visit even though these
          are used rarely. `FilterBar` is byte-identical at md and one 44px
          button below it. */}
      <FilterBar
        className="mb-4"
        columnsAtMd={5}
        activeCount={activeFilters}
        onClear={clearFilters}
      >
        <TextFilter
          id="dealerId"
          label="Dealer ID"
          placeholder="24-char hex"
          value={dealerId ?? ''}
          onCommit={(v) => update('dealerId', v)}
        />
        <TextFilter
          id="serviceId"
          label="Service ID"
          placeholder="plugin slug"
          value={serviceId ?? ''}
          onCommit={(v) => update('serviceId', v)}
        />
        <div>
          <Label htmlFor="status">Status</Label>
          <Select
            id="status"
            value={status ?? ''}
            onChange={(e) =>
              update('status', e.target.value || undefined)
            }
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="from">From</Label>
          <Input
            id="from"
            type="date"
            defaultValue={from ?? ''}
            onChange={(e) => update('from', e.target.value || undefined)}
          />
        </div>
        <div>
          <Label htmlFor="to">To</Label>
          <Input
            id="to"
            type="date"
            defaultValue={to ?? ''}
            onChange={(e) => update('to', e.target.value || undefined)}
          />
        </div>
      </FilterBar>

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
          title="Could not load run history"
          description={(error as Error).message}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<Clock width={28} height={28} strokeWidth={1.75} />}
          title="No runs yet"
          description="Once services run, their results show up here."
        />
      ) : (
        <>
          <div className="grid gap-3 md:gap-4">
            {grouped.map((g) => (
              <Card key={g.day}>
                {/* The body is the day's run list, so below md it runs to the
                    card's own edges. `md:p-4` is md+ unchanged: `cn` is clsx
                    and `.p-4` is emitted after `.p-0`, so the call site's `p-0`
                    never won there. */}
                <CardContent padding="none" className="md:p-4">
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:px-4">
                    <Clock
                      width={14}
                      height={14}
                      strokeWidth={1.75}
                      className="text-text-subtle"
                    />
                    <p className="text-sm font-semibold text-text">{g.day}</p>
                    <Badge intent="neutral">{g.items.length}</Badge>
                  </div>
                  <ul className="divide-y divide-border">
                    {g.items.map((r) => (
                      <li key={r.id}>
                        {/* A real `<button>`, not a `<li onClick>`: the row had
                            no role, no tabIndex and no keyboard handler, so it
                            was invisible to assistive tech and to the WebView's
                            own focus handling — and its only cue that it was
                            tappable at all was `hover:bg-surface-2`, which touch
                            never paints. The chevron is that cue. */}
                        <button
                          type="button"
                          className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-surface-2 md:min-h-0 md:px-4"
                          onClick={() => setOpen(r)}
                        >
                          {/* Desktop: single dense row (unchanged). */}
                          <div className="hidden items-center gap-3 md:flex">
                            <StatusChip kind="run" value={r.status} />
                            <span className="min-w-0 flex-1 truncate font-medium text-text">
                              {r.serviceId}
                            </span>
                            <span className="hidden text-xs text-text-muted md:inline">
                              {r.dealerId.slice(-6)}
                            </span>
                            <span className="text-xs text-text-muted">
                              {formatDateTime(r.startedAt)}
                            </span>
                            <span className="text-xs text-text-subtle">
                              {formatDuration(r.durationMs)}
                            </span>
                          </div>
                          {/* Mobile: two lines plus a chevron. */}
                          <div className="flex items-center gap-2 md:hidden">
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <StatusChip kind="run" value={r.status} />
                                <span className="min-w-0 flex-1 truncate font-medium text-text">
                                  {r.serviceId}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                                <span>{formatDateTime(r.startedAt)}</span>
                                <span className="text-text-subtle">·</span>
                                <span className="text-text-subtle">
                                  {formatDuration(r.durationMs)}
                                </span>
                              </div>
                            </div>
                            <ChevronRight
                              width={18}
                              height={18}
                              strokeWidth={1.75}
                              aria-hidden
                              className="shrink-0 text-text-subtle"
                            />
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-3">
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={(p) => update('page', String(p))}
            />
          </div>
          {isFetching ? (
            <p className="mt-2 text-xs text-text-subtle">Refreshing...</p>
          ) : null}
        </>
      )}

      <Dialog
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? `Run ${open.id.slice(-8)}` : ''}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setOpen(null)}>
            Close
          </Button>
        }
      >
        {open ? <RunDetail run={open} /> : null}
      </Dialog>
    </div>
  );
}

/**
 * One free-text filter, held in a local draft and pushed to the URL on blur, on
 * Enter, and on the way out.
 *
 * The flush on the way out is the whole reason this is a component rather than
 * an `<Input defaultValue>`. Below md these fields live inside `FilterBar`'s
 * sheet, and `Sheet` returns null when it closes, so tapping the dimmed
 * backdrop — or pressing Escape — tears the focused input out of the DOM. A
 * removed node fires no blur: the WebView never sends one and React's listener
 * has already gone with it. The dealer id an admin had just typed was therefore
 * dropped on the floor — the list stayed unfiltered, the trigger still read
 * "Filters" (its count comes from the URL), and reopening the sheet showed an
 * empty box. "Show results" only ever worked by luck, because a `<button>`
 * takes focus on pointer-down and blurs the field on its way in. This is the
 * exact trap `FilterBar`'s own docstring names; `SearchBox` in the assist
 * filters guards it the same way.
 *
 * The ref remembers the last value we pushed ourselves, so a value arriving on
 * the props is adopted only when it came from somewhere else — the back button,
 * "Clear all", a pasted link — and never as the echo of what is already in the
 * box.
 *
 * At md the fields never unmount between edits, so none of this is reachable
 * there and desktop behaviour is unchanged.
 */
function TextFilter({
  id,
  label,
  placeholder,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onCommit: (value: string | undefined) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  const emittedRef = React.useRef(value);

  React.useEffect(() => {
    if (value === emittedRef.current) return;
    emittedRef.current = value;
    setDraft(value);
  }, [value]);

  // Reading the pending value and the callback off a ref is what keeps the
  // flush effect's dependency list empty, so its cleanup runs on unmount and
  // not on every keystroke.
  const latestRef = React.useRef({ draft, onCommit });
  latestRef.current = { draft, onCommit };

  const commit = React.useCallback(() => {
    const { draft: pending, onCommit: send } = latestRef.current;
    if (pending === emittedRef.current) return;
    emittedRef.current = pending;
    send(pending || undefined);
  }, []);

  // Only flush while the browser is still on this page. Unmount also happens
  // when the operator leaves — the Android back button out of an open sheet is
  // the live case — and committing then would push the run-history URL back
  // over the page they just moved to. React Router has already updated
  // `window.location` by the time a cleanup runs, so this comparison sees it.
  const ownPathRef = React.useRef(window.location.pathname);
  React.useEffect(
    () => () => {
      if (window.location.pathname !== ownPathRef.current) return;
      commit();
    },
    [commit],
  );

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        placeholder={placeholder}
        inputMode="text"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={commitOnEnter}
        onBlur={commit}
      />
    </div>
  );
}

/**
 * A text filter that commits on blur alone never commits on Android: the
 * on-screen keyboard's Done key does not reliably blur a WebView input, and the
 * next control is a native `<select>` that opens its own overlay. So an admin
 * typed a dealer id and the list simply never filtered. Enter now blurs (which
 * commits through the existing handler), and `enterKeyHint` makes the key say
 * what it does.
 */
function commitOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.currentTarget.blur();
  }
}

/**
 * This whole page is a super-admin surface (see the `RequireSuperAdmin` route
 * guard and the `superAdminOnly` nav entry), but the raw error stack and the
 * output JSON dump are gated on the role here too, so relaxing the route later
 * can't quietly expose engineer-grade detail to a plain admin.
 */
function RunDetail({ run }: { run: ServiceRun }) {
  const isSuperAdmin = useIsSuperAdmin();
  return (
    <div className="grid gap-3 text-sm">
      {/* One column below md: two 150px columns inside the Dialog turned every
          formatted datetime into a ragged two-liner, and a 24-char ObjectId
          into an overflow. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-2">
        <Field
          label="Service"
          value={isSuperAdmin ? run.serviceId : serviceLabel(run.serviceId)}
        />
        <Field
          label="Status"
          value={<StatusChip kind="run" value={run.status} />}
        />
        <Field label="Started" value={formatDateTime(run.startedAt)} />
        <Field label="Finished" value={formatDateTime(run.finishedAt)} />
        <Field label="Duration" value={formatDuration(run.durationMs)} />
        {isSuperAdmin ? (
          <Field label="Dealer" value={run.dealerId} identifier />
        ) : null}
      </div>
      {isSuperAdmin ? (
        <>
          {run.error ? (
            <section>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Error
              </p>
              <pre className="scroll-pane overflow-auto rounded-md bg-surface-2 p-3 text-xs">
                {run.error.message}
                {run.error.stack ? `\n${run.error.stack}` : ''}
              </pre>
            </section>
          ) : null}
          <section>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Output
            </p>
            {/* `.scroll-pane` — inside the Dialog's own scroller, reaching the
                end of this dump otherwise starts dragging the sheet closed. */}
            <pre className="scroll-pane max-h-72 overflow-auto rounded-md bg-surface-2 p-3 text-xs">
              {JSON.stringify(run.output ?? null, null, 2)}
            </pre>
          </section>
        </>
      ) : (
        <p className="text-sm text-text-muted">
          {run.status === 'FAILED'
            ? "This run didn't finish. Please retry; if it keeps happening, contact the MDG team."
            : run.status === 'SUCCESS'
              ? 'This run completed successfully.'
              : 'This run is still in progress — the result appears here once it finishes.'}
        </p>
      )}
    </div>
  );
}

/** `identifier` is `break-all`: a 24-character hex ObjectId offers CSS no break
 *  opportunity at all, so `break-words` alone leaves it overflowing. */
function Field({
  label,
  value,
  identifier = false,
}: {
  label: string;
  value: React.ReactNode;
  identifier?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-text-subtle">
        {label}
      </p>
      <p
        className={
          identifier
            ? 'min-w-0 break-all font-mono text-text'
            : 'min-w-0 break-words text-text'
        }
      >
        {value}
      </p>
    </div>
  );
}
