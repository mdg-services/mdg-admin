import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  FileText,
  FileUp,
  Flag,
  Inbox,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  UserPlus,
} from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Composer } from '@/features/chat/Composer';
import { MessageList } from '@/features/chat/MessageList';
import { NewConversationDialog } from '@/features/chat/NewConversationDialog';
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
import { useReopenConversation } from '@/hooks/api/useReopenConversation';
import { useResolveConversation } from '@/hooks/api/useResolveConversation';
import { useSendMessage } from '@/hooks/api/useSendMessage';
import { useServicesQuery } from '@/hooks/api/useServices';
import { useUpdateTicket } from '@/hooks/api/useUpdateTicket';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Intent } from '@/lib/statusIntent';
import { useAuthStore } from '@/store/auth';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, ticketFlagLevel } from '@dk/shared';
import type {
  Attachment,
  Conversation,
  Dealer,
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
  dealerName: string;
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
        dealerName: c.dealerName ?? 'Dealer',
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
  const deepLinkId = searchParams.get('c');

  const [filter, setFilter] = React.useState<InboxFilter>(deepLinkId ? 'all' : 'mine');
  const [selectedId, setSelectedId] = React.useState<string | null>(deepLinkId);
  const [contextOpen, setContextOpen] = React.useState(true);
  const [newOpen, setNewOpen] = React.useState(false);

  // Ticks once a minute so the reply-SLA flag colours advance on their own,
  // without waiting for new data to arrive.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Honour later `?c=` changes (in-session navigation) too, then strip the param
  // so refresh/back doesn't re-trigger it.
  React.useEffect(() => {
    const c = searchParams.get('c');
    if (!c) return;
    setSelectedId(c);
    setFilter('all');
    const next = new URLSearchParams(searchParams);
    next.delete('c');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  function handleStarted(conversationId: string) {
    setFilter('all');
    setSelectedId(conversationId);
  }

  const conversationsQ = useConversations(filter);
  const conversations = conversationsQ.data ?? [];

  const selectedQ = useConversation(selectedId);
  const conversation = selectedQ.data ?? null;

  const messagesQ = useMessages(selectedId);
  const { markRead } = useConversationSocket(selectedId);
  const messages = React.useMemo(
    () => (messagesQ.data?.pages ?? []).flat(),
    [messagesQ.data],
  );

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
    if (searchParams.get('c')) return;
    if (!selectedId && conversations.length > 0) {
      setSelectedId(conversations[0]!.id);
    }
  }, [conversations, selectedId, searchParams]);

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
    await sendMessage.mutateAsync({
      conversationId: conversation.id,
      body: payload.body,
      attachments: payload.attachments,
    });
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
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] md:-m-6">
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

      {/* Conversation list */}
      <section className="hidden w-80 shrink-0 flex-col border-r border-border bg-surface md:flex">
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
                  {group.dealerName}
                </div>
                <ul>
                  {group.items.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={cn(
                          'flex w-full items-start gap-2 border-b border-border px-4 py-3 text-left',
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

      {/* Active chat */}
      <section className="flex min-w-0 flex-1 flex-col bg-bg">
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
            <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-semibold text-text">
                    {memberLabel(conversation)}
                  </h2>
                  {statusBadge(conversation.status)}
                  <TicketFlagBadge conversation={conversation} now={now} />
                </div>
                <p className="truncate text-xs text-text-muted">
                  {conversation.dealerName ?? 'Dealer'}
                  {conversation.assignedAdminName
                    ? ` · Assigned to ${conversation.assignedAdminName}`
                    : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
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
                      messages={messages}
                      currentUserId={currentUserId}
                    />
                  )}
                </div>
                <Composer
                  conversationId={conversation.id}
                  onSend={handleSend}
                  disabled={conversation.status === 'RESOLVED'}
                />
              </div>

              {contextOpen ? (
                <aside className="hidden w-72 shrink-0 space-y-3 overflow-y-auto border-l border-border bg-surface p-3 lg:block">
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
                            <p className="text-xs text-text-subtle">Name</p>
                            <p className="text-text">
                              {dealerQ.data.name ?? '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-text-subtle">Code</p>
                            <p className="text-text">
                              {dealerQ.data.code ?? '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-text-subtle">Phone</p>
                            <p className="text-text">{dealerQ.data.phone}</p>
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
                </aside>
              ) : null}
            </div>

            {dealerId ? (
              <UploadRecordDialog
                open={uploadOpen}
                onClose={() => setUploadOpen(false)}
                dealerId={dealerId}
                dealerName={conversation.dealerName ?? undefined}
                conversationId={conversation.id}
              />
            ) : null}

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
