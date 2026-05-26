import type { Message } from '@dk/shared';
import * as React from 'react';

import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = startOfDay(new Date());
  const that = startOfDay(d);
  const diffDays = Math.round((today - that) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export function MessageList({ messages, currentUserId }: MessageListProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const lastCountRef = React.useRef(0);
  const lastIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const lastId = messages.length ? messages[messages.length - 1]!.id : null;
    const grew = messages.length > lastCountRef.current;
    const changed = lastId !== lastIdRef.current;
    if (grew || changed) {
      el.scrollTop = el.scrollHeight;
    }
    lastCountRef.current = messages.length;
    lastIdRef.current = lastId;
  }, [messages]);

  const lastOwnId = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.senderId === currentUserId) return m.id;
    }
    return null;
  }, [messages, currentUserId]);

  const items: React.ReactNode[] = [];
  let lastDay: number | null = null;
  for (const m of messages) {
    const d = new Date(m.createdAt);
    const day = startOfDay(d);
    if (day !== lastDay) {
      items.push(
        <div
          key={`day-${m.id}`}
          className="my-2 flex items-center justify-center"
        >
          <span className="rounded-full bg-surface-2 px-3 py-0.5 text-xs text-text-muted">
            {dayLabel(m.createdAt)}
          </span>
        </div>,
      );
      lastDay = day;
    }
    items.push(
      <MessageBubble
        key={m.id}
        message={m}
        currentUserId={currentUserId}
        isLastOwn={m.id === lastOwnId}
      />,
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex h-full flex-col gap-2 overflow-y-auto px-4 py-3"
    >
      {items}
    </div>
  );
}
