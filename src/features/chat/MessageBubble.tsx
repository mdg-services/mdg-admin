import { Check, CheckCheck, CheckCircle2, ChevronDown, Clock, Zap } from 'lucide-react';
import * as React from 'react';

import { requestLabel } from '@/lib/chatAsk';
import { cn } from '@/lib/cn';
import { linkify } from '@/lib/linkify';
import { useLongPress } from '@/lib/useLongPress';
import type { DealerOpenRequest, Message, MessageReaction } from '@dk/shared';

import { BubbleAttachments, splitAttachments } from './AttachmentPreview';
import {
  AskFooterPreview,
  AskHeader,
  DealerViewContext,
  PortalLoginPreview,
  SetupCardPreview,
  isRetiredSetupCard,
  setupCardHasBody,
  type AskPreviewPhase,
} from './DealerCards';
import { bubbleTime, dealerWord } from './dealerView';
import { replyPreviewText, replySenderLabel } from './replyPreview';

interface MessageBubbleProps {
  message: Message;
  currentUserId: string;
  /**
   * First bubble of a run from one sender (MessageList decides): it gets the
   * tail and, where names are shown, the sender's name.
   */
  first?: boolean;
  /** True while the action menu is open for THIS message (chevron = toggle). */
  isMenuOpen?: boolean;
  /** Opens the message action menu at a viewport point. */
  onOpenMenu?: (message: Message, anchor: { x: number; y: number }) => void;
  /** Scrolls to (and flashes) the quoted original. */
  onJumpTo?: (messageId: string) => void;
  /** Opens the who-reacted dialog. */
  onOpenReactions?: (message: Message) => void;
  /**
   * The request this dealer message answered, while it waits for MDG to check it
   * (ADR 0019). Drawn as an "Answer to…" chip under the message. Handed in by the
   * thread, which reads the dealer's requests once — a bubble is memoised and
   * must not fetch.
   */
  pendingAnswer?: DealerOpenRequest;
  /** What the dealer sees under a request MDG posted — its buttons, or "Sent". */
  askPhase?: AskPreviewPhase;
  /** Opens "Mark received" for this message — the chip's one tap. */
  onOpenAnswer?: (message: Message) => void;
}

/** WhatsApp-style delivery state of an MDG message: clock, ✓ sent, ✓✓ delivered, blue ✓✓ read. */
function MessageTicks({ message }: { message: Message }) {
  if (message.id.startsWith('tmp-')) {
    return <Clock width={12} strokeWidth={2} className="opacity-80" />;
  }
  const seen = (message.readBy ?? []).some((id) => id && id !== message.senderId);
  if (seen) {
    return (
      <CheckCheck width={15} strokeWidth={2} className="text-wa-tick-read" aria-label="Read" />
    );
  }
  const delivered = (message.deliveredTo ?? []).some((id) => id && id !== message.senderId);
  if (delivered) return <CheckCheck width={15} strokeWidth={2} aria-label="Delivered" />;
  return <Check width={15} strokeWidth={2} aria-label="Sent" />;
}

/** Stable display hue for a sender's name, from their user id (the app's own formula). */
function senderHue(senderId: string): number {
  let h = 0;
  for (let i = 0; i < senderId.length; i += 1) h = (h * 31 + senderId.charCodeAt(i)) % 360;
  return h;
}

/**
 * The little wedge on the first bubble of a run, hanging off its top corner —
 * on the side the bubble sits. Drawn in the bubble's own colour.
 */
function Tail({ right, tone }: { right: boolean; tone: 'in' | 'out' }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 8 10"
      width={8}
      height={10}
      className={cn(
        'pointer-events-none absolute top-0 fill-current',
        right ? '-right-[7px] scale-x-[-1]' : '-left-[7px]',
        tone === 'in' ? 'text-wa-in' : 'text-wa-out',
      )}
    >
      <path d="M8 0H0q5 .5 8 10z" />
    </svg>
  );
}

/** Group reactions into per-emoji chips, first-seen order, own flagged. */
function groupReactions(
  reactions: MessageReaction[],
  currentUserId: string,
): Array<{ emoji: string; count: number; mine: boolean }> {
  const order: string[] = [];
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of reactions) {
    let g = map.get(r.emoji);
    if (!g) {
      g = { emoji: r.emoji, count: 0, mine: false };
      map.set(r.emoji, g);
      order.push(r.emoji);
    }
    g.count += 1;
    if (r.userId === currentUserId) g.mine = true;
  }
  return order.map((e) => map.get(e)!);
}

