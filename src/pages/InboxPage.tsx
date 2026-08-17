import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronLeft,
  FileText,
  FileUp,
  Flag,
  Inbox,
  Info,
  MessageSquare,
  MoreVertical,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  UserPlus,
  X,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Sheet, SheetItem } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { Composer } from '@/features/chat/Composer';
import { MediaGalleryCard } from '@/features/chat/MediaGalleryCard';
import { MessageInfoDialog } from '@/features/chat/MessageInfoDialog';
import { MessageList } from '@/features/chat/MessageList';
import { NewConversationDialog } from '@/features/chat/NewConversationDialog';
import { ReactionsDialog } from '@/features/chat/ReactionsDialog';
import {
  buildReplyContext,
  replyPreviewText,
  replySenderLabel,
} from '@/features/chat/replyPreview';
import { ResolveConversationDialog } from '@/features/chat/ResolveConversationDialog';
import { useConversationSocket } from '@/features/chat/useConversationSocket';
import { useInboxSocket } from '@/features/chat/useInboxSocket';
import { UploadRecordDialog } from '@/features/records/UploadRecordDialog';
import { useAssignConversation } from '@/hooks/api/useAssignConversation';
import { useConversation } from '@/hooks/api/useConversation';
import {
  type InboxFilter,
  useConversationCounts,
  useConversations,
} from '@/hooks/api/useConversations';
import { useDealerRecords } from '@/hooks/api/useDealerRecords';
import { useMessages } from '@/hooks/api/useMessages';
import { useReactToMessage } from '@/hooks/api/useReactToMessage';
import { useReopenConversation } from '@/hooks/api/useReopenConversation';
import { useResolveConversation } from '@/hooks/api/useResolveConversation';
import { useSendMessage } from '@/hooks/api/useSendMessage';
import { useServicesQuery } from '@/hooks/api/useServices';
import { useUpdateTicket } from '@/hooks/api/useUpdateTicket';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Intent } from '@/lib/statusIntent';
import { useAuthStore } from '@/store/auth';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, dealerCodeLabel, ticketFlagLevel } from '@dk/shared';
import type {
  Attachment,
  Conversation,
  Dealer,
  Message,
  TicketCategory,
  TicketPriority,
} from '@dk/shared';

const PRIORITY_INTENT: Record<TicketPriority, Intent> = {
  urgent: 'danger',
  high: 'warning',
  normal: 'neutral',
  low: 'info',
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function roleLabel(role?: Conversation['memberRole']): string {
  if (role === 'dealer-owner') return 'Owner';
  if (role === 'dealer-staff') return 'Manager';
  return '';
}

/** A short label for a conversation's member, e.g. "Asha · Manager". */
function memberLabel(c: Conversation): string {
  const name = c.memberName?.trim();
  const title = c.memberTitle?.trim() || roleLabel(c.memberRole);
  if (name && title) return `${name} · ${title}`;
  if (name) return name;
  if (title) return title;
  return 'Member';
}

interface DealerGroup {
  dealerId: string;
  dealerCode: string;
  items: Conversation[];
}

/**
 * Group conversations by their organisation so the two (or more) member chats
 * under one dealer sit together. Preserves the incoming order of dealers.
 */
function groupByDealer(conversations: Conversation[]): DealerGroup[] {
  const order: string[] = [];
  const map = new Map<string, DealerGroup>();
  for (const c of conversations) {
    const key = c.dealerId;
    let group = map.get(key);
    if (!group) {
      group = {
        dealerId: key,
        dealerCode: dealerCodeLabel(c.dealerCode),
        items: [],
      };
      map.set(key, group);
      order.push(key);
    }
    group.items.push(c);
  }
  return order.map((k) => map.get(k)!);
}

function priorityPill(priority?: TicketPriority) {
  if (!priority || priority === 'normal') return null;
  return (
    <Badge intent={PRIORITY_INTENT[priority]}>{PRIORITY_LABEL[priority]}</Badge>
  );
}

const FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: 'open', label: 'Unassigned' },
  { key: 'mine', label: 'Mine' },
  { key: 'all', label: 'All open' },
  { key: 'resolved', label: 'Resolved' },
];

