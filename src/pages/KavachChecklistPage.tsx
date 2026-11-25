import { ArchiveRestore, Archive, Pencil, Plus } from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Callout,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@/components/ui';
import { TaskEditorDrawer } from '@/features/kavach/TaskEditorDrawer';
import { TaskFacts, TaskTags } from '@/features/kavach/TaskRowLine';
import {
  useCreateKavachTask,
  useKavachTasksQuery,
  useRetireKavachTask,
  useUpdateKavachTask,
} from '@/hooks/api/useKavach';
import { fieldsFromTask } from '@/lib/kavachForm';
import { GROUP_ORDER, groupLabel } from '@/lib/kavachWords';
import type { KavachGroup, KavachTaskRow } from '@dk/shared';

/**
 * The checklist every outlet shares (ADR 0057 §1). Every admin can add, change,
 * retire and bring back a point; each change is written to the activity log by
 * the server. A change moves every outlet that has not changed that point for
 * itself, so the page says how many have.
 */
export function KavachChecklistPage() {
  const toast = useToast();
  const tasksQ = useKavachTasksQuery();
  const create = useCreateKavachTask();
  const update = useUpdateKavachTask();
  const retire = useRetireKavachTask();
  const [showRetired, setShowRetired] = React.useState(false);
  const [query, setQuery] = React.useState('');
  // `null` = closed; `'new'` = adding; a row = editing it.
  const [editing, setEditing] = React.useState<KavachTaskRow | 'new' | null>(null);
  const [retiring, setRetiring] = React.useState<KavachTaskRow | null>(null);

  const all = React.useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const activeCount = all.filter((t) => t.active).length;
  const grouped = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = all.filter(
      (t) =>
        (showRetired || t.active) &&
        (!q || `${t.titleEn} ${t.titleHi} ${t.code}`.toLowerCase().includes(q)),
    );
    return GROUP_ORDER.map((g) => ({
      group: g as KavachGroup,
      rows: rows.filter((t) => t.group === g).sort((a, b) => a.sort - b.sort || a.srNo - b.srNo),
    })).filter((g) => g.rows.length > 0);
  }, [all, showRetired, query]);

  async function saveEdit(row: KavachTaskRow | 'new', fields: ReturnType<typeof fieldsFromTask>, code: string) {
    if (row === 'new') {
      await create.mutateAsync({ code, task: fields });
      toast.success('Point added.');
    } else {
      await update.mutateAsync({ code: row.code, patch: fields });
      toast.success('Saved.');
    }
    setEditing(null);
  }

  return (
    <div>
      <PageHeader
        title="Kavach checklist"
        subtitle={tasksQ.isSuccess ? `${activeCount} points, the same for every outlet` : undefined}
        actions={
          <Button leftIcon={<Plus width={16} height={16} strokeWidth={1.75} />} onClick={() => setEditing('new')}>
            Add a point
          </Button>
        }
      />

      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <Input
          type="search"
          aria-label="Find a point"
          placeholder="Find a point"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="md:max-w-xs"
        />
        <Checkbox
          label="Show retired points"
          checked={showRetired}
          onChange={(e) => setShowRetired(e.target.checked)}
        />
      </div>

      {tasksQ.isError ? (
        <Callout onRetry={() => void tasksQ.refetch()}>The checklist could not be loaded.</Callout>
      ) : tasksQ.isLoading ? (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <Card>
          <EmptyState
            title={query ? 'No point matches' : 'No points yet'}
            description={query ? 'Change the search.' : 'Add the first point of the checklist.'}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map(({ group, rows }) => (
            <section key={group} aria-labelledby={`kc-${group}`}>
              <h2 id={`kc-${group}`} className="mb-1.5 text-sm font-semibold text-text">
                {groupLabel(group)} <span className="font-normal text-text-muted">({rows.length})</span>
              </h2>
              <Card className="overflow-hidden">
                <ul>
                  {rows.map((t) => (
                    <li key={t.code} className="border-b border-border px-3 py-3 last:border-0">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-xs tabular-nums text-text-subtle">{t.srNo}</span>
                            <span className={t.active ? 'text-sm font-medium text-text' : 'text-sm font-medium text-text-muted'}>
                              {t.titleEn}
                            </span>
                            <TaskTags task={t} />
                          </div>
                          <p lang="hi" className="mt-0.5 text-sm text-text-muted">
                            {t.titleHi}
                          </p>
                          <TaskFacts task={t} />
                          {t.hiddenAt > 0 || t.overriddenAt > 0 ? (
                            <p className="mt-1.5 flex flex-wrap gap-1.5">
                              {t.hiddenAt > 0 ? <Badge intent="warning">Hidden at {t.hiddenAt}</Badge> : null}
                              {t.overriddenAt > 0 ? <Badge intent="info">Changed at {t.overriddenAt}</Badge> : null}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon={<Pencil width={14} height={14} strokeWidth={1.75} />}
                            onClick={() => setEditing(t)}
                          >
                            Edit
                          </Button>
                          {t.active ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              leftIcon={<Archive width={14} height={14} strokeWidth={1.75} />}
                              onClick={() => setRetiring(t)}
                            >
                              Retire
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={update.isPending && update.variables?.code === t.code}
                              leftIcon={<ArchiveRestore width={14} height={14} strokeWidth={1.75} />}
                              onClick={() =>
                                update.mutate(
                                  { code: t.code, patch: { active: true } },
                                  {
                                    onSuccess: () => toast.success('Point brought back.'),
                                    onError: (e) =>
                                      toast.error(e instanceof Error ? e.message : 'That did not go through.'),
                                  },
                                )
                              }
                            >
                              Restore
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}

      <TaskEditorDrawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        kind="global"
        heading={editing === 'new' ? 'Add a point' : 'Edit point'}
        description={
          editing && editing !== 'new'
            ? `Changes reach every outlet that has not changed this point for itself${
                editing.overriddenAt > 0 ? ` (${editing.overriddenAt} have)` : ''
              }.`
            : 'It reaches every outlet from the next time checks open.'
        }
        initial={editing && editing !== 'new' ? fieldsFromTask(editing) : null}
        fixedCode={editing && editing !== 'new' ? editing.code : undefined}
        onSave={(fields, code) => (editing ? saveEdit(editing, fields, code) : Promise.resolve())}
      />

      <ConfirmDialog
        open={!!retiring}
        onCancel={() => setRetiring(null)}
        title={retiring ? `Retire "${retiring.titleEn}"?` : ''}
        description="No new checks open for it at any outlet. Checks already made stay readable, and you can bring the point back."
        confirmLabel="Retire"
        confirmVariant="danger"
        loading={retire.isPending}
        onConfirm={() =>
          retiring &&
          retire.mutate(retiring.code, {
            onSuccess: () => {
              toast.success('Point retired.');
              setRetiring(null);
            },
            onError: (e) => {
              toast.error(e instanceof Error ? e.message : 'That did not go through.');
              setRetiring(null);
            },
          })
        }
      />
    </div>
  );
}
