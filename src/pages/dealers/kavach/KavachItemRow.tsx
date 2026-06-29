import {
  ArrowUpRight,
  Check,
  Flag,
  FlagOff,
  Pause,
  Play,
  Trash2,
} from 'lucide-react';

import { Badge, Button } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ITEM_STATUS_LABEL, itemStatusIntent, TIER_LABEL, tierIntent } from '@/lib/kavach';
import type { KavachItem } from '@dk/shared';

interface Props {
  item: KavachItem;
  busy?: boolean;
  onMarkDone: (item: KavachItem) => void;
  onTogglePause: (item: KavachItem) => void;
  onToggleSos: (item: KavachItem) => void;
  onEscalate: (item: KavachItem) => void;
  onDelete: (item: KavachItem) => void;
}

export function KavachItemRow({
  item,
  busy,
  onMarkDone,
  onTogglePause,
  onToggleSos,
  onEscalate,
  onDelete,
}: Props) {
  const isSos = item.trigger === 'SOS';
  const sosFlagged = item.status === 'SOS_FLAGGED';

  return (
    <div className="flex flex-col gap-2 border-t border-border px-4 py-3 first:border-t-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-text">{item.labelEn}</span>
          {item.custom ? (
            <Badge intent="info" className="h-5 text-[11px]">
              custom
            </Badge>
          ) : null}
          {item.paused ? (
            <Badge intent="neutral" className="h-5 text-[11px]">
              paused
            </Badge>
          ) : (
            <Badge intent={itemStatusIntent(item.status)} className="h-5 text-[11px]">
              {ITEM_STATUS_LABEL[item.status]}
            </Badge>
          )}
          {item.escalation.escalated ? (
            <Badge intent="danger" className="h-5 gap-1 text-[11px]">
              <ArrowUpRight width={11} height={11} strokeWidth={2} />
              escalated
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-text-muted">{item.labelHi}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-subtle">
          <span>{item.points} pts</span>
          <Badge intent={tierIntent(item.tier)} className="h-5 text-[11px]">
            {TIER_LABEL[item.tier]}
          </Badge>
          {item.cadenceDays != null ? <span>{item.cadenceDays}d cadence</span> : null}
          {item.lastDoneAt ? <span>last done {formatDate(item.lastDoneAt)}</span> : null}
          {item.expiresAt ? <span>expires {formatDate(item.expiresAt)}</span> : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {isSos ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => onToggleSos(item)}
            leftIcon={
              sosFlagged ? (
                <FlagOff width={14} height={14} strokeWidth={1.75} />
              ) : (
                <Flag width={14} height={14} strokeWidth={1.75} />
              )
            }
          >
            {sosFlagged ? 'Clear flag' : 'Flag SOS'}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || item.paused}
            onClick={() => onMarkDone(item)}
            leftIcon={<Check width={14} height={14} strokeWidth={1.75} />}
          >
            Mark done
          </Button>
        )}

        {!isSos ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || item.paused || item.escalation.escalated}
            onClick={() => onEscalate(item)}
            aria-label="Escalate to inbox"
            title="Escalate to admin inbox"
          >
            <ArrowUpRight width={14} height={14} strokeWidth={1.75} />
          </Button>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onTogglePause(item)}
          aria-label={item.paused ? 'Resume' : 'Pause'}
          title={item.paused ? 'Resume (count toward score)' : 'Pause (exclude from score)'}
        >
          {item.paused ? (
            <Play width={14} height={14} strokeWidth={1.75} />
          ) : (
            <Pause width={14} height={14} strokeWidth={1.75} />
          )}
        </Button>

        {item.custom ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onDelete(item)}
            aria-label="Delete custom item"
            title="Delete custom item"
          >
            <Trash2 width={14} height={14} strokeWidth={1.75} className="text-danger" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