function formatRelative(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

function statusBadge(status: Conversation['status']) {
  if (status === 'OPEN') {
    return <Badge intent="warning">Open</Badge>;
  }
  if (status === 'ASSIGNED') {
    return <Badge intent="info">Assigned</Badge>;
  }
  return <Badge intent="success">Resolved</Badge>;
}

/**
 * Reply-SLA flag: how long the client has been waiting for a reply. Turns amber
 * at 1.5h and red at 3h so a slipping ticket draws the whole team's attention; a
 * ⚑ also shows when the ticket was auto-returned to the pool for a missed SLA.
 */
function TicketFlagBadge({
  conversation,
  now,
}: {
  conversation: Conversation;
  now: number;
}) {
  const level = ticketFlagLevel(conversation.awaitingReplySince, now);
  if (level === 'none' && !conversation.flagged) return null;
  const intent: Intent = level === 'urgent' ? 'danger' : 'warning';
  const label =
    level === 'none'
      ? 'Returned'
      : `Waiting ${formatRelative(conversation.awaitingReplySince ?? undefined)}`;
  return (
    <Badge intent={intent}>
      <span className="inline-flex items-center gap-0.5">
        <Flag width={11} height={11} strokeWidth={2} />
        {label}
      </span>
    </Badge>
  );
}

export function InboxPage() {
  useInboxSocket();

  const user = useAuthStore((s) => s.user);
  const admin = useAuthStore((s) => s.admin);
  const currentUserId = user?.id ?? admin?.id ?? '';

  // Deep-link support: `/inbox?c=<id>` (e.g. from a dealer's members tab) opens
  // that thread. Read the param up front and seed the initial selection from it,
  // so it wins over the auto-select-first effect below (which would otherwise
  // race it to a different thread when the default list is warm in cache). Also
  // switch to a filter that shows a freshly started, unassigned chat.
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const deepLinkId = searchParams.get('c');

  const [filter, setFilter] = React.useState<InboxFilter>(deepLinkId ? 'all' : 'mine');
  const [selectedId, setSelectedId] = React.useState<string | null>(deepLinkId);
  const [contextOpen, setContextOpen] = React.useState(true);
  const [newOpen, setNewOpen] = React.useState(false);
  const [threadMenuOpen, setThreadMenuOpen] = React.useState(false);
  // Below lg the context panel (ticket controls, dealer, reports) is a slide-over
  // instead of an inline column, so it stays reachable on phones/tablets.
  const [mobileContextOpen, setMobileContextOpen] = React.useState(false);
  const isLg = useMediaQuery('(min-width: 1024px)');

  // Ticks once a minute so the reply-SLA flag colours advance on their own,
  // without waiting for new data to arrive.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Keep the selection in sync with the `?c=` param.
  //  - Desktop (≥ lg): consume a deep link once, seed selection into state, then
  //    strip the param so refresh/back doesn't re-trigger it. Both panes are
  //    visible so React state is the source of truth.
  //  - Mobile (< lg): the URL IS the source of truth. Opening a thread pushes
  //    `?c=<id>` (see `openConversation`) and we never strip it, so Android
  //    hardware-back pops the entry and returns to the list instead of exiting.
  React.useEffect(() => {
    const c = searchParams.get('c');
    if (isLg) {
      if (!c) return;
      setSelectedId(c);
      setFilter('all');
      const next = new URLSearchParams(searchParams);
      next.delete('c');
      setSearchParams(next, { replace: true });
    } else {
      setSelectedId(c);
      if (c) setFilter('all');
    }
  }, [searchParams, setSearchParams, isLg]);

  // Open a conversation. On mobile this pushes `?c=<id>` (a real history entry,
  // so hardware-back returns to the list); on desktop it sets state directly.
  const openConversation = React.useCallback(
    (id: string) => {
      if (isLg) {
        setSelectedId(id);
      } else {
        const next = new URLSearchParams(searchParams);
        next.set('c', id);
        setSearchParams(next);
      }
    },
    [isLg, searchParams, setSearchParams],
  );

  // Close the open thread: pop the pushed `?c=` on mobile (matches hardware
  // back), clear state on desktop.
  const closeConversation = React.useCallback(() => {
    if (isLg) {
      setSelectedId(null);
    } else {
      navigate(-1);
    }
  }, [isLg, navigate]);

  function handleStarted(conversationId: string) {
    setFilter('all');
    openConversation(conversationId);
  }

  const conversationsQ = useConversations(filter);
  // Memoised so the `?? []` fallback doesn't re-fire the auto-select effect
  // below with a fresh array identity on every render.
  const conversations = React.useMemo(
    () => conversationsQ.data ?? [],
    [conversationsQ.data],
  );

  const selectedQ = useConversation(selectedId);
  const conversation = selectedQ.data ?? null;

  const messagesQ = useMessages(selectedId);
  const { markRead } = useConversationSocket(selectedId);
  const messages = React.useMemo(
    () => (messagesQ.data?.pages ?? []).flat(),
    [messagesQ.data],
  );

  // Reply-quote + per-message dialogs. The dialogs track ids (not message
  // objects) so they read live cache data while reactions/receipts change.
  const [replyTo, setReplyTo] = React.useState<Message | null>(null);
  const [infoForId, setInfoForId] = React.useState<string | null>(null);
  const [reactionsForId, setReactionsForId] = React.useState<string | null>(
    null,
  );

  // Never carry reply/dialog state across threads.
  React.useEffect(() => {
    setReplyTo(null);
    setInfoForId(null);
    setReactionsForId(null);
  }, [selectedId]);

  const infoMessage = infoForId
    ? (messages.find((m) => m.id === infoForId) ?? null)
    : null;
  const reactionsMessage = reactionsForId
    ? (messages.find((m) => m.id === reactionsForId) ?? null)
    : null;

  // The who-reacted dialog closes itself once the last reaction is removed;
  // drop the id too, or a later reaction would spontaneously reopen it.
  React.useEffect(() => {
    if (
      reactionsForId &&
      reactionsMessage &&
      (reactionsMessage.reactions?.length ?? 0) === 0
    ) {
      setReactionsForId(null);
    }
  }, [reactionsForId, reactionsMessage]);

  // Mark the dealer's messages read once the conversation is open, so their
  // sent ticks turn blue. Covers history loaded over HTTP.
  React.useEffect(() => {
    if (!currentUserId) return;
    const unread = messages
      .filter(
        (m) =>
          !m.id.startsWith('tmp-') &&
          m.senderId !== currentUserId &&
          !m.readBy.includes(currentUserId),
      )
      .map((m) => m.id);
    if (unread.length > 0) markRead(unread);
  }, [messages, currentUserId, markRead]);

  const sendMessage = useSendMessage();
  const assignConv = useAssignConversation();
  const resolveConv = useResolveConversation();
  const reopenConv = useReopenConversation();
  const updateTicket = useUpdateTicket();
  const { mutate: reactToMessage } = useReactToMessage();

  // Stable handlers — MessageBubble is memoized, so anything that flows down
  // to it must not change identity per render.
  const handleReply = React.useCallback((m: Message) => setReplyTo(m), []);
  const handleCancelReply = React.useCallback(() => setReplyTo(null), []);
  const handleOpenInfo = React.useCallback(
    (m: Message) => setInfoForId(m.id),
    [],
  );
  const handleOpenReactions = React.useCallback(
    (m: Message) => setReactionsForId(m.id),
    [],
  );
  const handleToggleReaction = React.useCallback(
    (m: Message, emoji: string) => {
      if (m.id.startsWith('tmp-')) return;
      const mine = m.reactions?.find((r) => r.userId === currentUserId);
      reactToMessage({
        conversationId: m.conversationId,
        messageId: m.id,
        emoji,
        remove: mine?.emoji === emoji,
      });
    },
    [currentUserId, reactToMessage],
  );

  const composerReply = React.useMemo(() => {
    if (!replyTo) return null;
    const ctx = buildReplyContext(replyTo);
    return {
      senderLabel: replySenderLabel(ctx, currentUserId),
      snippet: replyPreviewText(ctx),
      ...(ctx.imageUrl ? { imageUrl: ctx.imageUrl } : {}),
    };
  }, [replyTo, currentUserId]);

  const isAdmin = !!admin;
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [resolveOpen, setResolveOpen] = React.useState(false);
  const servicesQ = useServicesQuery();

  // One lightweight counts round-trip for the rail badges, instead of four
  // full decorated list fetches.
  const countsQ = useConversationCounts();
  const countMap: Partial<Record<InboxFilter, number | undefined>> = {
    open: countsQ.data?.open,
    mine: countsQ.data?.mine,
    all: countsQ.data?.all,
    resolved: countsQ.data?.resolved,
    flagged: countsQ.data?.flagged,
  };

  // Auto-select first conversation when list loads and nothing selected. Yield
  // to a pending deep-link so we never override an explicit `?c=` selection.
  React.useEffect(() => {
    // On mobile the list IS the landing view — don't jump into a chat and hide
    // it. Auto-select only on ≥ lg, where the list stays visible beside the thread.
    if (!isLg) return;
    if (searchParams.get('c')) return;
    if (!selectedId && conversations.length > 0) {
      setSelectedId(conversations[0]!.id);
    }
  }, [conversations, selectedId, searchParams, isLg]);

  // Close the mobile details slide-over whenever the open conversation changes
  // (via a deep link or a just-created chat), so it never lingers over a
  // different thread. Safe: opening the panel does not change selectedId.
  React.useEffect(() => {
    if (!isLg) setMobileContextOpen(false);
  }, [selectedId, isLg]);

  const dealerId = conversation?.dealerId ?? null;
  const dealerQ = useQuery({
    queryKey: ['dealer', dealerId],
    queryFn: () => api.get<Dealer>(`/dealers/${dealerId}`),
    enabled: !!dealerId && contextOpen,
    retry: false,
  });

  const recordsQ = useDealerRecords(dealerId);
  const records = recordsQ.data ?? [];

  async function handleSend(payload: {
    body?: string;
    attachments: Attachment[];
  }) {
    if (!conversation) return;
    // An optimistic (tmp-) id can't be replied to server-side; skip the quote.
    const reply = replyTo && !replyTo.id.startsWith('tmp-') ? replyTo : null;
    await sendMessage.mutateAsync({
      conversationId: conversation.id,
      body: payload.body,
      attachments: payload.attachments,
      ...(reply
        ? { replyToMessageId: reply.id, replyTo: buildReplyContext(reply) }
        : {}),
    });
    setReplyTo(null);
  }

  function handlePickUp() {
    if (!conversation) return;
    assignConv.mutate({ conversationId: conversation.id });
  }
  function handleTakeOver() {
    if (!conversation) return;
    // No admin picker yet — this claims the ticket for the current admin.
    assignConv.mutate({ conversationId: conversation.id });
  }
  function handleReopen() {
    if (!conversation) return;
    reopenConv.mutate(conversation.id);
  }

  return (
    <div className="-m-4 flex h-full md:-m-6">
      {/* Left rail */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="px-4 py-3">
          <h2 className="text-sm font-semibold text-text">Inbox</h2>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          <ul className="flex flex-col gap-0.5">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              const count = countMap[f.key];
              return (
                <li key={f.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setFilter(f.key);
                      setSelectedId(null);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium',
                      active
                        ? 'bg-brand-soft text-brand'
                        : 'text-text-muted hover:bg-surface-2 hover:text-text',
                    )}
                  >
                    <span>{f.label}</span>
                    {typeof count === 'number' ? (
                      <span
                        className={cn(
                          'inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs',
                          active
                            ? 'bg-brand text-text-inverse'
                            : 'bg-surface-2 text-text-muted',
                        )}
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Conversation list — full-width on mobile, hidden once a chat is open */}
      <section
        className={cn(
          'w-full shrink-0 flex-col border-r border-border bg-surface md:flex md:w-80',
          selectedId ? 'hidden' : 'flex',
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-text">
            {FILTERS.find((f) => f.key === filter)?.label}
          </h3>
          <div className="flex items-center gap-2">
            {conversationsQ.isFetching ? <Spinner size={14} /> : null}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setNewOpen(true)}
              leftIcon={<Plus width={14} height={14} strokeWidth={1.75} />}
            >
              New
            </Button>
          </div>
        </div>
        {/* Mobile filter chips (the desktop filter rail is hidden < md) */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const count = countMap[f.key];
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setFilter(f.key);
                  setSelectedId(null);
                }}
                className={cn(
                  'flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium md:min-h-0',
                  active
                    ? 'bg-brand text-text-inverse'
                    : 'bg-surface-2 text-text-muted',
                )}
              >
                {f.label}
                {typeof count === 'number' ? <span>· {count}</span> : null}
              </button>
            );
          })}
        </div>
        <ul className="flex-1 overflow-y-auto">
          {conversationsQ.isLoading ? (
            <li className="flex items-center justify-center py-8">
              <Spinner size={18} />
            </li>
          ) : conversations.length === 0 ? (
            <li>
              <EmptyState
                icon={<Inbox width={28} height={28} strokeWidth={1.5} />}
                title="No conversations"
                description="Nothing in this list right now."
              />
            </li>
          ) : (
            groupByDealer(conversations).map((group) => (
              <li key={group.dealerId}>
                <div className="sticky top-0 z-[1] bg-surface-2/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted backdrop-blur">
                  <span className="font-mono">{group.dealerCode}</span>
                </div>
                <ul>
                  {group.items.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => openConversation(c.id)}
                        className={cn(
                          'flex min-h-11 w-full items-start gap-2 border-b border-border px-4 py-3 text-left',
                          selectedId === c.id
                            ? 'bg-surface-2'
                            : 'hover:bg-surface-2/60',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-text">
                              {memberLabel(c)}
                            </span>
                            <span className="shrink-0 text-xs text-text-subtle">
                              {formatRelative(c.lastMessageAt ?? c.updatedAt)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            {priorityPill(c.priority)}
                            <TicketFlagBadge conversation={c} now={now} />
                            <p className="min-w-0 flex-1 truncate text-sm text-text-muted">
                              {c.lastMessagePreview ?? 'No messages yet'}
                            </p>
                          </div>
                        </div>
                        {c.unreadByAdmin ? (
                          <span
                            aria-label="Unread"
                            className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-brand"
                          />
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Active chat — full-screen on mobile once a conversation is selected */}
      <section
        className={cn(
          'min-w-0 flex-1 flex-col bg-bg md:flex',
          selectedId ? 'flex' : 'hidden',
        )}
      >
        {!conversation ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={
                <MessageSquare width={36} height={36} strokeWidth={1.5} />
              }
              title="Select a conversation"
              description="Choose a conversation from the list to view messages."
            />
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-3 py-3 md:px-4">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileContextOpen(false);
                    closeConversation();
                  }}
                  aria-label="Back to conversations"
                  className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 md:hidden"
                >
                  <ChevronLeft width={20} height={20} strokeWidth={1.75} />
                </button>
                <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-semibold text-text">
                    {memberLabel(conversation)}
                  </h2>
                  {statusBadge(conversation.status)}
                  <TicketFlagBadge conversation={conversation} now={now} />
                </div>
                <p className="truncate text-xs text-text-muted">
                  {dealerCodeLabel(conversation.dealerCode)}
                  {conversation.assignedAdminName
                    ? ` · Assigned to ${conversation.assignedAdminName}`
                    : null}
                </p>
                </div>
              </div>
              {/* Mobile action cluster: one primary by status + details + a
                  kebab holding the rest (Take over / Upload report). */}
              <div className="flex items-center gap-1 md:hidden">
                {conversation.status === 'OPEN' ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handlePickUp}
                    loading={assignConv.isPending}
                    leftIcon={
                      <UserPlus width={14} height={14} strokeWidth={1.75} />
                    }
                  >
                    Pick up
                  </Button>
                ) : null}
                {conversation.status === 'ASSIGNED' ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setResolveOpen(true)}
                    loading={resolveConv.isPending}
                    leftIcon={
                      <CheckCircle2 width={14} height={14} strokeWidth={1.75} />
                    }
                  >
                    Resolve
                  </Button>
                ) : null}
                {conversation.status === 'RESOLVED' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleReopen}
                    loading={reopenConv.isPending}
                    leftIcon={
                      <RotateCcw width={14} height={14} strokeWidth={1.75} />
                    }
                  >
                    Reopen
                  </Button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setMobileContextOpen(true)}
                  aria-label="Show details"
                  className="flex h-11 w-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text"
                >
                  <Info width={18} height={18} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => setThreadMenuOpen(true)}
                  aria-label="More actions"
                  aria-expanded={threadMenuOpen}
                  className="flex h-11 w-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text"
                >
                  <MoreVertical width={18} height={18} strokeWidth={1.75} />
                </button>
              </div>

              {/* Desktop action row: the full inline set (unchanged). */}
              <div className="hidden flex-wrap items-center justify-end gap-2 md:flex">
                {conversation.status === 'OPEN' ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handlePickUp}
                    loading={assignConv.isPending}
                    leftIcon={
                      <UserPlus width={14} height={14} strokeWidth={1.75} />
                    }
                  >
                    Pick up
                  </Button>
                ) : null}
                {conversation.status === 'ASSIGNED' ? (
                  <>
                    {conversation.assignedAdminId !== currentUserId ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleTakeOver}
                        loading={assignConv.isPending}
                        leftIcon={
                          <UserPlus width={14} height={14} strokeWidth={1.75} />
                        }
                      >
                        Take over
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setResolveOpen(true)}
                      loading={resolveConv.isPending}
                      leftIcon={
                        <CheckCircle2
                          width={14}
                          height={14}
                          strokeWidth={1.75}
                        />
                      }
                    >
                      Resolve
                    </Button>
                  </>
                ) : null}
                {conversation.status === 'RESOLVED' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleReopen}
                    loading={reopenConv.isPending}
                    leftIcon={
                      <RotateCcw width={14} height={14} strokeWidth={1.75} />
                    }
                  >
                    Reopen
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setUploadOpen(true)}
                  leftIcon={
                    <FileUp width={14} height={14} strokeWidth={1.75} />
                  }
                >
                  Upload report
                </Button>
                <button
                  type="button"
                  onClick={() => setMobileContextOpen(true)}
                  aria-label="Show details"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text lg:hidden"
                >
                  <Info width={18} height={18} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => setContextOpen((v) => !v)}
                  aria-label={contextOpen ? 'Hide context' : 'Show context'}
                  className="hidden rounded-md p-1.5 text-text-muted hover:bg-surface-2 hover:text-text lg:inline-flex"
                >
                  {contextOpen ? (
                    <PanelRightClose
                      width={16}
                      height={16}
                      strokeWidth={1.75}
                    />
                  ) : (
                    <PanelRightOpen
                      width={16}
                      height={16}
                      strokeWidth={1.75}
                    />
                  )}
                </button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="min-h-0 flex-1">
                  {messagesQ.isLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <Spinner size={20} />
                    </div>
                  ) : (
                    <MessageList
                      key={conversation.id}
                      messages={messages}
                      currentUserId={currentUserId}
                      hasEarlier={messagesQ.hasNextPage}
                      loadingEarlier={messagesQ.isFetchingNextPage}
                      onLoadEarlier={messagesQ.fetchNextPage}
                      onReply={handleReply}
                      onToggleReaction={handleToggleReaction}
                      onOpenReactions={handleOpenReactions}
                      onOpenInfo={handleOpenInfo}
                    />
                  )}
                </div>
                <Composer
                  conversationId={conversation.id}
                  onSend={handleSend}
                  disabled={conversation.status === 'RESOLVED'}
                  replyingTo={composerReply}
                  onCancelReply={handleCancelReply}
                />
              </div>

              {(isLg && contextOpen) || (!isLg && mobileContextOpen) ? (
                <>
                  {!isLg ? (
                    <div
                      className="fixed inset-0 z-40 bg-black/40 lg:hidden"
                      onClick={() => setMobileContextOpen(false)}
                    />
                  ) : null}
                  <aside
                    className={cn(
                      'space-y-3 overflow-y-auto border-l border-border bg-surface p-3',
                      isLg
                        ? 'w-72 shrink-0'
                        : 'fixed inset-y-0 right-0 z-50 w-80 max-w-[85%] shadow-xl',
                    )}
                  >
                  {!isLg ? (
                    <div className="mb-1 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-text">Details</h3>
                      <button
                        type="button"
                        aria-label="Close details"
                        onClick={() => setMobileContextOpen(false)}
                        className="flex h-11 w-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 md:h-9 md:w-9"
                      >
                        <X width={18} height={18} strokeWidth={1.75} />
                      </button>
                    </div>
                  ) : null}
                  {isAdmin ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Ticket</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <Label htmlFor="ticket-priority">Priority</Label>
                          <Select
                            id="ticket-priority"
                            value={conversation.priority ?? 'normal'}
                            disabled={updateTicket.isPending}
                            onChange={(e) =>
                              updateTicket.mutate({
                                conversationId: conversation.id,
                                priority: e.target.value as TicketPriority,
                              })
                            }
                          >
                            {TICKET_PRIORITIES.map((p) => (
                              <option key={p} value={p}>
                                {PRIORITY_LABEL[p]}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="ticket-category">Category</Label>
                          <Select
                            id="ticket-category"
                            value={conversation.category ?? 'general'}
                            disabled={updateTicket.isPending}
                            onChange={(e) =>
                              updateTicket.mutate({
                                conversationId: conversation.id,
                                category: e.target.value as TicketCategory,
                              })
                            }
                          >
                            {TICKET_CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {titleCase(c)}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Dealer</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {dealerQ.isLoading ? (
                        <div className="flex justify-center py-4">
                          <Spinner size={16} />
                        </div>
                      ) : dealerQ.isError || !dealerQ.data ? (
                        <p className="text-xs text-text-muted">
                          Dealer details unavailable.
                        </p>
                      ) : (
                        <>
                          <div>
                            <p className="text-xs text-text-subtle">Code</p>
                            <p className="text-text">
                              {dealerQ.data.code ?? '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-text-subtle">Phone</p>
                            <p className="text-text">{dealerQ.data.phone ?? '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-text-subtle">Status</p>
                            <p className="text-text">{dealerQ.data.status}</p>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2">
                      <CardTitle className="text-sm">
                        Reports
                        {records.length > 0 ? (
                          <span className="ml-1.5 text-text-subtle">
                            {records.length}
                          </span>
                        ) : null}
                      </CardTitle>
                      <button
                        type="button"
                        onClick={() => setUploadOpen(true)}
                        aria-label="Upload report"
                        className="rounded-sm p-1 text-text-muted hover:bg-surface-2 hover:text-text"
                      >
                        <FileUp width={15} height={15} strokeWidth={1.75} />
                      </button>
                    </CardHeader>
                    <CardContent className="text-sm">
                      {recordsQ.isLoading ? (
                        <div className="flex justify-center py-3">
                          <Spinner size={16} />
                        </div>
                      ) : records.length === 0 ? (
                        <p className="text-xs text-text-muted">
                          No reports sent yet.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {records.map((r) => (
                            <li
                              key={r.id}
                              className="flex items-start gap-2"
                            >
                              <FileText
                                width={14}
                                height={14}
                                strokeWidth={1.75}
                                className="mt-0.5 shrink-0 text-text-muted"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-text">
                                  {r.title}
                                </p>
                                {r.periodLabel ? (
                                  <p className="truncate text-xs text-text-subtle">
                                    {r.periodLabel}
                                  </p>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>

                  <MediaGalleryCard conversationId={conversation.id} />
                  </aside>
                </>
              ) : null}
            </div>

            {dealerId ? (
              <UploadRecordDialog
                open={uploadOpen}
                onClose={() => setUploadOpen(false)}
                dealerId={dealerId}
                dealerCode={conversation.dealerCode}
                conversationId={conversation.id}
              />
            ) : null}

            <ReactionsDialog
              message={reactionsMessage}
              conversation={conversation}
              currentUserId={currentUserId}
              onRemove={handleToggleReaction}
              onClose={() => setReactionsForId(null)}
            />

            <MessageInfoDialog
              message={infoMessage}
              conversation={conversation}
              onClose={() => setInfoForId(null)}
            />

            <ResolveConversationDialog
              open={resolveOpen}
              onClose={() => setResolveOpen(false)}
              services={servicesQ.data ?? []}
              servicesLoading={servicesQ.isLoading}
              pending={resolveConv.isPending}
              onResolve={async (values) => {
                await resolveConv.mutateAsync({
                  conversationId: conversation.id,
                  ...values,
                });
                setResolveOpen(false);
              }}
            />

            {/* Mobile-only overflow actions moved out of the thread header. */}
            <Sheet
              open={threadMenuOpen}
              onClose={() => setThreadMenuOpen(false)}
              title="Actions"
            >
              {conversation.status === 'ASSIGNED' &&
              conversation.assignedAdminId !== currentUserId ? (
                <SheetItem
                  icon={<UserPlus width={20} height={20} strokeWidth={1.75} />}
                  onClick={() => {
                    setThreadMenuOpen(false);
                    handleTakeOver();
                  }}
                >
                  Take over
                </SheetItem>
              ) : null}
              <SheetItem
                icon={<FileUp width={20} height={20} strokeWidth={1.75} />}
                onClick={() => {
                  setThreadMenuOpen(false);
                  setUploadOpen(true);
                }}
              >
                Upload report
              </SheetItem>
            </Sheet>
          </>
        )}
      </section>

      <NewConversationDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onStarted={handleStarted}
      />
    </div>
  );
}
