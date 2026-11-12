import { MessageSquarePlus, RotateCcw, Trash2 } from 'lucide-react';

import { Badge, Button } from '@/components/ui';
import type { DeclarationsAdminView } from '@dk/shared';

import {
  reusedPhotosLabel,
  washroomGates,
  washroomLine,
  washroomStateView,
  type PaneControls,
} from './format';
import { GateNotes } from './KindCard';
import { WashroomPhotos } from './Photos';

/**
 * The washroom's weekly cycle, drawn inside its card: where it stands in words,
 * this week's two photos as thumbnails, and the three buttons that move the
 * cycle. A button that cannot apply is off and says why under the row.
 */
export function WashroomPanel({
  view,
  controls,
}: {
  view: DeclarationsAdminView;
  controls: PaneControls;
}) {
  const { runBusy, requestBusy, pendingKey, now, onAct } = controls;
  const cycle = view.washroom;
  const state = washroomStateView(cycle.state);
  const gates = washroomGates(view, now);
  const reused = reusedPhotosLabel(cycle.photos);

  return (
    <div className="grid gap-3 rounded-md border border-border bg-surface-2/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-text">This week’s photos</p>
        <Badge intent={state.intent}>{state.label}</Badge>
      </div>
      <p className="break-words text-sm text-text-muted">{washroomLine(view, now)}</p>
      <WashroomPhotos photos={cycle.photos} />
      {reused ? (
        <p data-reused-photos className="text-xs text-text-subtle">
          {reused}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={requestBusy || !gates.ask.ok}
          loading={pendingKey === 'ask_washroom'}
          leftIcon={<MessageSquarePlus width={14} height={14} strokeWidth={1.75} />}
          onClick={() => onAct({ action: 'ask_washroom' })}
        >
          Ask owner for photos
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={runBusy || !gates.retry.ok}
          loading={pendingKey === 'retry_washroom'}
          leftIcon={<RotateCcw width={14} height={14} strokeWidth={1.75} />}
          onClick={() => onAct({ action: 'retry_washroom' })}
        >
          Retry
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={requestBusy || !gates.drop.ok}
          loading={pendingKey === 'drop_washroom'}
          leftIcon={<Trash2 width={14} height={14} strokeWidth={1.75} />}
          onClick={() => onAct({ action: 'drop_washroom' })}
        >
          Drop photos
        </Button>
      </div>
      <GateNotes
        notes={[
          { label: 'Ask owner for photos', gate: gates.ask },
          { label: 'Retry', gate: gates.retry },
          { label: 'Drop photos', gate: gates.drop },
        ]}
      />
    </div>
  );
}
