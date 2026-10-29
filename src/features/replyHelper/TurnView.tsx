import { Sparkles } from 'lucide-react';

import { Callout } from '@/components/ui/Callout';
import { Spinner } from '@/components/ui/Spinner';
import { askLabel, askedByLabel, isSuggestion, turnWhen } from '@/lib/replyHelper';
import type { ReplyHelperChannel, ReplyHelperTurn } from '@dk/shared';

import { DraftCard } from './DraftCard';

/**
 * One exchange in the helper's thread: what the admin asked, on the right as a
 * bubble, and below it what came back — a note, the drafts, what the knowledge
 * does not cover, or the reason it could not answer.
 *
 * The thread is SHARED by every admin, so each bubble says who asked and when.
 * "You" is the admin looking at it; a teammate's request reads as theirs, so
 * nobody takes a colleague's half-finished line of questioning for their own.
 */

/** The admin's words, right-aligned, with who asked and when. */
export function AskBubble({
  instruction,
  who,
  when,
  where,
}: {
  instruction: string;
  who: string;
  when: string;
  /** The channel it was asked on, only shown when it differs from the open one. */
  where?: string | null;
}) {
  return (
    <div className="ml-auto grid max-w-[88%] justify-items-end gap-0.5">
      <p className="flex min-w-0 items-center gap-1.5 whitespace-pre-wrap break-words rounded-lg rounded-br-sm bg-brand-soft px-3 py-2 text-sm text-text">
        {isSuggestion(instruction) ? (
          <Sparkles
            width={14}
            height={14}
            strokeWidth={1.75}
            className="shrink-0 text-brand"
            aria-hidden
          />
        ) : null}
        {askLabel(instruction)}
      </p>
      <p className="text-xs text-text-subtle">{[who, when, where].filter(Boolean).join(' · ')}</p>
    </div>
  );
}

/** The calm state while the model writes: it takes up to half a minute. */
export function WritingBubble() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-sm text-text-muted"
    >
      <Spinner size={16} />
      <span>Writing… this can take up to half a minute.</span>
    </div>
  );
}

export function TurnView({
  turn,
  meId,
  openWhere,
  openChannel,
  busy,
  onUse,
  onRetry,
}: {
  turn: ReplyHelperTurn;
  meId: string | null;
  /** The channel the panel is open on, so a turn from the other one can say so. */
  openWhere: string;
  /**
   * The channel the panel is open on. ONE THREAD SERVES BOTH CHANNELS for a login,
   * so the app chat's panel lists turns asked on WhatsApp — and a WhatsApp draft may
   * carry the real payment link and words about paying. Google Play forbids both in
   * the app, so such a draft is never offered there: no Use this, no Copy.
   */
  openChannel: ReplyHelperChannel;
  /** A request is running: Retry waits, so it cannot pay for two. */
  busy: boolean;
  onUse: (text: string) => void;
  onRetry: (instruction: string) => void;
}) {
  const reply = turn.reply;
  return (
    <section className="grid gap-2" aria-label="Reply helper exchange">
      <AskBubble
        instruction={turn.instruction}
        who={askedByLabel(turn, meId)}
        when={turnWhen(turn.at)}
        where={turn.where && turn.where !== openWhere ? turn.where : null}
      />

      {reply ? (
        <div className="grid gap-2">
          {reply.note ? (
            <p className="min-w-0 whitespace-pre-wrap break-words text-sm text-text-muted">
              {reply.note}
            </p>
          ) : null}
          {openChannel === 'app' && turn.channel === 'whatsapp' && reply.drafts.length > 0 ? (
            <p className="rounded-md border border-border bg-surface-2 p-2.5 text-sm text-text-muted">
              {reply.drafts.length === 1 ? 'This draft was' : 'These drafts were'} written for
              WhatsApp, so {reply.drafts.length === 1 ? 'it is' : 'they are'} not shown here: a
              WhatsApp draft can carry the payment link, which never goes in the app chat. Ask again
              here for an app-chat version.
            </p>
          ) : (
            reply.drafts.map((d, i) => (
              <DraftCard key={d.id} draft={d} index={i} count={reply.drafts.length} onUse={onUse} />
            ))
          )}
          {reply.notCovered.length > 0 ? (
            <div className="grid gap-1 rounded-md border border-border bg-surface-2 p-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
                Not covered — check before sending
              </p>
              <ul className="grid gap-0.5 pl-4 text-sm text-text-muted [list-style:disc]">
                {reply.notCovered.map((line, i) => (
                  <li key={i} className="min-w-0 break-words">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <Callout onRetry={busy ? undefined : () => onRetry(turn.instruction)}>
          {turn.failure?.trim() || 'The helper could not answer this one.'}
        </Callout>
      )}
    </section>
  );
}
