import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import {
  Badge,
  Button,
  Callout,
  Card,
  ConfirmDialog,
  Skeleton,
  useToast,
} from '@/components/ui';
import { KavachSwitch, PctRing } from '@/features/kavach/KavachSwitch';
import { TaskEditorDrawer } from '@/features/kavach/TaskEditorDrawer';
import { TaskFacts, TaskTags } from '@/features/kavach/TaskRowLine';
import {
  type OutletListInput,
  useKavachOutletQuery,
  useKavachTasksQuery,
  useSaveKavachOutletList,
  useSetKavachOutletOn,
} from '@/hooks/api/useKavach';
import {
  bodyFromFields,
  diffOverride,
  fieldsFromTask,
  withHidden,
  withOverride,
} from '@/lib/kavachForm';
import {
  canReview,
  dueWords,
  groupLabel,
  sortOutletChecks,
  stateIntent,
  stateLabel,
  waitWords,
} from '@/lib/kavachWords';
import type { Dealer, KavachCheckRow, KavachOutletDetail, KavachTaskDef } from '@dk/shared';

type Editing =
  | { kind: 'override'; task: KavachTaskDef }
  | { kind: 'own'; task: KavachTaskDef | null }
  | null;

/**
 * One outlet's Kavach: the switch and the score, its checks right now (a sent
 * one opens in the review run, scoped to this outlet), and its own version of
 * the checklist — hide a shared point, change it for this outlet, add its own.
 */
