import { BellOff } from 'lucide-react';

import { Button, useToast } from '@/components/ui';
import { useClearReplyQuiet } from '@/hooks/api/useClearReplyQuiet';
import { promiseActive, promiseTimeText } from '@dk/shared';
import type { Conversation } from '@dk/shared';

/**
 * "AI quiet until 4:10 pm · Asha" — one slim line, first in the band pinned over
 * the messages, while the AI is holding back on this chat.
 *
 * A person's typed reply starts the quiet (30 minutes, never shortened by a
 * later one) and so does Pick up (an hour), so the admin who just wrote to a
 * dealer can see why the machine is not also answering them, and can hand the
 * chat back with "Let AI answer now" — which also has the AI take up the dealer's
 * message that is waiting, if one is. The server compares the time with the clock,
 * so nothing ends it: this line simply stops being drawn when `now` passes it,
 * and is not drawn at all for a chat with no quiet.
 *
 * Whose quiet it is, is the person's name only — a reply and a pick-up read the
 * same here, and the line does not say which.
 *
 * `now` is the page's one-minute tick, so the line can outlast the quiet by up
 * to a minute. The server is the one that decides whether the AI answers.
 */
export function AiQuietLine({ conversation, now }: { conversation: Conversation; now: number }) {
  const toast = useToast();
  const clear = useClearReplyQuiet();
  const nowDate = new Date(now);
  const until = conversation.replyQuietUntil;
  if (!until || !promiseActive(until, nowDate)) return null;

  const who = conversation.replyQuietByName?.trim();
  const when = promiseTimeText(until, 'en', nowDate);

  async function letAiAnswer() {
    try {
      await clear.mutateAsync(conversation.id);
      toast.success('The AI is answering in this chat again, starting with any message that is waiting.');
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'That did not go through.');
    }
  }

  return (
    // ONE LINE: on a narrow chat the name at the end gives way ("… · Asha Ve…",
    // whole on hover), never the time and never the button.
    <div className="flex items-center gap-2 border-b border-border bg-surface-2 py-0.5 pl-4 pr-2">
      <BellOff
        width={14}
        height={14}
        strokeWidth={1.75}
        aria-hidden
        className="shrink-0 text-text-muted"
      />
      <p
        className="min-w-0 flex-1 truncate text-[13px] text-text-muted"
        title={who ? `AI quiet until ${when} · ${who}` : `AI quiet until ${when}`}
      >
        {who ? `AI quiet until ${when} · ${who}` : `AI quiet until ${when}`}
      </p>
      <Button
        size="sm"
        variant="ghost"
        className="shrink-0"
        loading={clear.isPending}
        onClick={() => void letAiAnswer()}
      >
        Let AI answer now
      </Button>
    </div>
  );
}
