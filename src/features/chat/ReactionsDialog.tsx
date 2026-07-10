import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { Conversation, Message, MessageReaction } from '@dk/shared';

interface ReactionsDialogProps {
  /** The (live) message whose reactions are shown; null = closed. */
  message: Message | null;
  conversation: Conversation | null;
  currentUserId: string;
  /** Toggling the own emoji removes it; the list updates live. */
  onRemove: (message: Message, emoji: string) => void;
  onClose: () => void;
}

function reactorName(
  reaction: MessageReaction,
  conversation: Conversation | null,
  currentUserId: string,
): string {
  if (reaction.userId === currentUserId) return 'You';
  if (reaction.userName) return reaction.userName;
  const participant = conversation?.participants?.find(
    (p) => p.userId === reaction.userId,
  );
  if (participant?.name) return participant.name;
  if (
    reaction.userId === conversation?.assignedAdminId &&
    conversation?.assignedAdminName
  ) {
    return conversation.assignedAdminName;
  }
  return 'Support team';
}

/** Who-reacted detail, opened by tapping a reaction chip under a bubble. */
export function ReactionsDialog({
  message,
  conversation,
  currentUserId,
  onRemove,
  onClose,
}: ReactionsDialogProps) {
  const reactions = message?.reactions ?? [];
  return (
    <Dialog
      open={!!message && reactions.length > 0}
      onClose={onClose}
      title="Reactions"
      size="sm"
    >
      <ul className="space-y-0.5">
        {reactions.map((r) => {
          const own = r.userId === currentUserId;
          return (
            <li
              key={r.userId}
              className="flex items-center gap-3 rounded-md px-2 py-1.5"
            >
              <span className="text-xl leading-none" aria-hidden>
                {r.emoji}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-text">
                {reactorName(r, conversation, currentUserId)}
              </span>
              {own && message ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemove(message, r.emoji)}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