export function DealerKavachTab({ dealer }: { dealer: Dealer }) {
  const toast = useToast();
  const detailQ = useKavachOutletQuery(dealer.id);
  const sharedQ = useKavachTasksQuery();
  const setOn = useSetKavachOutletOn();
  const save = useSaveKavachOutletList(dealer.id);
  const [editing, setEditing] = React.useState<Editing>(null);
  const [removing, setRemoving] = React.useState<KavachTaskDef | null>(null);
  const [offOpen, setOffOpen] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const detail = detailQ.data;
  const back = encodeURIComponent(`/dealers/${dealer.id}?tab=kavach`);
  const runLink = (checkId?: string) =>
    `/kavach/review?dealerId=${encodeURIComponent(dealer.id)}${checkId ? `&check=${encodeURIComponent(checkId)}` : ''}&back=${back}`;

  if (detailQ.isError) {
    return <Callout onRetry={() => void detailQ.refetch()}>Kavach for this outlet could not be loaded.</Callout>;
  }
  if (!detail) {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  function listInput(over: Partial<OutletListInput>): OutletListInput {
    const d = detail as KavachOutletDetail;
    return {
      hiddenCodes: d.hiddenCodes,
      customTasks: d.customTasks.map((t) => ({ ...bodyFromFields(fieldsFromTask(t)), code: t.code })),
      overrides: d.overrides,
      ...over,
    };
  }

  async function saveList(over: Partial<OutletListInput>, done: string) {
    await save.mutateAsync(listInput(over));
    toast.success(done);
  }

  const shared = sharedQ.data ?? [];
  const sharedOf = (code: string) => shared.find((t) => t.code === code) ?? null;

  const summary = detail.summary;
  const counts = summary?.counts;
  const checks = sortOutletChecks(detail.checks);

  return (
    <div className="flex flex-col gap-5">
      {/* ── Switch and score ── */}
      <Card className="p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <KavachSwitch
            on={detail.on}
            busy={setOn.isPending}
            label={`Kavach for ${dealer.code}`}
            onChange={(next) =>
              next
                ? setOn.mutate(
                    { dealerId: dealer.id, on: true },
                    {
                      onSuccess: () => toast.success('Kavach is on for this outlet.'),
                      onError: (e) => toast.error(e instanceof Error ? e.message : 'That did not go through.'),
                    },
                  )
                : setOffOpen(true)
            }
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">Kavach is {detail.on ? 'on' : 'off'}</p>
            <p className="text-xs text-text-muted">
              {detail.on
                ? detail.onSince
                  ? `Running since ${new Date(detail.onSince).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : 'Running'
                : 'No checks open and the app has no Kavach tab.'}
            </p>
          </div>
          {detail.on && summary ? (
            <div className="flex items-center gap-3 md:ml-auto">
              <PctRing pct={summary.pct} size={48} />
              <p className="text-sm text-text">
                <span className="font-semibold tabular-nums">{summary.pct}%</span> done
                <span className="block text-xs text-text-muted">
                  {summary.donePoints} of {summary.totalPoints} points
                </span>
              </p>
            </div>
          ) : null}
        </div>
        {detail.on && counts ? (
          <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm sm:grid-cols-5">
            <Count label="Done" value={counts.done} />
            <Count label="With MDG" value={counts.sent} />
            <Count label="To do" value={counts.todo} />
            <Count label="Late" value={counts.late} danger />
            <Count label="Sent back" value={counts.sentBack} />
          </dl>
        ) : null}
      </Card>

      {/* ── Checks right now ── */}
      <section aria-labelledby="dk-checks">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <h2 id="dk-checks" className="text-sm font-semibold text-text">
            Checks now
          </h2>
          {detail.waitingReview > 0 ? (
            <Link
              to={runLink()}
              className="inline-flex min-h-11 items-center rounded-md bg-brand px-3 text-sm font-medium text-text-inverse hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-8"
            >
              Check {detail.waitingReview} waiting
            </Link>
          ) : null}
        </div>
        {checks.length === 0 ? (
          <Card className="p-4 text-sm text-text-muted">
            {detail.on ? 'No checks are open yet. They open by themselves.' : 'Turn Kavach on to open checks.'}
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul>
              {checks.map((c) => (
                <CheckLine key={c.id} row={c} now={now} href={canReview(c) ? runLink(c.id) : null} />
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* ── This outlet's list ── */}
      <section aria-labelledby="dk-list">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="dk-list" className="text-sm font-semibold text-text">
              This outlet&apos;s list
            </h2>
            <p className="text-xs text-text-muted">
              The shared checklist, with what is different here. Hide a point, change it, or add one only this
              outlet has.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Plus width={14} height={14} strokeWidth={1.75} />}
            onClick={() => setEditing({ kind: 'own', task: null })}
          >
            Add own point
          </Button>
        </div>
        <Card className="overflow-hidden">
          <ul>
            {detail.tasks.map((t) => (
              <li key={t.code} className="border-b border-border px-3 py-3 last:border-0">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium text-text">{t.titleEn}</span>
                      <Badge>{groupLabel(t.group)}</Badge>
                      {t.own ? <Badge intent="info">Only this outlet</Badge> : null}
                      {t.overridden ? <Badge intent="warning">Changed here</Badge> : null}
                      <TaskTags task={t} />
                    </div>
                    <TaskFacts task={t} />
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<Pencil width={14} height={14} strokeWidth={1.75} />}
                      disabled={!t.own && !sharedOf(t.code)}
                      onClick={() => setEditing(t.own ? { kind: 'own', task: t } : { kind: 'override', task: t })}
                    >
                      {t.own ? 'Edit' : 'Change here'}
                    </Button>
                    {t.own ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={<Trash2 width={14} height={14} strokeWidth={1.75} />}
                        onClick={() => setRemoving(t)}
                      >
                        Remove
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={<EyeOff width={14} height={14} strokeWidth={1.75} />}
                        loading={save.isPending}
                        onClick={() =>
                          void saveList(
                            { hiddenCodes: withHidden(detail.hiddenCodes, t.code, true) },
                            'Hidden for this outlet.',
                          ).catch((e) => toast.error(e instanceof Error ? e.message : 'That did not go through.'))
                        }
                      >
                        Hide
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {detail.hiddenTasks.length > 0 ? (
          <div className="mt-3">
            <h3 className="mb-1.5 text-sm font-semibold text-text">Hidden for this outlet</h3>
            <Card className="overflow-hidden">
              <ul>
                {detail.hiddenTasks.map((t) => (
                  <li
                    key={t.code}
                    className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 last:border-0"
                  >
                    <span className="min-w-0 break-words text-sm text-text-muted">{t.titleEn}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<Eye width={14} height={14} strokeWidth={1.75} />}
                      loading={save.isPending}
                      onClick={() =>
                        void saveList(
                          { hiddenCodes: withHidden(detail.hiddenCodes, t.code, false) },
                          'Shown again.',
                        ).catch((e) => toast.error(e instanceof Error ? e.message : 'That did not go through.'))
                      }
                    >
                      Show again
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ) : null}
      </section>

      <TaskEditorDrawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        kind={editing?.kind ?? 'own'}
        heading={
          editing?.kind === 'override'
            ? 'Change this point for this outlet'
            : editing?.task
              ? 'Edit this outlet’s point'
              : 'Add a point for this outlet'
        }
        description={editing?.task ? editing.task.titleEn : undefined}
        initial={editing?.task ? fieldsFromTask(editing.task) : null}
        fixedCode={editing?.task?.code}
        extraAction={
          editing?.kind === 'override' && editing.task.overridden ? (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={() => {
                const code = editing.task.code;
                void saveList(
                  { overrides: withOverride(detail.overrides, code, null) },
                  'Back to the shared setting.',
                )
                  .then(() => setEditing(null))
                  .catch((e) => toast.error(e instanceof Error ? e.message : 'That did not go through.'));
              }}
            >
              Use the shared setting
            </Button>
          ) : undefined
        }
        onSave={async (fields, code) => {
          if (!editing) return;
          if (editing.kind === 'override') {
            const base = sharedOf(editing.task.code);
            if (!base) throw new Error('The shared point could not be found.');
            const diff = diffOverride(base, fields);
            await saveList(
              { overrides: withOverride(detail.overrides, base.code, diff) },
              diff ? 'Changed for this outlet.' : 'Same as the shared setting.',
            );
          } else {
            const body = { ...fields, ...(editing.task ? { code: editing.task.code } : {}) };
            const rest = listInput({}).customTasks.filter((t) => t.code !== editing.task?.code);
            await saveList({ customTasks: [...rest, body] }, editing.task ? 'Saved.' : 'Point added.');
            void code;
          }
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={!!removing}
        onCancel={() => setRemoving(null)}
        title={removing ? `Remove "${removing.titleEn}"?` : ''}
        description="It is taken off this outlet's list. Checks already made stay readable."
        confirmLabel="Remove"
        confirmVariant="danger"
        loading={save.isPending}
        onConfirm={() => {
          const code = removing?.code;
          if (!code) return;
          void saveList(
            { customTasks: listInput({}).customTasks.filter((t) => t.code !== code) },
            'Point removed.',
          )
            .catch((e) => toast.error(e instanceof Error ? e.message : 'That did not go through.'))
            .finally(() => setRemoving(null));
        }}
      />

      <ConfirmDialog
        open={offOpen}
        onCancel={() => setOffOpen(false)}
        title={`Turn Kavach off for ${dealer.code}?`}
        description="New checks stop opening, the Kavach tab goes from their app and the pushes stop. What was already sent stays here."
        confirmLabel="Turn off"
        confirmVariant="danger"
        loading={setOn.isPending}
        onConfirm={() =>
          setOn.mutate(
            { dealerId: dealer.id, on: false },
            {
              onSuccess: () => toast.success('Kavach is off for this outlet.'),
              onError: (e) => toast.error(e instanceof Error ? e.message : 'That did not go through.'),
              onSettled: () => setOffOpen(false),
            },
          )
        }
      />
    </div>
  );
}

function Count({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${danger && value > 0 ? 'text-danger-strong' : 'text-text'}`}>
        {value}
      </dd>
    </div>
  );
}

function CheckLine({ row, now, href }: { row: KavachCheckRow; now: number; href: string | null }) {
  const extra =
    row.state === 'sent'
      ? waitWords(row.submittedAt, now)
      : row.state === 'todo' || row.state === 'sent_back'
        ? dueWords(row.dueAt, row.late, now)
        : '';
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-medium text-text">{row.title}</span>
        <span className="block text-xs text-text-muted">
          {row.periodLabel}
          {extra ? ` · ${extra}` : ''}
        </span>
      </span>
      <Badge intent={stateIntent(row.state, row.late)}>{stateLabel(row.state, row.late)}</Badge>
    </>
  );
  const cls = 'flex min-h-14 items-center gap-3 border-b border-border px-3 py-2 last:border-0';
  return (
    <li>
      {href ? (
        <Link
          to={href}
          className={`${cls} hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring`}
        >
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}