/**
 * One message, drawn the way the dealer's app draws it
 * (`mdg-client/src/features/chat/MessageBubble.tsx`), so the inbox shows what the
 * dealer sees: the same bubbles and colours, the time inside the bubble, pictures
 * and videos filling it, and under MDG's messages the request buttons, login box
 * and setup cards the dealer is shown.
 *
 * SIDES. The inbox is a shared surface: everything MDG says — a teammate's reply,
 * mine, or an automatic notice — sits on the right, the dealer on the left, so a
 * thread reads "the team" against "the client". The COLOURS are the dealer's: MDG
 * white, the dealer warm grey, exactly as on their phone.
 *
 * NOTICES (`system: true`) are drawn as ordinary MDG bubbles — the dealer's app has
 * drawn them that way since ADR 0018. They carry no ticks and no menu: an admin
 * does not reply to a notice from here. A dealer's reaction to one is shown, and
 * opens the who-reacted list like any other.
 *
 * What only the admin needs — a teammate's name on their bubble, the "Answer to…
 * mark received" chip, a voice note's transcript, the action menu — is added on
 * top, kept small.
 */
export const MessageBubble = React.memo(function MessageBubble({
  message,
  currentUserId,
  first = true,
  isMenuOpen,
  onOpenMenu,
  onJumpTo,
  onOpenReactions,
  pendingAnswer,
  askPhase = 'none',
  onOpenAnswer,
}: MessageBubbleProps) {
  const view = React.useContext(DealerViewContext);
  const { lang } = view;

  // Touch path into the same menu the hover chevron / right-click opens.
  // Hooks run before any early return to keep their order stable.
  const openMenuAtPoint = React.useCallback(
    (point: { x: number; y: number }) => onOpenMenu?.(message, point),
    [message, onOpenMenu],
  );
  const system = !!message.system;
  const menuEnabled = !!onOpenMenu && !system;
  const longPress = useLongPress(openMenuAtPoint);

  // Chevron toggle: the menu closes itself on any outside pointerdown —
  // including one on the chevron — before this button's click fires. Capture
  // whether the menu was open at pointerdown (same event dispatch, so the
  // prop is still the pre-close value) and have the click only reopen when it
  // was not.
  const menuWasOpenRef = React.useRef(false);

  // The retired services question: the app draws nothing for it, so neither do we.
  if (isRetiredSetupCard(message)) return null;

  const mdgSide = system || message.senderRole === 'admin';
  const own = message.senderId === currentUserId;
  const tone: 'in' | 'out' = mdgSide ? 'in' : 'out';

  const { images, voices, videos, docs } = splitAttachments(message.attachments);
  const hasBody = !!message.body;
  const hasMedia = images.length > 0;
  const hasOther = voices.length > 0 || videos.length > 0 || docs.length > 0;
  // A picture with no caption carries its time ON the picture.
  const timeOnPicture = hasMedia && !hasBody && !hasOther;

  const ask = message.ask;
  const portalLogin = message.portalLogin;
  const setupCard = message.setupCard;
  const hasSetupBody = !!setupCard && setupCardHasBody(setupCard.card);
  // A request, a login box, a setup card or a video is as wide as a picture, as in the app.
  const wide = hasMedia || videos.length > 0 || !!ask || !!portalLogin || hasSetupBody;

  // "Instant reply" under a machine-written answer — the dealer sees it; never on a handoff.
  const showAiBadge = !!message.ai && message.ai.kind !== 'handoff';

  // Where the time goes: inside the text's last line when there is text; on the
  // picture when it is a bare picture; on a line of its own when the bubble ends
  // in something with no last line of text (a voice note, a document, a card).
  const metaInFlow =
    !timeOnPicture && (showAiBadge || !hasBody || !!ask || !!portalLogin || hasSetupBody);
  // Ticks on MY messages only. Every admin who opens a thread is stamped into
  // readBy/deliveredTo, so on a teammate's reply (or the first line's) blue
  // ticks would only mean "an admin looked", never that the dealer read it.
  const ticks = own && !system;

  const meta = (overlay: boolean) => (
    <span
      className={cn(
        'flex items-center gap-1 whitespace-nowrap text-[11px] leading-none',
        overlay ? 'text-white' : 'text-wa-meta',
      )}
    >
      <span>{bubbleTime(message.createdAt, lang)}</span>
      {ticks ? <MessageTicks message={message} /> : null}
    </span>
  );

  // Names: a teammate's (not mine) and "MDG" on a notice, so an admin can tell
  // who said what on the team's side; the dealer member's in a group thread.
  const senderLabel = system ? dealerWord(lang, 'senderMdg') : message.senderName;
  const showName = first && !!senderLabel && (mdgSide ? !own : view.group);

  const replyTo = message.replyTo;
  const reactions = message.reactions ?? [];

  return (
    <div className={cn('flex w-full flex-col', mdgSide ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'flex flex-col',
          mdgSide ? 'items-end' : 'items-start',
          // The app's widths: a wide bubble is as wide as a picture (330px at
          // most); a text bubble wraps at 80% — capped here, because 80% of a
          // desktop column is far wider than any phone.
          wide ? 'w-[min(80%,330px)]' : 'max-w-[min(80%,420px)]',
        )}
      >
        <div
          className={cn(
            'group relative min-w-0 rounded-md text-wa-bubble-text shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]',
            wide && 'w-full',
            tone === 'in' ? 'bg-wa-in' : 'bg-wa-out',
            first && (mdgSide ? 'rounded-tr-none' : 'rounded-tl-none'),
            hasMedia || hasOther ? 'p-[3px]' : 'px-[9px] pb-[7px] pt-[6px]',
          )}
          onContextMenu={
            menuEnabled
              ? (e) => {
                  e.preventDefault();
                  onOpenMenu!(message, { x: e.clientX, y: e.clientY });
                }
              : undefined
          }
          onPointerDown={menuEnabled ? longPress.onPointerDown : undefined}
          onPointerMove={menuEnabled ? longPress.onPointerMove : undefined}
          onPointerUp={menuEnabled ? longPress.onPointerUp : undefined}
          onPointerCancel={menuEnabled ? longPress.onPointerCancel : undefined}
          onClickCapture={menuEnabled ? longPress.onClickCapture : undefined}
        >
          {first ? <Tail right={mdgSide} tone={tone} /> : null}

          {menuEnabled ? (
            <button
              type="button"
              aria-label="Message actions"
              onPointerDown={() => {
                menuWasOpenRef.current = !!isMenuOpen;
              }}
              onClick={(e) => {
                const wasOpen = menuWasOpenRef.current;
                menuWasOpenRef.current = false;
                if (wasOpen) return;
                const rect = e.currentTarget.getBoundingClientRect();
                onOpenMenu!(message, { x: rect.left, y: rect.bottom + 2 });
              }}
              className={cn(
                // `hidden md:flex` and not just an opacity gate: a 0-opacity
                // button is still a live target, so a stray tap on the corner of
                // any bubble silently opened this menu. Touch reaches the same
                // menu through the long-press (see the hint chip in MessageList).
                'absolute right-1 top-1 z-10 hidden h-6 w-6 items-center justify-center rounded-full text-wa-meta shadow-sm transition-opacity md:flex',
                'md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100',
                tone === 'in' ? 'bg-wa-in' : 'bg-wa-out',
              )}
            >
              <ChevronDown width={16} strokeWidth={2} />
            </button>
          ) : null}

          {showName ? (
            <span
              className={cn(
                'block truncate text-[13px] font-medium leading-tight',
                hasMedia || hasOther ? 'px-1.5 pb-1 pt-1' : 'pb-0.5',
              )}
              style={{ color: `hsl(${senderHue(message.senderId)} 55% 40%)` }}
            >
              {senderLabel}
            </span>
          ) : null}

          {replyTo ? (
            <button
              type="button"
              onClick={() => onJumpTo?.(replyTo.messageId)}
              className="mb-1 flex w-full items-stretch overflow-hidden rounded-md bg-black/[0.06] text-left hover:bg-black/10"
            >
              <span className="w-1 shrink-0 bg-wa-accent" aria-hidden />
              <span className="min-w-0 flex-1 px-2 py-1">
                <span className="block truncate text-[13px] font-medium leading-tight text-wa-accent-strong">
                  {replySenderLabel(replyTo, currentUserId)}
                </span>
                <span className="line-clamp-2 break-words text-[13px] leading-snug text-wa-meta">
                  {replyPreviewText(replyTo)}
                </span>
              </span>
              {replyTo.imageUrl ? (
                <img
                  src={replyTo.imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="h-10 w-10 shrink-0 object-cover"
                />
              ) : null}
            </button>
          ) : null}

          {ask ? <AskHeader ask={ask} /> : null}

          {message.attachments.length > 0 ? (
            <div className="flex flex-col gap-1">
              <BubbleAttachments
                attachments={message.attachments}
                mediaOverlay={
                  timeOnPicture ? (
                    <>
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-md bg-gradient-to-t from-black/45 to-transparent"
                      />
                      <span className="pointer-events-none absolute bottom-1.5 right-2">
                        {meta(true)}
                      </span>
                    </>
                  ) : null
                }
              />
            </div>
          ) : null}

          {hasBody ? (
            <div
              className={cn(
                // `anywhere`, not `break-words`: only it lowers the bubble's
                // minimum width, so a 55-character invoice number wraps inside
                // the bubble instead of running out of it.
                'whitespace-pre-wrap [overflow-wrap:anywhere] text-[15px] leading-[1.35] [&_a]:text-wa-accent-strong [&_a]:underline',
                hasMedia || hasOther ? 'px-[6px] pb-0.5 pt-1' : '',
              )}
            >
              {linkify(message.body!)}
              {/* The trailing spacer: as wide as the time (and ticks) in the
                  bottom-right corner, so the last line of words stops short of
                  them — or wraps to a line of its own — as the app's does. */}
              {metaInFlow ? null : (
                <span
                  aria-hidden
                  className={cn('inline-block h-px align-bottom', ticks ? 'w-[72px]' : 'w-[54px]')}
                />
              )}
            </div>
          ) : null}

          {portalLogin ? (
            <PortalLoginPreview
              portals={portalLogin.portals}
              states={view.portalLogins}
              failed={view.portalLoginsFailed}
              canEdit={view.canEdit}
              lang={lang}
            />
          ) : null}

          {setupCard ? (
            <SetupCardPreview
              card={setupCard.card}
              setup={view.setup}
              canEdit={view.canEdit}
              lang={lang}
            />
          ) : null}

          {ask ? <AskFooterPreview ask={ask} phase={askPhase} lang={lang} /> : null}

          {metaInFlow ? (
            <div className="flex items-center justify-between gap-3 px-1.5 pb-0.5 pt-0.5">
              {showAiBadge ? (
                <span className="flex items-center gap-0.5 text-[11px] leading-none text-wa-meta">
                  <Zap width={11} strokeWidth={2} className="shrink-0" />
                  {dealerWord(lang, 'aiInstantReply')}
                </span>
              ) : (
                <span />
              )}
              {meta(false)}
            </div>
          ) : null}
          {!metaInFlow && !timeOnPicture ? (
            <span className="absolute bottom-[5px] right-[8px]">{meta(false)}</span>
          ) : null}
        </div>

        {reactions.length > 0 ? (
          <div
            className={cn(
              // Hangs off the bubble's bottom edge, half over it, like the app's
              // — from md up. Below md it sits just under the bubble: each chip's
              // tap halo (`.tap-target`) reached up over the bottom of a photo,
              // so a tap on the picture's lower edge opened Reactions instead.
              'relative z-10 mb-1 mt-1 flex flex-wrap items-center gap-1 md:-mt-2.5',
              mdgSide ? 'mr-2 justify-end' : 'ml-2',
            )}
          >
            {groupReactions(reactions, currentUserId).map((g) => (
              <button
                key={g.emoji}
                type="button"
                onClick={() => onOpenReactions?.(message)}
                aria-label={`${g.emoji} ${g.count}, see who reacted`}
                className={cn(
                  // The only route to the who-reacted list; `.tap-target` grows
                  // the hit area without growing the chip.
                  'tap-target flex items-center gap-0.5 rounded-full border bg-wa-in px-1.5 py-0.5 text-[13px] leading-none shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]',
                  g.mine ? 'border-wa-accent' : 'border-wa-divider',
                )}
              >
                <span aria-hidden>{g.emoji}</span>
                {g.count > 1 ? (
                  <span className="text-[11px] tabular-nums text-wa-meta">{g.count}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {pendingAnswer && onOpenAnswer ? (
        // The request a dealer's picture answered, waiting for MDG. Admin-only
        // and a chip, not just a menu entry: the long-press is invisible, and
        // this is the one thing in the thread the admin has to act on. A real
        // 44px target below md.
        <button
          type="button"
          onClick={() => onOpenAnswer(message)}
          className="mt-1 flex min-h-11 max-w-[min(80%,420px)] items-center gap-1.5 rounded-lg border border-warning bg-warning-soft px-2.5 py-1 text-left text-xs font-medium text-warning-strong [overflow-wrap:anywhere] md:min-h-0"
        >
          <CheckCircle2 width={13} height={13} strokeWidth={2} className="shrink-0" aria-hidden />
          <span className="min-w-0">Answer to: {requestLabel(pendingAnswer)} — mark received</span>
        </button>
      ) : null}
    </div>
  );
});
