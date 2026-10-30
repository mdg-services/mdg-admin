import { Lock, Sparkles, Wand2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import type { ReplyHelperChannel, ReplyHelperNotice, ReplyHelperThread } from '@dk/shared';

import { InstructionBox } from './InstructionBox';
import { LoginPicker } from './LoginPicker';
import { AskBubble, TurnView, WritingBubble } from './TurnView';

/**
 * The helper's working area: who it is writing for, the notices, the thread of
 * asks and drafts, and the box to ask in.
 *
 * SHAPE: a band saying who the drafts are for and that this is private, a
 * scrolling thread under it, and the box pinned at the bottom. The box stays put
 * while the thread scrolls, so the admin can keep asking while reading a long
 * answer. The parent decides how tall this is (`className`).
 *
 * IT WEARS THE HELPER'S VIOLET THROUGHOUT — the band, the asks, the drafts' edge,
 * the box — and the reply box that sends to the dealer never does. That is the
 * line between "only MDG sees this" and "the dealer sees this".
 *
 * It holds NO conversation content of its own. Everything shown comes from the
 * thread fetched for the conversation it is keyed on, and it is remounted per
 * conversation, so nothing carries from one chat to the next.
 */

const NOTICE_INTENT: Record<ReplyHelperNotice['kind'], 'warning' | 'info'> = {
  window_closed: 'warning',
  blocked: 'warning',
  archived: 'warning',
  not_configured: 'warning',
  pick_login: 'info',
};

export interface ReplyHelperPanelProps {
  thread: ReplyHelperThread | undefined;
  loading: boolean;
  loadFailed: boolean;
  onRetryLoad: () => void;
  meId: string | null;
  /** The instruction of the request that is running for this conversation, if any. */
  pendingInstruction: string | null;
  /** The last ask failed before the server could answer: its words, or null. */
  askError: string | null;
  instruction: string;
  onInstructionChange: (next: string) => void;
  onAsk: () => void;
  /** "Suggest reply": an ask with no instruction. */
  onSuggest: () => void;
  onRetryTurn: (instruction: string) => void;
  onUse: (text: string) => void;
  onLoadEarlier: () => void;
  loadingEarlier: boolean;
  onPickLogin: (userId: string | null) => void;
  pickingLogin: boolean;
  /** The channel the panel is open on: a WhatsApp draft is never offered for the app chat. */
  openChannel: ReplyHelperChannel;
  /** On screen: scroll to the newest turn when shown (a hidden box cannot scroll). */
  active?: boolean;
  className?: string;
}

export function ReplyHelperPanel({
  thread,
  loading,
  loadFailed,
  onRetryLoad,
  meId,
  pendingInstruction,
  askError,
  instruction,
  onInstructionChange,
  onAsk,
  onSuggest,
  onRetryTurn,
  onUse,
  onLoadEarlier,
  loadingEarlier,
  onPickLogin,
  pickingLogin,
  openChannel,
  active = true,
  className,
}: ReplyHelperPanelProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const context = thread?.context;
  const turns = thread?.turns ?? [];
  const newestId = turns.length > 0 ? turns[turns.length - 1]!.id : null;
  const notConfigured = !!context?.notices.some((n) => n.kind === 'not_configured');
  const busy = pendingInstruction !== null;

  // To the newest turn when one lands, when a request starts, and when the panel
  // opens or its tab comes forward. NOT when older turns are added in front
  // ("Load earlier"): the admin is reading back, and a jump to the bottom would
  // throw them out of place.
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && active) el.scrollTop = el.scrollHeight;
  }, [newestId, busy, loading, active]);

  return (
    <div className={cn('flex min-h-0 flex-col bg-surface', className)}>
      {/* Who the drafts are for, in full (the role is the half that matters and
          was the half that used to be cut off), and that none of this is sent. */}
      <div className="shrink-0 border-b border-assist-line bg-assist-soft px-4 py-3">
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-assist text-white"
          >
            <Sparkles width={14} height={14} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="break-words text-[13px] font-semibold leading-5 text-text">
              {context?.header ?? 'Reply helper'}
            </p>
            <p className="mt-0.5 flex items-start gap-1 text-xs leading-4 text-text-muted">
              <Lock width={12} height={12} strokeWidth={2} className="mt-px shrink-0" aria-hidden />
              <span>
                Private to MDG.
                {context ? ` Drafts are written for ${context.readerWords}.` : ''} Nothing is
                sent until you press Send in the reply box.
              </span>
            </p>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 scroll-py-1.5 overflow-y-auto overscroll-contain px-4 py-4"
      >
        <div className="grid gap-4">
          {loading ? (
            <div className="grid gap-2" aria-busy>
              <Skeleton className="ml-auto h-9 w-2/3 rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : loadFailed && !thread ? (
            <Callout onRetry={onRetryLoad}>Could not open the Reply helper for this chat.</Callout>
          ) : context ? (
            <>
              {context.notices.map((n) => (
                <Callout key={`${n.kind}-${n.words}`} intent={NOTICE_INTENT[n.kind]}>
                  {n.words}
                </Callout>
              ))}

              {context.loginChoices.length > 0 ? (
                <LoginPicker
                  choices={context.loginChoices}
                  picked={context.login}
                  busy={pickingLogin}
                  onPick={onPickLogin}
                />
              ) : null}

              {thread!.hasMore ? (
                <div className="flex justify-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    tone="assist"
                    loading={loadingEarlier}
                    onClick={onLoadEarlier}
                  >
                    Load earlier
                  </Button>
                </div>
              ) : null}

              {turns.length === 0 && !busy ? (
                <div className="grid justify-items-center gap-2 px-2 py-6 text-center">
                  <span
                    aria-hidden
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-assist-line bg-assist-soft text-assist"
                  >
                    <Wand2 width={18} height={18} strokeWidth={1.75} />
                  </span>
                  <p className="text-sm font-semibold text-text">Get the reply written for you</p>
                  <p className="max-w-[30ch] text-sm text-text-muted">
                    Tap <span className="font-medium text-assist-strong">Suggest reply</span> and it
                    reads this chat and drafts what to send — or tell it what you want below.
                  </p>
                </div>
              ) : null}

              {turns.map((t) => (
                <TurnView
                  key={t.id}
                  turn={t}
                  meId={meId}
                  openWhere={context.where}
                  openChannel={openChannel}
                  busy={busy}
                  onUse={onUse}
                  onRetry={onRetryTurn}
                />
              ))}

              {/* The request that is running. The words stay on screen as a
                  bubble — the box was cleared to take the next ask, and an admin
                  waiting half a minute should see what they asked. */}
              {pendingInstruction !== null ? (
                <div className="grid gap-3">
                  <AskBubble instruction={pendingInstruction} who="You" when="now" />
                  <WritingBubble />
                </div>
              ) : null}

              {askError ? <Callout>{askError}</Callout> : null}
            </>
          ) : null}
        </div>
      </div>

      <InstructionBox
        value={instruction}
        onChange={onInstructionChange}
        onAsk={onAsk}
        onSuggest={onSuggest}
        busy={busy}
        disabled={!context || notConfigured}
        disabledWords={notConfigured ? 'The Reply helper is not set up on this server.' : undefined}
      />
    </div>
  );
}
