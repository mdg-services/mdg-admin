import { User } from 'lucide-react';

import { cn } from '@/lib/cn';

import { avatarColour, initialsOf } from './format';

export interface ChatAvatarProps {
  person: string;
  /** The name they are shown under, or null: a person with no name gets the neutral glyph. */
  name: string | null;
  /** Pixels. The chat list uses 49 and the header 40, as WhatsApp does. */
  size?: number;
  className?: string;
}

/**
 * The round picture beside a chat: their initials on a colour that comes from
 * who they are, so the same person is the same colour in the list, the header
 * and the details panel, and never has to be stored.
 */
export function ChatAvatar({ person, name, size = 49, className }: ChatAvatarProps) {
  const initials = initialsOf(name);
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        // A neutral grey for "no name", so a number-only chat does not look like a named one.
        backgroundColor: initials ? avatarColour(person) : undefined,
        fontSize: Math.round(size * 0.4),
      }}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium uppercase text-white',
        !initials && 'bg-border-strong',
        className,
      )}
    >
      {initials ?? <User width={Math.round(size * 0.55)} height={Math.round(size * 0.55)} strokeWidth={1.75} />}
    </span>
  );
}
