import { ClipboardCheck, Flag, FlagOff, Pause, Play } from 'lucide-react';

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
 * One task on the dealer's Kavach panel.
 *
 * Verify is here as well as in the cross-dealer queue, and the two are not
 * redundant. The queue is for working through many tasks in one pass; this is
 * the door for the one task an admin is already looking at, on the dealer they
 * are already on — being sent to another screen to close a task in front of you
 * is the kind of friction that gets a screen quietly abandoned.
 *
 * Both open the SAME drawer, so the evidence rules, the business date and the
 * send-back wording exist once.
 */
interface Props {
  item: KavachItem;
  busy?: boolean;
  onTogglePause: (item: KavachItem) => void;
  onToggleSos: (item: KavachItem) => void;
  /** Opens the shared verify drawer on this task. */
  onVerify: (item: KavachItem) => void;
}

/** The dealer's relationship is with MDG, so no individual admin is ever named. */
function verifierLabel(kind?: KavachActorKind): string {
  if (kind === 'automation') return 'automation';
  if (kind === 'admin') return 'MDG team';
  return 'MDG';
}

export function KavachItemRow({ item, busy, onTogglePause, onToggleSos, onVerify }: Props) {
  const isSos = item.trigger === 'SOS';
  const sosFlagged = item.status === 'SOS_FLAGGED';
  const requestLive = item.request.state !== 'NONE';
  // The status pill above already reads "Never checked" whenever this is true,
  // so the meta line below would print the same two words a second time on the
  // same row. A PAUSED task shows the "paused" pill instead of its status, and
  // there this line is the only place the absence is stated, so it stays.
  const statusSaysNeverChecked = !item.paused && item.status === 'NOT_YET_VERIFIED';

  return (
    // `px-3` below md: this row is already inside the page gutter and a card
    // border, so a 16px inset here is the third helping of the same padding and
    // puts a bilingual task label 29px from the edge of a 360px screen.
    <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5 first:border-t-0 md:flex-row md:items-center md:justify-between md:px-4 md:py-3">
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
          {/* Below md this line keeps only what changes a decision. Eight items
              at `text-xs` in ~290px of row wrapped to four or five lines, so one
              task stood 150px tall before its Verify button — and the expiry and
              hold dates are both restatements of the status badge already above.
              Who did the checking is an audit detail, not a decision. Desktop
              keeps every word. */}
          {item.lastVerifiedAt ? (
            <span>
              checked
              <span className="hidden md:inline">
                {' '}
                by {verifierLabel(item.lastVerifiedByKind)}
              </span>{' '}
              {formatDate(item.lastVerifiedAt)}
            </span>
          ) : (
            <span className={statusSaysNeverChecked ? 'hidden md:inline' : undefined}>
              never checked
            </span>
          )}
          {item.expiresAt ? (
            <span className="hidden md:inline">
              expires {formatDate(item.expiresAt)}
            </span>
          ) : null}
          {item.status === 'HELD' && item.holdUntil ? (
            <span className="hidden md:inline">
              held until {formatDate(item.holdUntil)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {/* An SOS task has no clock and is closed by flagging, not verifying;
            a paused one is out of scope entirely and the API refuses it. */}
        {!isSos && !item.paused ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => onVerify(item)}
            leftIcon={<ClipboardCheck width={14} height={14} strokeWidth={1.75} />}
          >
            Verify
          </Button>
        ) : null}
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

        {/* The glyph goes through `leftIcon`, not in with the label.
            `Button` wraps its children in ONE span, so an icon and a word passed
            together are two inline boxes inside a single flex item: the item
            sizes to min-content, the row squeezes it, and the word drops under
            the glyph — which is how this button came to render with "Pause"
            hanging below its own icon on forty rows. `leftIcon` is a flex item
            of its own beside the label, and the button's `whitespace-nowrap`
            then actually governs the pair.

            The word matters on a phone: `title` is a desktop tooltip that touch
            never fires, so without it the control is a bare glyph with no label
            anywhere. `md:sr-only` keeps the desktop icon-only look. */}
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onTogglePause(item)}
          aria-label={item.paused ? 'Resume' : 'Pause'}
          title={
            item.paused
              ? 'Resume (count toward the score)'
              : 'Pause (exclude from the score and the work queue)'
          }
          leftIcon={
            item.paused ? (
              <Play width={14} height={14} strokeWidth={1.75} />
            ) : (
              <Pause width={14} height={14} strokeWidth={1.75} />
            )
          }
        >
          <span className="md:sr-only">
            {item.paused ? 'Resume' : 'Pause'}
          </span>
        </Button>
      </div>
    </div>
  );
}
