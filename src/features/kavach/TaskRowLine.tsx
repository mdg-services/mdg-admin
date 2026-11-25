import * as React from 'react';

import { Badge } from '@/components/ui';
import { everyWords, howLabel, panelLabel, sheetLabel, sourceLabel, uploaderLabel } from '@/lib/kavachWords';
import type { KavachTaskDef } from '@dk/shared';

/** What a point is made of, in a few short facts: shared by the checklist and the dealer's list. */
export function TaskFacts({ task }: { task: KavachTaskDef }) {
  const how =
    task.how === 'data' && task.source
      ? `${howLabel('data')}: ${sourceLabel(task.source)}`
      : task.how === 'sheet' && task.sheet
        ? `${howLabel('sheet')}: ${sheetLabel(task.sheet)}`
        : howLabel(task.how);
  return (
    <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
      <Fact label="Points" value={String(task.points)} />
      <Fact
        label="How often"
        value={everyWords(task.everyDays) + (task.dueTime ? `, due ${task.dueTime}` : '')}
      />
      <Fact label="Proof" value={how} />
      {task.how !== 'data' ? <Fact label="Sent by" value={uploaderLabel(task.uploader)} /> : null}
      {task.panels.length > 0 ? (
        <Fact label="Reviewer sees" value={task.panels.map(panelLabel).join(', ')} />
      ) : null}
    </dl>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-1">
      <dt className="text-text-subtle">{label}:</dt>
      <dd className="min-w-0 break-words text-text">{value}</dd>
    </div>
  );
}

export function TaskTags({ task }: { task: KavachTaskDef }) {
  return (
    <>
      {task.iocOnly ? <Badge>IndianOil only</Badge> : null}
      {task.acceptsFile ? <Badge>PDF ok</Badge> : null}
      {!task.active ? <Badge intent="neutral">Retired</Badge> : null}
    </>
  );
}
