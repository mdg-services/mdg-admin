import { Flag, FlagOff, Pause, Play } from 'lucide-react';

import { Badge, Button, InfoBadge } from '@/components/ui';
import { formatDate } from '@/lib/format';
import {
  cadenceLabel,
  EVIDENCE_LABEL,
  ITEM_STATUS_HINT,
  ITEM_STATUS_LABEL,
  itemStatusIntent,
  REQUEST_STATE_LABEL,
  requestStateIntent,
  TIER_LABEL,
  tierIntent,
  VERIFICATION_LABEL,
} from '@/lib/kavach';
import type { KavachActorKind, KavachItem } from '@dk/shared';

/**
 * One task on the dealer's Kavach panel. Standing state only — certifying a
 * task happens in the cross-dealer work queue, where an admin closes many in
 * one pass. The two controls left here are the ones that belong to this dealer's
 * SETUP: whether a task applies at all, and whether an SOS item is flagged.
 */
interface Props {
  item: KavachItem;
  busy?: boolean;
  onTogglePause: (item: KavachItem) => void;
  onToggleSos: (item: KavachItem) => void;
}

/** The dealer's relationship is with MDG, so no individual admin is ever named. */
function verifierLabel(kind?: KavachActorKind): string {
  if (kind === 'automation') return 'automation';
  if (kind === 'admin') return 'MDG team';
  return 'MDG';
}

export function KavachItemRow({ item, busy, onTogglePause, onToggleSos }: Props) {
  const isSos = item.trigger === 'SOS';
  const sosFlagged = item.status === 'SOS_FLAGGED';
  const requestLive = item.request.state !== 'NONE';

  return (
    <div className="flex flex-col gap-2 border-t border-border px-4 py-3 first:border-t-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-text">{item.labelEn}</span>
          {item.custom ? (
            <Badge intent="info" className="h-5 text-[11px]">
              dealer-only
            </Badge>
          ) : null}
          {item.overridden ? (
            <Badge intent="info" className="h-5 text-[11px]">
              overridden
            </Badge>
          ) : null}
          {item.paused ? (
            <Badge intent="neutral" className="h-5 text-[11px]">
              paused
            </Badge>
          ) : (
            // What "Held" or "Never checked" actually means used to live only
            // in a `title`, and a phone has no hover. `InfoBadge` keeps the
            // desktop tooltip and gives touch a tappable badge that opens a
            // sheet with the same sentence.
            <InfoBadge
              intent={itemStatusIntent(item.status)}
              label={ITEM_STATUS_LABEL[item.status]}
              detail={ITEM_STATUS_HINT[item.status]}
              // `badgeClassName`, not `className`: the latter lands on the pill
              // at md and on the wrapping BUTTON below it, so the same string
              // means two different things at two widths. Only the `md:` half
              // ever did anything — `Badge`'s own `h-[22px]` and `text-xs` are
              // emitted after `.h-5` and `.text-[11px]`, so an unprefixed
              // override of either loses (see MOBILE.md, "dead overrides").
              badgeClassName="md:h-5"
            />
          )}
          {requestLive ? (
            <Badge
              intent={requestStateIntent(item.request.state)}
              className="h-5 text-[11px]"
            >
              {REQUEST_STATE_LABEL[item.request.state]}
            </Badge>
          ) : null}
        </div>
        {/* The Hindi line is what the DEALER sees for this task, and on a phone
            there is no second place to read it and no expand — so it wraps
            below md and keeps the desktop table's single line at md. */}
        <p className="mt-0.5 break-words text-xs text-text-muted md:truncate">
          {item.labelHi}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-subtle">
          <span>{item.points} pts</span>
          <Badge intent={tierIntent(item.tier)} className="h-5 text-[11px]">
            {TIER_LABEL[item.tier]}
          </Badge>
          <span>{cadenceLabel(item.cadenceDays)}</span>
          <span>
            {VERIFICATION_LABEL[item.verification]}
            {item.evidence === 'NONE' ? '' : ` · ${EVIDENCE_LABEL[item.evidence]}`}
          </span>
          {/* Never verified is an absence, not a blank: say so rather than
              leaving the line off and letting it read as "fine". */}
          {item.lastVerifiedAt ? (
            <span>
              checked by {verifierLabel(item.lastVerifiedByKind)}{' '}
              {formatDate(item.lastVerifiedAt)}
            </span>
          ) : (
            <span>never checked</span>
          )}
          {item.expiresAt ? <span>expires {formatDate(item.expiresAt)}</span> : null}
          {item.status === 'HELD' && item.holdUntil ? (
            <span>held until {formatDate(item.holdUntil)}</span>
          ) : null}
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
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          className="min-w-11 md:min-w-0"
          disabled={busy}
          onClick={() => onTogglePause(item)}
          aria-label={item.paused ? 'Resume' : 'Pause'}
          title={
            item.paused
              ? 'Resume (count toward the score)'
              : 'Pause (exclude from the score and the work queue)'
          }
        >
          {/* The word rides beside the glyph below md. The `title` above is the
              desktop tooltip and nothing else — touch never fires it — so on a
              phone this control was a bare ⏸ with no label anywhere. */}
          {item.paused ? (
            <Play width={14} height={14} strokeWidth={1.75} />
          ) : (
            <Pause width={14} height={14} strokeWidth={1.75} />
          )}
          <span className="ml-1.5 md:hidden">
            {item.paused ? 'Resume' : 'Pause'}
          </span>
        </Button>
      </div>
    </div>
  );
}
