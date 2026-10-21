import {
  Bell,
  BellOff,
  BellRing,
  MessageCirclePlus,
  MessageCircleOff,
  Search,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import {
  WHATSAPP_CHAT_FILTER_LABELS,
  WHATSAPP_CHAT_FILTERS,
  WHATSAPP_STAGE_LABELS,
  WHATSAPP_STAGES,
  type WhatsAppChatFilter,
  type WhatsAppChatSummary,
} from '@dk/shared';

import { ChatListRow } from './ChatListRow';
import { badgeCount, emptyListWords, NO_STAGE, type StageFilter } from './format';
import { setMuted, useDesktopAlerts, useMuted } from './notify';
import { useFlashRows } from './useFlashRows';
import { useSentinel } from './useInView';

/** Waits for the typing to stop before the list is asked for anything. */
const SEARCH_DEBOUNCE_MS = 250;

export interface ChatListProps {
  chats: readonly WhatsAppChatSummary[];
  counts: Record<WhatsAppChatFilter, number> | undefined;
  /** The first page has not arrived and there is nothing to show yet. */
  loading: boolean;
  /** The list could not be fetched at all — which is not the same as it being empty. */
  failed: boolean;
  /** A refresh failed but an older list is on screen. */
  refreshFailed: boolean;
  /** What is on screen belongs to the previous filter or search while the new one loads. */
  stale: boolean;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  selected: string | null;
  onOpen: (person: string) => void;
  filter: WhatsAppChatFilter;
  onFilter: (filter: WhatsAppChatFilter) => void;
  stage: StageFilter | null;
  onStage: (stage: StageFilter | null) => void;
  q: string;
  onQ: (q: string) => void;
  /** Chats with something unread, whatever list is showing. */
  unreadTotal: number;
  onNewChat: () => void;
  onQuickReplies: () => void;
  now: number;
}

/**
 * The left-hand column: who is writing, newest first.
 *
 * Header with the controls that belong to the whole inbox, a search box, the
 * lists as chips with their counts, a stage filter, and the chats themselves.
 * It owns no data — the page hands it the list — and no routing: it says what
 * was asked for, and the page puts it in the URL.
 */
export function ChatList(props: ChatListProps) {
  const {
    chats,
    counts,
    loading,
    failed,
    refreshFailed,
    stale,
    onRetry,
    hasMore,
    loadingMore,
    onLoadMore,
    selected,
    onOpen,
    filter,
    onFilter,
    stage,
    onStage,
    q,
    onQ,
    unreadTotal,
    onNewChat,
    onQuickReplies,
    now,
  } = props;

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const flashing = useFlashRows(chats, `${filter}|${stage ?? ''}|${q}`, stale);
  const sentinel = useSentinel<HTMLLIElement>(scrollRef, hasMore && !loadingMore && !failed, onLoadMore);

  // ── search: typed text is local; the page hears about it a moment later ──
  const [text, setText] = React.useState(q);
  const emitted = React.useRef(q);
  React.useEffect(() => {
    // Changed from outside (a "clear" button, a link): follow it. A change this
    // box made itself comes back as the same value and is ignored, or a letter
    // typed while the URL catches up would be wiped.
    if (q !== emitted.current) {
      emitted.current = q;
      setText(q);
    }
  }, [q]);
  React.useEffect(() => {
    if (text === emitted.current) return;
    const t = window.setTimeout(() => {
      emitted.current = text;
      onQ(text);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [text, onQ]);

  // Ctrl/Cmd+K from anywhere on the page. Not while the box is out of sight
  // (the list is hidden behind an open chat on a phone).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
      const input = searchRef.current;
      if (!input || input.offsetParent === null) return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const narrowed = stage !== null || q.trim().length > 0;
  const showSkeleton = loading && chats.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ListHeader unreadTotal={unreadTotal} onNewChat={onNewChat} onQuickReplies={onQuickReplies} />

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 pb-2">
        <div className="relative">
          <Search
            width={16}
            height={16}
            strokeWidth={1.75}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
          />
          <Input
            ref={searchRef}
            type="search"
            value={text}
            maxLength={100}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && text) {
                e.preventDefault();
                setText('');
                emitted.current = '';
                onQ('');
              }
            }}
            placeholder="Search name or number"
            aria-label="Search chats"
            // Clearing is Esc or the X; the browser's own cross is hidden so
            // there is one of them, and it is 44px on a phone.
            className="rounded-lg bg-surface-2 pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
            autoComplete="off"
          />
          {text ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setText('');
                emitted.current = '';
                onQ('');
                searchRef.current?.focus();
              }}
              className="absolute right-0 top-1/2 flex h-11 w-9 -translate-y-1/2 items-center justify-center text-text-subtle hover:text-text md:h-9"
            >
              <X width={14} height={14} strokeWidth={2} />
            </button>
          ) : null}
        </div>
        <Select
          aria-label="Stage"
          value={stage ?? ''}
          onChange={(e) => onStage(e.target.value === '' ? null : (e.target.value as StageFilter))}
          className="w-[8.75rem] rounded-lg bg-surface-2"
        >
          <option value="">All stages</option>
          {WHATSAPP_STAGES.map((s) => (
            <option key={s} value={s}>
              {WHATSAPP_STAGE_LABELS[s]}
            </option>
          ))}
          <option value={NO_STAGE}>No stage</option>
        </Select>
      </div>

      <div
        role="group"
        aria-label="Which chats"
        className="flex gap-1.5 overflow-x-auto overscroll-x-contain border-b border-border px-3 pb-2"
      >
        {WHATSAPP_CHAT_FILTERS.map((f) => {
          const active = f === filter;
          const count = counts?.[f];
          return (
            <button
              key={f}
              type="button"
              aria-pressed={active}
              onClick={() => onFilter(f)}
              className={cn(
                // 44px on a phone, the compact chip from md up.
                'flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium md:min-h-8',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                active ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-text-muted hover:text-text',
              )}
            >
              {WHATSAPP_CHAT_FILTER_LABELS[f]}
              {typeof count === 'number' ? <span className="tabular-nums">{badgeCount(count)}</span> : null}
            </button>
          );
        })}
      </div>

      {refreshFailed ? (
        <Callout intent="warning" onRetry={onRetry} className="m-2">
          Could not refresh the list. What you see may be out of date.
        </Callout>
      ) : null}

      {/* overscroll-contain: index.css leaves html/body alone so the shell's
          pull-to-refresh survives, and contains each inner scroller instead —
          without it, flicking back to the top of this list reloaded the page. */}
      <div
        ref={scrollRef}
        aria-busy={stale || loading}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain transition-opacity',
          stale && 'opacity-60',
        )}
      >
        {showSkeleton ? (
          <RowSkeletons />
        ) : failed ? (
          <EmptyState
            icon={<TriangleAlert width={28} height={28} strokeWidth={1.5} />}
            title="Could not load the chats"
            description="This does not mean there are none. Check the connection and try again."
            cta={
              <Button size="sm" variant="secondary" onClick={onRetry}>
                Try again
              </Button>
            }
          />
        ) : chats.length === 0 ? (
          <ListEmpty
            filter={filter}
            narrowed={narrowed}
            onClear={() => {
              onStage(null);
              onQ('');
              onFilter('all');
            }}
          />
        ) : (
          <ul>
            {chats.map((chat) => (
              <ChatListRow
                key={chat.person}
                chat={chat}
                selected={chat.person === selected}
                now={now}
                flash={flashing.has(chat.person)}
                onOpen={onOpen}
              />
            ))}
            {hasMore ? (
              <li ref={sentinel} className="flex min-h-11 items-center justify-center py-3">
                {loadingMore ? <Spinner size={16} /> : null}
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </div>
  );
}

function ListHeader({
  unreadTotal,
  onNewChat,
  onQuickReplies,
}: {
  unreadTotal: number;
  onNewChat: () => void;
  onQuickReplies: () => void;
}) {
  const toast = useToast();
  const muted = useMuted();
  const alerts = useDesktopAlerts();

  async function toggleAlerts() {
    const result = await alerts.toggle();
    if (result === 'denied') {
      toast.info('Desktop alerts are blocked.', {
        description: 'Allow notifications for this site in your browser’s settings, then try again.',
      });
    }
  }

  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <h2 className="flex min-w-0 flex-1 items-center gap-2 text-xl font-semibold text-text">
        <span className="truncate">WhatsApp</span>
        {unreadTotal > 0 ? (
          <span
            aria-label={`${unreadTotal} chats unread`}
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-none text-text-inverse"
          >
            {badgeCount(unreadTotal)}
          </span>
        ) : null}
      </h2>
      <IconButton aria-label="New chat" title="New chat" onClick={onNewChat}>
        <MessageCirclePlus width={20} height={20} strokeWidth={1.75} />
      </IconButton>
      {alerts.permission !== 'unsupported' ? (
        <IconButton
          aria-label={
            alerts.permission === 'denied'
              ? 'Desktop alerts are blocked'
              : alerts.on
                ? 'Turn desktop alerts off'
                : 'Turn desktop alerts on'
          }
          title={
            alerts.permission === 'denied'
              ? 'Desktop alerts are blocked in your browser'
              : alerts.on
                ? 'Desktop alerts: on'
                : 'Desktop alerts: off'
          }
          aria-pressed={alerts.on}
          onClick={() => void toggleAlerts()}
        >
          {alerts.permission === 'denied' ? (
            <BellOff width={20} height={20} strokeWidth={1.75} className="text-danger" />
          ) : alerts.on ? (
            <BellRing width={20} height={20} strokeWidth={1.75} className="text-brand" />
          ) : (
            <Bell width={20} height={20} strokeWidth={1.75} />
          )}
        </IconButton>
      ) : null}
      <IconButton
        aria-label={muted ? 'Turn the message sound on' : 'Mute the message sound'}
        title={muted ? 'Sound: off' : 'Sound: on'}
        aria-pressed={!muted}
        onClick={() => setMuted(!muted)}
      >
        {muted ? (
          <VolumeX width={20} height={20} strokeWidth={1.75} />
        ) : (
          <Volume2 width={20} height={20} strokeWidth={1.75} className="text-brand" />
        )}
      </IconButton>
      <IconButton aria-label="Quick replies" title="Quick replies" onClick={onQuickReplies}>
        <Zap width={20} height={20} strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}

function ListEmpty({
  filter,
  narrowed,
  onClear,
}: {
  filter: WhatsAppChatFilter;
  narrowed: boolean;
  onClear: () => void;
}) {
  const words = emptyListWords(filter, narrowed);
  return (
    <EmptyState
      icon={<MessageCircleOff width={28} height={28} strokeWidth={1.5} />}
      title={words.title}
      description={words.description}
      cta={
        narrowed || filter !== 'all' ? (
          <Button size="sm" variant="secondary" onClick={onClear}>
            Show all chats
          </Button>
        ) : undefined
      }
    />
  );
}

function RowSkeletons() {
  return (
    <ul aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex min-h-[72px] items-center gap-3 border-b border-border px-3 py-2.5">
          <Skeleton className="h-[49px] w-[49px] shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </li>
      ))}
    </ul>
  );
}
