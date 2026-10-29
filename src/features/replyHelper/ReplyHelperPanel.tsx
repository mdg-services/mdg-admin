import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import type { ReplyHelperChannel, ReplyHelperNotice, ReplyHelperThread } from '@dk/shared';

import { InstructionBox } from './InstructionBox';
import { LoginPicker } from './LoginPicker';
import { AskBubble, TurnView, WritingBubble } from './TurnView';

/**
 * The helper's working area: who it is writing for, the notices, the thread of
 * asks and drafts, and the box to ask in. The same body sits in the inline tray
 * (md and up) and in the phone's bottom sheet.
 *
 * SHAPE: a scrolling thread above and a box pinned under it. The box stays put
 * while the thread scrolls, so the admin can keep asking while reading a long
 * answer. The parent decides how tall this is (`className`): a capped tray
 * beside the open conversation, or a fixed share of the sheet.
 *
 * It holds NO conversation content of its own. Everything shown comes from the
 * thread the strip fetched for the conversation it is keyed on, and the strip is
 * remounted per conversation, so nothing carries from one chat to the next.
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
  /** "Suggest a reply": an ask with no instruction. */
  onSuggest: () => void;
  onRetryTurn: (instruction: string) => void;
  onUse: (text: string) => void;
  onLoadEarlier: () => void;
  loadingEarlier: boolean;
  onPickLogin: (userId: string | null) => void;
  pickingLogin: boolean;
  /** The channel the panel is open on: a WhatsApp draft is never offered for the app chat. */
  openChannel: ReplyHelperChannel;
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
  className,
}: ReplyHelperPanelProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const context = thread?.context;
  const turns = thread?.turns ?? [];
  const newestId = turns.length > 0 ? turns[turns.length - 1]!.id : null;
  const notConfigured = !!context?.notices.some((n) => n.kind === 'not_configured');
  const busy = pendingInstruction !== null;

  // To the newest turn when one lands, when a request starts, and when the panel
  // opens. NOT when older turns are added in front ("Load earlier"): the admin is
  // reading back, and a jump to the bottom would throw them out of place.
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newestId, busy, loading]);

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2.5"
      >
        <div className="grid gap-3">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-text-muted">
              <Spinner size={16} /> Getting the helper ready…
            </p>
          ) : loadFailed && !thread ? (
            <Callout onRetry={onRetryLoad}>Could not open the Reply helper for this chat.</Callout>
          ) : context ? (
            <>
              <div className="grid gap-0.5">
                <p className="min-w-0 break-words text-sm font-medium text-text">
                  {context.header}
                </p>
                <p className="text-xs text-text-subtle">
                  Drafts are written for: {context.readerWords}
                </p>
              </div>

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
                <div>
                  <Button
                    size="sm"
                    variant="ghost"
                    tone="brand"
                    loading={loadingEarlier}
                    onClick={onLoadEarlier}
                  >
                    Load earlier
                  </Button>
                </div>
              ) : null}

              {turns.length === 0 && !busy ? (
                <p className="text-sm text-text-muted">
                  Tap Suggest a reply and it reads this chat and writes the reply — or say what the
                  reply should do. You read, change and put a draft in the reply box; nothing is
                  sent until you press Send there.
                </p>
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
                <div className="grid gap-2">
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
