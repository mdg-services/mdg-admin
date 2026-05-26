import type { Attachment, Conversation, Dealer } from '@dk/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Inbox,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  UserPlus,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { useInboxSocket } from '@/features/chat/useInboxSocket';
import { useConversationSocket } from '@/features/chat/useConversationSocket';
import { Composer } from '@/features/chat/Composer';
import { MessageList } from '@/features/chat/MessageList';
import { useAssignConversation } from '@/hooks/api/useAssignConversation';
import { useConversation } from '@/hooks/api/useConversation';
import {
  type InboxFilter,
  useConversations,
} from '@/hooks/api/useConversations';
import { useMessages } from '@/hooks/api/useMessages';
import { useReopenConversation } from '@/hooks/api/useReopenConversation';
import { useResolveConversation } from '@/hooks/api/useResolveConversation';
import { useSendMessage } from '@/hooks/api/useSendMessage';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth';

const FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: 'open', label: 'Unassigned' },
  { key: 'mine', label: 'Mine' },
  { key: 'assigned', label: 'All open' },
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

export function InboxPage() {
  useInboxSocket();

  const user = useAuthStore((s) => s.user);
  const admin = useAuthStore((s) => s.admin);
  const currentUserId = user?.id ?? admin?.id ?? '';

  const [filter, setFilter] = React.useState<InboxFilter>('mine');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [contextOpen, setContextOpen] = React.useState(true);

  const conversationsQ = useConversations(filter);
  const conversations = conversationsQ.data ?? [];

  const selectedQ = useConversation(selectedId);
  const conversation = selectedQ.data ?? null;

  const messagesQ = useMessages(selectedId);
  useConversationSocket(selectedId);
  const messages = React.useMemo(
    () => (messagesQ.data?.pages ?? []).flat(),
    [messagesQ.data],
  );

  const sendMessage = useSendMessage();
  const assignConv = useAssignConversation();
  const resolveConv = useResolveConversation();
  const reopenConv = useReopenConversation();

  // Lightweight counts per filter for the rail.
  const openQ = useConversations('open');
  const mineQ = useConversations('mine');
  const assignedQ = useConversations('assigned');
  const resolvedQ = useConversations('resolved');
  const countMap: Record<InboxFilter, number | undefined> = {
    open: openQ.data?.length,
    mine: mineQ.data?.length,
    assigned: assignedQ.data?.length,
    resolved: resolvedQ.data?.length,
  };

  // Auto-select first conversation when list loads and nothing selected.
  React.useEffect(() => {
    if (!selectedId && conversations.length > 0) {
      setSelectedId(conversations[0]!.id);
    }
  }, [conversations, selectedId]);

  const dealerId = conversation?.dealerId ?? null;
  const dealerQ = useQuery({
    queryKey: ['dealer', dealerId],
    queryFn: () => api.get<Dealer>(`/dealers/${dealerId}`),
    enabled: !!dealerId && contextOpen,
    retry: false,
  });

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
  function handleReassign() {
    if (!conversation) return;
    // No admin picker yet — pick-up reassigns to self.
    assignConv.mutate({ conversationId: conversation.id });
  }
  function handleResolve() {
    if (!conversation) return;
    resolveConv.mutate(conversation.id);
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
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-text">
            {FILTERS.find((f) => f.key === filter)?.label}
          </h3>
          {conversationsQ.isFetching ? <Spinner size={14} /> : null}
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
            conversations.map((c) => (
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
                        {c.dealerName ?? 'Dealer'}
                      </span>
                      <span className="shrink-0 text-xs text-text-subtle">
                        {formatRelative(c.lastMessageAt ?? c.updatedAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-text-muted">
                      {c.lastMessagePreview ?? 'No messages yet'}
                    </p>
                  </div>
                  {c.unreadByAdmin ? (
                    <span
                      aria-label="Unread"
                      className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-brand"
                    />
                  ) : null}
                </button>
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
                    {conversation.dealerName ?? 'Dealer'}
                  </h2>
                  {statusBadge(conversation.status)}
                </div>
                {conversation.assignedAdminName ? (
                  <p className="text-xs text-text-muted">
                    Assigned to {conversation.assignedAdminName}
                  </p>
                ) : null}
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
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleReassign}
                      loading={assignConv.isPending}
                      leftIcon={
                        <UserPlus width={14} height={14} strokeWidth={1.75} />
                      }
                    >
                      Reassign
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleResolve}
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
                <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-border bg-surface p-3 lg:block">
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
                </aside>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
