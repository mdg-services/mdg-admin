import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Info,
  KeyRound,
  MessageSquare,
  MoreHorizontal,
  MoreVertical,
  Phone,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Store,
  UserPlus,
  Video,
  Zap,
} from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ActionRow } from '@/components/ui/ActionRow';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { HowThisWorks } from '@/components/ui/HowThisWorks';
import { IconButton } from '@/components/ui/IconButton';
import { Label } from '@/components/ui/Label';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';
import { Select } from '@/components/ui/Select';
import { Sheet, SheetItem } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { AiFirstLineLog } from '@/features/chat/AiFirstLineStrip';
import { AiQuietLine } from '@/features/chat/AiQuietLine';
import { AskPortalLoginDialog } from '@/features/chat/AskPortalLoginDialog';
import { Composer, type ComposerInsert } from '@/features/chat/Composer';
import {
  ConversationListSkeleton,
  ConversationRow,
  InboxViews,
  MoreViewsMenu,
  PRIORITY_LABEL,
  TicketFlagBadge,
  roleLabel,
} from '@/features/chat/InboxList';
import { MediaGalleryCard } from '@/features/chat/MediaGalleryCard';
import { MessageInfoDialog } from '@/features/chat/MessageInfoDialog';
import { MessageList } from '@/features/chat/MessageList';
import { NewConversationDialog } from '@/features/chat/NewConversationDialog';
import { OpenRequestsCard } from '@/features/chat/OpenRequestsCard';
import { PanelSection } from '@/features/chat/PanelSection';
import { ReactionsDialog } from '@/features/chat/ReactionsDialog';
import {
  type AskActionTarget,
  ReceiveAskDialog,
} from '@/features/chat/ReceiveAskDialog';
import {
  buildReplyContext,
  replyPreviewText,
  replySenderLabel,
} from '@/features/chat/replyPreview';
import { ResolveConversationDialog } from '@/features/chat/ResolveConversationDialog';
import { SendBackAskDialog } from '@/features/chat/SendBackAskDialog';
import { SendGuideVideoDialog } from '@/features/chat/SendGuideVideoDialog';
import {
  readSideTab,
  type SideTab,
  ThreadSidePanel,
  writeSideTab,
} from '@/features/chat/ThreadSidePanel';
import { TicketHistory, TicketStrip } from '@/features/chat/TicketStrip';
import { useConversationSocket } from '@/features/chat/useConversationSocket';
import { useInboxSocket } from '@/features/chat/useInboxSocket';
import {
  ReplyHelperPane,
  type ReplyHelperSuggestRequest,
} from '@/features/replyHelper/ReplyHelperPane';
import {
  useClearAiGuard,
  useConversationAiTurnsQuery,
} from '@/hooks/api/useAiTurns';
import { useAssignConversation } from '@/hooks/api/useAssignConversation';
import { useDealerOpenRequestsQuery } from '@/hooks/api/useChatAsks';
import { useConversation } from '@/hooks/api/useConversation';
import {
  type InboxFilter,
  useConversationCounts,
  useConversations,
} from '@/hooks/api/useConversations';
import { useMessages } from '@/hooks/api/useMessages';
import { useReactToMessage } from '@/hooks/api/useReactToMessage';
import { useReopenConversation } from '@/hooks/api/useReopenConversation';
import {
  usePendingReplyHelperAsk,
  useReplyHelperThread,
} from '@/hooks/api/useReplyHelper';
import { useResolveConversation } from '@/hooks/api/useResolveConversation';
import { useSendMessage } from '@/hooks/api/useSendMessage';
import { useServicesQuery } from '@/hooks/api/useServices';
import { useShareToOutlet } from '@/hooks/api/useShareToOutlet';
import { useThreadTicketsQuery } from '@/hooks/api/useTickets';
import { useUpdateTicket } from '@/hooks/api/useUpdateTicket';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { usePublishBottomBar } from '@/hooks/usePublishBottomBar';
import { useSafeBack } from '@/hooks/useSafeBack';
import { ApiError, api } from '@/lib/api';
import {
  countRequests,
  mdgRepliedMessageIds,
  pendingAnswersByMessage,
  statusByRef,
} from '@/lib/chatAsk';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth';
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  aiThreadGuard,
  aiTurnAge,
  dealerCodeLabel,
  describeShareRecipients,
} from '@dk/shared';
import type {
  AiThreadGuardView,
  Attachment,
  Conversation,
  Dealer,
  DealerOpenRequest,
  Message,
  ReplyHelperTarget,
  ShareAudience,
  TicketCategory,
  TicketPriority,
} from '@dk/shared';

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: 'open', label: 'Unassigned' },
  { key: 'mine', label: 'Mine' },
  { key: 'all', label: 'All open' },
  { key: 'resolved', label: 'Resolved' },
  // Tickets the 20-minute sweep pulled back out of somebody's hands after they
  // missed the reply SLA — nobody is assigned to these any more, so nobody is
  // answering them.
  //
  // Everything else for this tab already existed: `flagged` is in `InboxFilter`,
  // `GET /conversations?status=flagged` answers it, and `useConversationCounts`
  // already fetches the number into `countMap`. Only the tab was missing, which
  // meant `inboxLens('flagged')` rejected the value and every `?lens=flagged`
  // link in the product silently landed on "Mine" instead.
  { key: 'flagged', label: 'Dropped' },
  // The threads where the AI gave up on a question and a person has not yet
  // closed the ticket it raised. A lens like the two below, and for the same
  // reason nothing moves into it or out of another tab — but it is not a subset
  // of Unassigned: a ticket stays open however the conversation moves, so a
  // thread somebody has picked up, answered, even resolved, is still listed
  // here until its ticket is resolved with a note. Placed before the AI lenses
  // because it is the one that is somebody's job today; the five tabs before it
  // keep their positions.
  { key: 'tickets', label: 'Tickets' },
  // A LENS OVER "Unassigned", not a fifth pile. Every row here is also in
  // Unassigned and in All open, and its `status` is the same `OPEN` it always
  // was — the tab only narrows the same query to the threads the AI first line
  // has said something on. Deliberately last, so the four tabs the team has used
  // for a year keep their positions and their muscle memory.
  { key: 'ai', label: 'AI' },
  // A SECOND lens, on the same argument as the first: the threads where somebody
  // tried to plant a figure in MDG's mouth or read the system instruction back
  // out. Nothing moves into it and nothing leaves another tab to be in it.
  //
  // It is NOT the Flagged tab above. Flagged means an assigned ticket missed its
  // reply SLA and is cleared by pickup, by any admin reply, by resolve and by
  // reopen — right for an operational alarm, and catastrophic for
  // a security observation, because it would mean ANSWERING THE DEALER silently
  // erases the record. This one is cleared by exactly one thing: a super-admin
  // pressing Clear on the thread.
  { key: 'ai-guard', label: 'AI guard' },
];

/**
 * The three views the team lives in, as the list's segmented control; the
 * other five sit behind its "More". They used to be a 224px column of their
 * own, and at a laptop's width that column was most of what the open chat lost.
 */
const PRIMARY_VIEWS: InboxFilter[] = ['open', 'mine', 'all'];

/**
 * The thread's guard mark, as the banner and the AI log tab's dot show it.
 *
 * The turn log says what the guard caught and when, but Clear removes the MARK
 * (`ai.abuse`, which no payload carries — see the banner's note), not the turn
 * that recorded it. Read off the turns alone, the banner outlived its own Clear
 * and a second press was a 400. The guard lens is the server's own list of the
 * marked threads, so a thread missing from it has been cleared. It is fetched
 * again whenever a thread with a hit is opened or catches a new one, so a fresh
 * hit shows the moment the server lists it. A resolved thread is outside the
 * lens altogether, and so is a lens that failed to load: there the turns
 * alone still decide.
 */
function useThreadGuard(conversation: Conversation | null): AiThreadGuardView | null {
  // The SAME query key the AI log uses, so react-query serves both from one
  // cache entry and one request.
  const turnsQ = useConversationAiTurnsQuery(conversation?.id ?? null);
  const guard = aiThreadGuard(turnsQ.data?.items);
  const lens = useConversations('ai-guard', { enabled: !!guard });
  const hitKey = conversation && guard ? `${conversation.id}|${guard.at}` : null;
  const { refetch, isFetching } = lens;
  React.useEffect(() => {
    if (hitKey && !isFetching) void refetch();
    // Once per thread and hit, not on every fetch it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitKey]);
  if (!conversation || !guard) return null;
  if (conversation.status === 'RESOLVED' || lens.isError) return guard;
  if (!lens.data) return null;
  return lens.data.some((c) => c.id === conversation.id) ? guard : null;
}

/**
 * The guard banner over the composer: somebody tried, on this thread, to plant a
 * figure in MDG's mouth or to read the system instruction back out.
 *
 * HERE, above the composer, because this is where the admin is standing when
 * they decide what to write back — and what to write back is the whole of the
 * response. THERE IS NO AUTOMATIC SANCTION OF ANY KIND behind this: no block, no
 * rate cut, no mode change. A dealer is a paying customer, and one injection
 * attempt is a curious pump owner poking at something new.
 *
 * THE DEALER SEES NOTHING DIFFERENT, EVER. Every input-guard block produces the
 * same warm line as "the vendor was slow", for the reason the templates state: a
 * probe that gets a different sentence for "the guard blocked you" and "the
 * vendor was slow" has been handed a map of the guards. Said out loud on the
 * banner, because the first question an admin asks is what the dealer was told.
 *
 * READ OFF THE TURN LOG, NOT OFF THE CONVERSATION, and that is not a shortcut.
 * `Conversation.ai.abuse` is deliberately never serialized to anybody —
 * `conversationToPublic` feeds the DEALER's app as well as this one, and telling
 * somebody they have been marked is unkind and a map of the guards. The turn log
 * is admin-only, it carries the rule names, and this component shares the query
 * key the strip below already uses, so it costs no extra request.
 *
 * THE COST OF THAT, STATED: the inbox LIST cannot draw a per-row mark, because
 * list rows carry no turns. Finding a marked thread is the 🛡 AI guard lens's
 * job, which is a server-side filter on the real counter and is therefore the
 * authority. This banner explains a thread; the lens finds one.
 *
 * CLEARING IS SUPER-ADMIN AND IS THE ONLY THING THAT CLEARS IT. Replying does
 * not, resolving does not, reopening does not — which is the entire reason the
 * mark lives on `ai.abuse` and not on `Conversation.flagged`, where answering
 * the dealer would silently erase it. Whether the mark still stands is
 * `useThreadGuard`'s question, below.
 */
function AiGuardBanner({
  conversationId,
  guard,
  now,
}: {
  conversationId: string;
  guard: AiThreadGuardView | null;
  /** The page's one-minute tick, so this age advances with every other one. */
  now: number;
}) {
  const isSuperAdmin = useIsSuperAdmin();
  const clear = useClearAiGuard();
  const toast = useToast();
  const [explainOpen, setExplainOpen] = React.useState(false);
  const explainId = React.useId();
  // The band over the messages scrolls inside itself, and an explanation that
  // opened below its edge read as one cut line. `nearest` moves the band, and
  // only as far as the text needs.
  const explainRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (explainOpen) explainRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [explainOpen]);
  if (!guard) return null;
  return (
    // `danger-soft` is a fixed light shade: on the dark theme it put light text
    // on a pale band, so dark mode takes a deep tint of the hue instead.
    <div className="shrink-0 border-b border-danger/20 bg-danger-soft/50 px-4 py-2 dark:bg-danger/15">
      <div className="flex flex-wrap items-start gap-2">
        <ShieldAlert
          width={16}
          height={16}
          strokeWidth={2}
          aria-hidden
          className="mt-0.5 shrink-0 text-danger-strong dark:text-red-300"
        />
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge intent={guard.tone}>{guard.label}</Badge>
            {/* `aiTurnAge` and not a phrasing of our own: the same "5m / 3h /
                2d / Jul 01" ladder every other age on the AI surface uses, and
                it refuses to print a negative one when a phone's clock runs a
                minute ahead of the server's. */}
            <span className="text-xs tabular-nums text-text-muted">
              {aiTurnAge(guard.at, now)}
            </span>
            {/* What tripped it, on the badge's own row: the banner stays one
                line in the band over the messages. */}
            {guard.labels.length > 0 ? (
              <span className="min-w-0 max-w-full truncate text-sm text-text" title={guard.labels.join(', ')}>
                {guard.labels.join(', ')}
              </span>
            ) : null}
            {/* The explanation is folded behind this, on the badge's own row,
                at every width. `-my-2.5` keeps the row its 24px while the
                button keeps a 44px target below md; at md the button is 16px
                and the margin would pull the opened text up under it. */}
            <button
              type="button"
              aria-expanded={explainOpen}
              aria-controls={explainId}
              onClick={() => setExplainOpen((v) => !v)}
              className="-my-2.5 ml-1 flex min-h-11 items-center gap-1 text-xs font-medium text-text-muted md:my-0 md:min-h-0"
            >
              <ChevronRight
                width={14}
                height={14}
                strokeWidth={1.75}
                aria-hidden
                className={cn(
                  'shrink-0 transition-transform',
                  explainOpen && 'rotate-90',
                )}
              />
              What this means
            </button>
          </div>

          {/* One tap away at every width. The mark is never cleared by
              replying, so the banner stays for the life of the thread: drawn
              whole, it took ~190px of the band pinned over the messages. */}
          <div
            id={explainId}
            ref={explainRef}
            className={cn(explainOpen ? 'grid' : 'hidden', 'gap-1')}
          >
            <p className="text-xs text-text-muted">{guard.hint}</p>
            <p className="text-xs text-text-muted">
              The dealer was told nothing different — they got the same warm line as
              a busy day.
            </p>
          </div>
        </div>
        {isSuperAdmin ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={clear.isPending}
            onClick={() =>
              clear.mutate(conversationId, {
                onSuccess: () => toast.success('Cleared'),
                onError: (err) =>
                  toast.error(
                    err instanceof Error ? err.message : 'Could not clear it',
                  ),
              })
            }
          >
            Clear
          </Button>
        ) : (
          <span className="shrink-0 self-center text-xs text-text-muted">
            A super-admin clears this.
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * A `?lens=` parameter as a tab, or `null` for anything this build does not
 * recognise.
 *
 * Validated against `FILTERS` rather than cast, because an unknown value would
 * otherwise reach `GET /conversations?status=…` — which does not reject it, it
 * simply matches no branch and returns EVERY conversation. A typo in a pasted
 * link would look like the guard lens holding the whole inbox.
 */
function inboxLens(value: string | null): InboxFilter | null {
  const hit = FILTERS.find((f) => f.key === value);
  return hit ? hit.key : null;
}

/**
 * Where the conversation stands, in words, on the header's second line. A
 * coloured "Open" pill beside the name used to push the name itself out of a
 * 430px header; the action button beside it (Pick up / Resolve chat / Reopen)
 * already carries the state, so the words here are the quieter half.
 */
function statusWords(c: Conversation, meId: string): string {
  if (c.status === 'RESOLVED') return 'Resolved';
  if (c.status === 'ASSIGNED') {
    if (c.assignedAdminId && c.assignedAdminId === meId) return 'With you';
    return c.assignedAdminName ? `With ${c.assignedAdminName}` : 'Picked up';
  }
  return 'Not picked up';
}

/**
 * The outlet behind the chat, in the side panel's Details tab: the code opens
 * the dealer, the number rings it, and the dealer's Daily Sales Report is one
 * tap away.
 *
 * Most of what a dealer asks in chat is about their own records ("22 tarikh ka
 * DSR bhejo"), and from a thread there was no way to them: Code and Phone were
 * dead text, the number could not even be long-pressed (`#root` is
 * `user-select: none`), and sending a report meant backing out, finding the
 * outlet under More, and finding the thread again — about eight taps. Below lg
 * the thread lives in the URL (`?c=<id>`), so Back from any of these returns to
 * it. Links at every width now: a desk wants the same shortcuts.
 */
function OutletFacts({ dealer }: { dealer: Dealer }) {
  const linkClass =
    'inline-flex min-h-11 items-center gap-1.5 font-medium text-brand underline-offset-2 hover:underline md:min-h-0';
  return (
    <dl className="grid grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2">
      <dt className="text-xs text-text-muted">Code</dt>
      <dd className="min-w-0">
        <Link to={`/dealers/${dealer.id}`} className={linkClass}>
          <Store width={14} height={14} strokeWidth={1.75} aria-hidden />
          <span className="break-words font-mono">{dealer.code ?? '-'}</span>
        </Link>
      </dd>
      <dt className="text-xs text-text-muted">Phone</dt>
      <dd className="min-w-0">
        {dealer.phone ? (
          // `select-text` as well as the link: the shell allows long-press Copy
          // only on that class, and a number is as often copied as rung.
          <a
            href={`tel:${dealer.phone.replace(/[^\d+]/g, '')}`}
            className={cn(linkClass, 'select-text tabular-nums')}
          >
            <Phone width={14} height={14} strokeWidth={1.75} aria-hidden />
            {dealer.phone}
          </a>
        ) : (
          <span className="text-text-muted">-</span>
        )}
      </dd>
      <dt className="text-xs text-text-muted">Status</dt>
      <dd className="text-text">{titleCase(dealer.status.toLowerCase())}</dd>
      <dt className="text-xs text-text-muted">Reports</dt>
      <dd className="min-w-0">
        <Link to={`/dsr/dealers/${dealer.id}`} className={linkClass}>
          <FileText width={14} height={14} strokeWidth={1.75} aria-hidden />
          Daily Sales Report
        </Link>
      </dd>
    </dl>
  );
}

/**
 * The reply box, with the Reply helper's one-tap Suggest on it. A component of
 * its own because the helper's hooks need the open conversation, and the page
 * draws this only when there is one.
 */
function ThreadComposer({
  conversationId,
  onSuggest,
  ...rest
}: Omit<React.ComponentProps<typeof Composer>, 'onSuggest' | 'suggesting'> & {
  onSuggest: () => void;
}) {
  const target = React.useMemo<ReplyHelperTarget>(
    () => ({ channel: 'app', conversationId }),
    [conversationId],
  );
  const threadQ = useReplyHelperThread(target);
  const pending = usePendingReplyHelperAsk(target);
  const notConfigured = !!threadQ.data?.context.notices.some((n) => n.kind === 'not_configured');
  return (
    <Composer
      {...rest}
      conversationId={conversationId}
      onSuggest={notConfigured ? undefined : onSuggest}
      suggesting={pending !== null}
    />
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

  // `/inbox?lens=ai-guard` — the way in from the AI answers page. A thread wins
  // over a lens: a link to one conversation is always more specific than a link
  // to a list.
  const [filter, setFilter] = React.useState<InboxFilter>(
    deepLinkId ? 'all' : (inboxLens(searchParams.get('lens')) ?? 'mine'),
  );
  const [selectedId, setSelectedId] = React.useState<string | null>(deepLinkId);
  // The thread the PAGE opened on its own (the first row, on a desktop), as
  // opposed to one an admin chose. A ticket is stamped "seen" only for a thread
  // somebody opened: the dealer's bubble then says "MDG team is looking at it",
  // and an inbox that merely loaded must not say that on their behalf.
  const [autoPickedId, setAutoPickedId] = React.useState<string | null>(null);
  // `/inbox?c=<id>&ticket=<id>` — the way in from the Tickets page, an alert or
  // a Today row. Read off the URL on every render, not copied into state, so a
  // second link followed while the inbox is already open still lands.
  const focusTicketId = searchParams.get('ticket');
  // The side panel as an inline column (≥ 1280px), shown by default; and which
  // of its tabs is up, remembered for this browser.
  const [contextOpen, setContextOpen] = React.useState(true);
  const [sideTab, setSideTabState] = React.useState<SideTab>(readSideTab);
  const setSideTab = React.useCallback((tab: SideTab) => {
    setSideTabState(tab);
    writeSideTab(tab);
  }, []);
  const [newOpen, setNewOpen] = React.useState(false);
  const [threadMenuOpen, setThreadMenuOpen] = React.useState(false);
  // Below xl the side panel (helper, AI log, details) is a drawer instead of an
  // inline column: at 1024-1279px an inline 320px column beside the list left
  // the open chat too narrow to read.
  const [mobileContextOpen, setMobileContextOpen] = React.useState(false);
  const isLg = useMediaQuery('(min-width: 1024px)');
  const isXl = useMediaQuery('(min-width: 1280px)');
  const is2xl = useMediaQuery('(min-width: 1536px)');
  const toast = useToast();

  // Ticks once a minute so the reply-SLA flag colours advance on their own,
  // without waiting for new data to arrive.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // The thread the admin opened from this page's own list (phone), so the sync
  // below can tell it from a link followed in from elsewhere.
  const openedFromListRef = React.useRef<string | null>(null);

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
      setAutoPickedId(null);
      setSelectedId(c);
      setFilter('all');
      const next = new URLSearchParams(searchParams);
      next.delete('c');
      setSearchParams(next, { replace: true });
    } else {
      setSelectedId(c);
      // A row tapped in this list keeps the list's view, so Back lands on the
      // same Unassigned or Mine queue. A link from anywhere else (a push, the
      // Tickets page) may name a thread this view does not hold: All open.
      if (c && openedFromListRef.current !== c) setFilter('all');
      if (!c) openedFromListRef.current = null;
    }
  }, [searchParams, setSearchParams, isLg]);

  // The lens seeded the tab above; strip it, exactly as `?c=` is stripped on
  // desktop. Left in the URL it would survive every later tab change, so a
  // refresh — or Android's back key — would drop the operator back into the
  // guard lens from wherever they had moved to.
  React.useEffect(() => {
    if (!searchParams.get('lens')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('lens');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Open a conversation. On mobile this pushes `?c=<id>` (a real history entry,
  // so hardware-back returns to the list); on desktop it sets state directly.
  const openConversation = React.useCallback(
    (id: string) => {
      if (isLg) {
        setAutoPickedId(null);
        setSelectedId(id);
      } else {
        openedFromListRef.current = id;
        const next = new URLSearchParams(searchParams);
        next.set('c', id);
        setSearchParams(next);
      }
    },
    [isLg, searchParams, setSearchParams],
  );

  // Close the open thread: pop the pushed `?c=` on mobile (matches hardware
  // back), clear state on desktop. A blind `navigate(-1)` walked OUT of the app
  // whenever the thread was the first history entry, which is exactly what a
  // push-notification deep link to `/inbox?c=<id>` produces; `useSafeBack`
  // replaces with the list in that case.
  const backToList = useSafeBack('/inbox');
  const closeConversation = React.useCallback(() => {
    if (isLg) {
      setSelectedId(null);
    } else {
      backToList();
    }
  }, [isLg, backToList]);

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

  // The AI chrome and the composer, published together as the thread's bottom
  // bar below md — see where it is attached. Only while a thread is drawn: the
  // element exists exactly then.
  const threadBottomRef = React.useRef<HTMLDivElement>(null);
  usePublishBottomBar(threadBottomRef, !!conversation);

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

  // "Mark received…" and "Send back…" each act on one dealer message. `message`
  // is null when the action came from the card for a message that is not loaded
  // here — in another chat, or on an older page.
  const [receiveTarget, setReceiveTarget] = React.useState<AskActionTarget | null>(null);
  const [sendBackTarget, setSendBackTarget] = React.useState<AskActionTarget | null>(null);
  // "Show message": the message to scroll to, with a nonce so a second press on
  // the same one scrolls again. `pendingFocus` waits for another chat to open.
  const [jumpTo, setJumpTo] = React.useState<{ id: string; nonce: number } | null>(null);
  const [pendingFocus, setPendingFocus] = React.useState<{
    conversationId: string;
    messageId: string;
  } | null>(null);
  const jumpSeq = React.useRef(0);

  /**
   * The "Put in composer" request from the AI strip.
   *
   * A REQUEST WITH AN ID, not the text on its own: pressing the button twice
   * must insert the sentence twice, and an effect keyed on the string would do
   * nothing the second time and look broken. The counter is a ref because
   * nothing renders off it — bumping state for it would be a render per press
   * for a number nobody sees.
   *
   * It CARRIES THE THREAD IT WAS RAISED ON, and the render below refuses to
   * deliver it anywhere else. Clearing it in the `selectedId` effect is not
   * enough on its own: effects run after the render, so the first paint of the
   * next thread would already have handed the old sentence to the newly mounted
   * composer. One dealer's figures landing in another dealer's box is not a
   * race worth leaving open.
   */
  const [composerInsert, setComposerInsert] = React.useState<
    (ComposerInsert & { conversationId: string }) | null
  >(null);
  const insertSeq = React.useRef(0);
  const handleUseAiAnswer = React.useCallback(
    (text: string) => {
      if (!selectedId) return;
      insertSeq.current += 1;
      setComposerInsert({
        text,
        id: String(insertSeq.current),
        conversationId: selectedId,
      });
    },
    [selectedId],
  );
  /**
   * A draft from the Reply helper (ADR 0025), through the SAME request the AI
   * strip uses — and so under the same guard: the render below hands it to the
   * box only while `composerInsert.conversationId` is the open conversation.
   * The id comes from the strip's own conversation, not from `selectedId`, so a
   * draft is always the one asked about the chat it was made for; it appends to
   * the box and never sends.
   */
  const handleUseReplyDraft = React.useCallback(
    (conversationId: string, text: string) => {
      insertSeq.current += 1;
      setComposerInsert({
        text,
        id: String(insertSeq.current),
        conversationId,
        source: 'helper',
      });
    },
    [],
  );

  /**
   * "Suggest reply" pressed on the reply box: the helper's tab comes forward and
   * the pane runs one suggestion. A REQUEST WITH AN ID carrying its thread, for
   * the reasons `composerInsert` gives; the pane hands it back once run, so a
   * remount of the pane cannot pay for it twice.
   */
  const [suggestRequest, setSuggestRequest] = React.useState<
    (ReplyHelperSuggestRequest & { conversationId: string }) | null
  >(null);
  const suggestSeq = React.useRef(0);
  const handleSuggestHandled = React.useCallback(
    (id: string) => setSuggestRequest((r) => (r?.id === id ? null : r)),
    [],
  );

  // Never carry reply/dialog state across threads. The pending composer insert
  // goes too: a sentence written about one dealer's density must not follow the
  // admin into the next dealer's thread.
  React.useEffect(() => {
    setReplyTo(null);
    setInfoForId(null);
    setReactionsForId(null);
    setComposerInsert(null);
    setReceiveTarget(null);
    setSendBackTarget(null);
    setJumpTo(null);
    setSuggestRequest(null);
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
  const shareToOutlet = useShareToOutlet();
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
  const [resolveOpen, setResolveOpen] = React.useState(false);
  const [askLoginOpen, setAskLoginOpen] = React.useState(false);
  const [videoPickerOpen, setVideoPickerOpen] = React.useState(false);
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
    ai: countsQ.data?.ai,
    'ai-guard': countsQ.data?.aiGuard,
    tickets: countsQ.data?.tickets,
  };

  // Auto-select first conversation when list loads and nothing selected. Yield
  // to a pending deep-link so we never override an explicit `?c=` selection.
  React.useEffect(() => {
    // On mobile the list IS the landing view — don't jump into a chat and hide
    // it. Auto-select only on ≥ lg, where the list stays visible beside the thread.
    if (!isLg) return;
    if (searchParams.get('c')) return;
    if (!selectedId && conversations.length > 0) {
      setAutoPickedId(conversations[0]!.id);
      setSelectedId(conversations[0]!.id);
    }
  }, [conversations, selectedId, searchParams, isLg]);

  // Close the mobile details slide-over whenever the open conversation changes
  // (via a deep link or a just-created chat), so it never lingers over a
  // different thread. Safe: opening the panel does not change selectedId.
  React.useEffect(() => {
    if (!isXl) setMobileContextOpen(false);
  }, [selectedId, isXl]);

  // The list row already carries `dealerId` (it is what groupByDealer keys on),
  // so the dealer fetch can start alongside `/conversations/:id` instead of
  // waiting for it. Falls back to the fetched conversation for a
  // deep-linked thread that is not in the current filter's page.
  const listedDealerId =
    conversations.find((c) => c.id === selectedId)?.dealerId ?? null;
  // The detail response stays FIRST: once it lands it is the authority, and a
  // stale list row winning would point the context panel at another dealer's
  // GST and documents for a render.
  const dealerId = conversation?.dealerId ?? listedDealerId;
  const dealerQ = useQuery({
    queryKey: ['dealer', dealerId],
    queryFn: () => api.get<Dealer>(`/dealers/${dealerId}`),
    enabled: !!dealerId,
    retry: false,
  });

  /*
   * What MDG is waiting on from this outlet, and what the dealer has answered in
   * the chat that nobody has checked (ADR 0019). Read WITHOUT waiting for the
   * details panel to open: the "Answer to…" chip under a dealer's photo and the
   * status on an ask notice need it, and the panel is shut by default on a phone.
   * One query feeds the card, the chips and both dialogs.
   */
  const openRequestsQ = useDealerOpenRequestsQuery(dealerId);
  const openRequests = openRequestsQ.data;
  // A refetch that fails after a good read keeps the old list on screen; only
  // the absence of any list is a failure to show.
  const openRequestsFailed = openRequestsQ.isError && !openRequests;
  // `refetch` is stable across renders; the query object is not.
  const { refetch: refetchOpenRequests } = openRequestsQ;
  const retryOpenRequests = React.useCallback(
    () => void refetchOpenRequests(),
    [refetchOpenRequests],
  );
  // What this thread already shows: which messages are loaded (is the dealer's
  // photo on screen?) and which a person has replied to (is the request already
  // dealt with?). Only this thread can be read; the other chat's are not in it.
  const loadedMessageIds = React.useMemo(
    () => new Set(messages.map((m) => m.id)),
    [messages],
  );
  const repliedMessageIds = React.useMemo(() => mdgRepliedMessageIds(messages), [messages]);
  const pendingAnswers = React.useMemo(
    () => pendingAnswersByMessage(openRequests ?? [], repliedMessageIds),
    [openRequests, repliedMessageIds],
  );
  const askStatuses = React.useMemo(
    () => statusByRef(openRequests ?? []),
    [openRequests],
  );
  const requestsToCheck = countRequests(openRequests ?? [], repliedMessageIds).toCheck;

  // From the message menu and the "Answer to…" chip: this very message, whichever
  // request it turns out to answer — the dialog starts on that one.
  const handleMarkReceivedForMessage = React.useCallback((m: Message) => {
    setReceiveTarget({ conversationId: m.conversationId, messageId: m.id, message: m });
  }, []);
  const handleSendBackForMessage = React.useCallback((m: Message) => {
    setSendBackTarget({ conversationId: m.conversationId, messageId: m.id, message: m });
  }, []);

  // From the card: the answered request names its message, and the dialog starts
  // on that request. The message itself is only at hand when it is in THIS thread.
  const targetForRequest = React.useCallback(
    (r: DealerOpenRequest): AskActionTarget | null => {
      if (!r.answeredBy) return null;
      const { conversationId, messageId } = r.answeredBy;
      const message =
        conversationId === selectedId ? (messages.find((m) => m.id === messageId) ?? null) : null;
      return { conversationId, messageId, message, preselectRef: r.ref };
    },
    [messages, selectedId],
  );
  const handleCardMarkReceived = React.useCallback(
    (r: DealerOpenRequest) => {
      const target = targetForRequest(r);
      if (target) setReceiveTarget(target);
    },
    [targetForRequest],
  );
  const handleCardSendBack = React.useCallback(
    (r: DealerOpenRequest) => {
      const target = targetForRequest(r);
      if (target) setSendBackTarget(target);
    },
    [targetForRequest],
  );

  // "Show message": scroll to and flash the dealer's answer. When it lives in
  // another of the outlet's chats, open that chat first and scroll once it is up.
  const handleShowMessage = React.useCallback(
    (r: DealerOpenRequest) => {
      if (!r.answeredBy) return;
      const { conversationId, messageId } = r.answeredBy;
      // Below lg the card is inside the Details drawer, which would cover it.
      setMobileContextOpen(false);
      if (conversationId === selectedId) {
        jumpSeq.current += 1;
        setJumpTo({ id: messageId, nonce: jumpSeq.current });
        return;
      }
      setPendingFocus({ conversationId, messageId });
      openConversation(conversationId);
    },
    [selectedId, openConversation],
  );
  // Declared after the thread-change reset above, so that on the render which
  // opens the other chat this sets the jump and the reset does not erase it.
  React.useEffect(() => {
    if (!pendingFocus || selectedId !== pendingFocus.conversationId) return;
    jumpSeq.current += 1;
    setJumpTo({ id: pendingFocus.messageId, nonce: jumpSeq.current });
    setPendingFocus(null);
  }, [pendingFocus, selectedId]);

  async function handleSend(payload: {
    body?: string;
    attachments: Attachment[];
  }) {
    if (!conversation) return;
    // Writing in a thread is as good as choosing it: whoever does is looking.
    setAutoPickedId(null);
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

  // The composer's "Send to" choice: the whole outlet rather than this chat —
  // what the Reports shelf used to do for an uploaded file (ADR 0018). The
  // toast says who it actually reached; a throw puts the draft back.
  async function handleShareToOutlet(payload: {
    body?: string;
    attachments: Attachment[];
    audience: ShareAudience;
  }) {
    if (!conversation) return;
    setAutoPickedId(null);
    const outcome = await shareToOutlet.mutateAsync({
      conversationId: conversation.id,
      ...payload,
    });
    toast.success(describeShareRecipients(outcome.recipients));
  }

  function handlePickUp() {
    if (!conversation) return;
    setAutoPickedId(null);
    assignConv.mutate({ conversationId: conversation.id });
  }
  function handleTakeOver() {
    if (!conversation) return;
    setAutoPickedId(null);
    // No admin picker yet — this claims the ticket for the current admin.
    assignConv.mutate({ conversationId: conversation.id });
  }
  function handleReopen() {
    if (!conversation) return;
    reopenConv.mutate(conversation.id);
  }

  /*
   * The one action the ticket's status calls for, named once so the glyph in
   * the header and the row in the kebab sheet cannot drift apart.
   *
   * Below md this is drawn as a bare 44px square, not the icon-and-word pill it
   * used to be. That pill was 98px, and with the back chevron (44px) and the
   * kebab (44px) either side of it the title was left 131px of the 202px
   * "Shiv Kumar Singh · Owner" needs — so the name truncated mid-word and the
   * role, which is the half that says WHO you are talking to, never survived at
   * all. The word is not lost: it is the first row of the sheet the kebab
   * opens, where it has a whole line to itself.
   */
  // Another admin holds the chat: the header and the sheet offer Take over.
  const takeOverShown =
    !!conversation &&
    conversation.status === 'ASSIGNED' &&
    conversation.assignedAdminId !== currentUserId;

  const statusAction: {
    label: string;
    icon: (size: number) => React.ReactNode;
    variant: 'primary' | 'secondary';
    pending: boolean;
    run: () => void;
  } | null =
    conversation?.status === 'OPEN'
      ? {
          label: 'Pick up',
          icon: (s) => <UserPlus width={s} height={s} strokeWidth={1.75} />,
          variant: 'primary',
          pending: assignConv.isPending,
          run: handlePickUp,
        }
      : conversation?.status === 'ASSIGNED'
        ? {
            label: 'Resolve',
            icon: (s) => <CheckCircle2 width={s} height={s} strokeWidth={1.75} />,
            variant: 'primary',
            pending: resolveConv.isPending,
            run: () => setResolveOpen(true),
          }
        : conversation?.status === 'RESOLVED'
          ? {
              label: 'Reopen',
              icon: (s) => <RotateCcw width={s} height={s} strokeWidth={1.75} />,
              variant: 'secondary',
              pending: reopenConv.isPending,
              run: handleReopen,
            }
          : null;

  /**
   * Bring the side panel forward on a tab: the inline column at ≥ xl, the drawer
   * below it. The header's two glyphs toggle — a second press on the tab that is
   * already up puts the column away.
   */
  const panelVisible = isXl ? contextOpen : mobileContextOpen;
  const openPanel = React.useCallback(
    (tab: SideTab, remember = true) => {
      if (remember) setSideTab(tab);
      else setSideTabState(tab);
      if (isXl) setContextOpen(true);
      else setMobileContextOpen(true);
    },
    [isXl, setSideTab],
  );
  const togglePanel = React.useCallback(
    (tab: SideTab) => {
      if (panelVisible && sideTab === tab) {
        if (isXl) setContextOpen(false);
        else setMobileContextOpen(false);
        return;
      }
      openPanel(tab);
    },
    [panelVisible, sideTab, isXl, openPanel],
  );
  const handleSuggest = React.useCallback(() => {
    if (!selectedId) return;
    suggestSeq.current += 1;
    setSuggestRequest({ id: String(suggestSeq.current), conversationId: selectedId });
    openPanel('helper');
  }, [selectedId, openPanel]);
  /*
   * A link to a CLOSED ticket (`&ticket=<id>`) has to land on it, and resolved
   * tickets live in the Details tab now: bring it forward, once per link. Not
   * remembered as this browser's tab — the admin did not choose it. An open
   * ticket needs nothing: its band is always over the messages.
   */
  const threadTicketsQ = useThreadTicketsQuery(conversation?.id ?? null);
  const focusIsResolved = !!(
    focusTicketId &&
    threadTicketsQ.data?.some((t) => t.id === focusTicketId && t.state === 'RESOLVED')
  );
  const landedTicketRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!focusIsResolved || !focusTicketId || landedTicketRef.current === focusTicketId) return;
    landedTicketRef.current = focusTicketId;
    openPanel('details', false);
  }, [focusIsResolved, focusTicketId, openPanel]);

  // A Suggest press that never reached a pane (the panel was shut before the
  // helper could run it) is dropped, never run later unasked.
  React.useEffect(() => {
    if (!panelVisible) setSuggestRequest(null);
  }, [panelVisible]);

  const helperBusy =
    usePendingReplyHelperAsk({ channel: 'app', conversationId: selectedId ?? '' }) !== null;
  const threadGuard = useThreadGuard(conversation);
  const guarded = !!threadGuard;

  const memberName =
    conversation?.memberName?.trim() || roleLabel(conversation?.memberRole) || 'Member';
  const memberRole = conversation?.memberName?.trim()
    ? conversation.memberTitle?.trim() || roleLabel(conversation.memberRole)
    : '';
  const recipient = memberRole ? `${memberName} · ${memberRole}` : memberName;

  /*
   * The side panel's three tabs, rendered into one of two shells below: the
   * inline column at ≥ xl, the shared Drawer under it. Below xl it used to be a
   * bespoke `fixed inset-y-0 right-0` slide-over, and `position: fixed` resolves
   * against the VIEWPORT rather than against body's
   * `padding-top: env(safe-area-inset-top)` — so the heading and its Close sat
   * under the status bar. The shared Drawer carries all of that.
   */
  const helperPane = conversation ? (
    <ReplyHelperPane
      // Keyed on the thread so a half-written instruction and the "writing"
      // state never follow the admin to another dealer.
      key={`reply-helper:${conversation.id}`}
      className="h-full"
      target={{ channel: 'app', conversationId: conversation.id }}
      suggestRequest={suggestRequest?.conversationId === conversation.id ? suggestRequest : null}
      onSuggestHandled={handleSuggestHandled}
      // Below xl the drawer covers the reply box, which is what comes next.
      onDraftPlaced={isXl ? undefined : () => setMobileContextOpen(false)}
      // This reply box marks a helper draft itself; no toast over its Send.
      boxTagsDraft
      active={panelVisible && sideTab === 'helper'}
      onUseDraft={(text) => {
        // A resolved chat has a shut box, so a draft is refused there rather
        // than lost in it.
        if (conversation.status === 'RESOLVED') return 'closed';
        handleUseReplyDraft(conversation.id, text);
        return 'box';
      }}
    />
  ) : null;

  const aiPane = conversation ? (
    <AiFirstLineLog
      conversationId={conversation.id}
      now={now}
      onUseAnswer={(text) => {
        handleUseAiAnswer(text);
        if (!isXl) setMobileContextOpen(false);
      }}
    />
  ) : null;

  const detailsPane = conversation ? (
    <>
      {isAdmin ? (
        // "Conversation", not "Ticket": a ticket is the record the AI raises for
        // one question (pinned over the messages). This is the whole thread's
        // priority and category.
        <PanelSection
          title="Conversation"
          action={
            <HowThisWorks
              surface="admin-inbox-details"
              label="Details"
              variant="icon"
            />
          }
        >
          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <Label htmlFor="ticket-priority" className="text-xs text-text-muted">
                Priority
              </Label>
              <Select
                id="ticket-priority"
                value={conversation.priority ?? 'normal'}
                disabled={updateTicket.isPending}
                onChange={(e) =>
                  updateTicket.mutate(
                    {
                      conversationId: conversation.id,
                      priority: e.target.value as TicketPriority,
                    },
                    // The hook applies the change at once and quietly puts the
                    // old value back if the save fails, so without a word here
                    // a ticket marked Urgent on a weak link went back to
                    // Normal behind the admin's back.
                    {
                      onError: (err) =>
                        toast.error(
                          err instanceof ApiError
                            ? err.message
                            : 'Could not save the priority',
                        ),
                    },
                  )
                }
              >
                {TICKET_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-0">
              <Label htmlFor="ticket-category" className="text-xs text-text-muted">
                Category
              </Label>
              <Select
                id="ticket-category"
                value={conversation.category ?? 'general'}
                disabled={updateTicket.isPending}
                onChange={(e) =>
                  updateTicket.mutate(
                    {
                      conversationId: conversation.id,
                      category: e.target.value as TicketCategory,
                    },
                    {
                      onError: (err) =>
                        toast.error(
                          err instanceof ApiError
                            ? err.message
                            : 'Could not save the category',
                        ),
                    },
                  )
                }
              >
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {titleCase(c)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <p className="mt-2.5 text-xs text-text-muted">
            {conversation.status === 'RESOLVED'
              ? 'Resolved'
              : conversation.assignedAdminName
                ? `Assigned to ${conversation.assignedAdminName}`
                : 'Not picked up yet'}
          </p>
        </PanelSection>
      ) : null}
      {/* Above the outlet: it is the one section here an admin acts from. */}
      {dealerId ? (
        <OpenRequestsCard
          conversationId={conversation.id}
          loadedMessageIds={loadedMessageIds}
          repliedMessageIds={repliedMessageIds}
          requests={openRequests}
          loading={openRequestsQ.isLoading}
          failed={openRequestsFailed}
          onRetry={retryOpenRequests}
          onShowMessage={handleShowMessage}
          onMarkReceived={handleCardMarkReceived}
          onSendBack={handleCardSendBack}
        />
      ) : null}
      <TicketHistory
        conversationId={conversation.id}
        focusTicketId={focusTicketId}
        active={panelVisible && sideTab === 'details'}
        renderSection={(count, list) => (
          <PanelSection title={`Resolved tickets · ${count}`}>{list}</PanelSection>
        )}
      />
      <PanelSection title="Outlet">
        {dealerQ.isLoading ? (
          <div className="flex justify-center py-3">
            <Spinner size={16} />
          </div>
        ) : dealerQ.isError || !dealerQ.data ? (
          <p className="text-xs text-text-muted">Dealer details unavailable.</p>
        ) : (
          <OutletFacts dealer={dealerQ.data} />
        )}
      </PanelSection>
      <MediaGalleryCard conversationId={conversation.id} />
    </>
  ) : null;

  // `onClose` only for the inline column: a drawer has its own Close.
  const sidePanel = (onClose: (() => void) | undefined, className: string) => (
    <ThreadSidePanel
      tab={sideTab}
      onTab={setSideTab}
      onClose={onClose}
      closeLabel="Hide panel"
      helper={helperPane}
      ai={aiPane}
      details={detailsPane}
      detailsCount={requestsToCheck}
      aiAlert={guarded}
      helperBusy={helperBusy}
      className={className}
    />
  );

  // The things a thread can send besides a message, behind the reply box's "+":
  // each puts something in front of the dealer, so they live by the box that
  // sends, not in a card of their own.
  const composerActions =
    isAdmin && dealerId
      ? [
          {
            id: 'portal-login',
            label: 'Ask for portal login',
            icon: <KeyRound width={15} height={15} strokeWidth={1.75} />,
            onSelect: () => setAskLoginOpen(true),
          },
          {
            id: 'guide-video',
            label: 'Send a guide video',
            icon: <Video width={15} height={15} strokeWidth={1.75} />,
            onSelect: () => setVideoPickerOpen(true),
          },
        ]
      : undefined;

  // `main` is padded by `--app-gutter`, and in a thread AppShell adds the
  // bottom safe-area inset to it as well (the tab bar, which normally carries
  // it, is hidden). This page cancels that padding with a negative margin — but
  // `h-full` resolves against main's CONTENT box, so the page rendered a gutter
  // on each side shorter than the space it occupies, leaving a dead strip of
  // page background under the composer. Spell the height out, and add the inset
  // back only in a thread, which is the only case where main is carrying it.
  //
  // The two gutters have to be READ, not written as a number: this was `2rem`
  // from when the padding was a flat `p-4`, and `--app-gutter` is 0.75rem on a
  // phone. The page therefore came out 8px TALLER than its scroller, so a list
  // that fits still had 8px of travel.
  const threadOpen = searchParams.has('c');

  // The header's panel glyphs: lit while their tab is the one up.
  const panelGlyph = (tab: SideTab, label: string, icon: React.ReactNode) => {
    const on = panelVisible && sideTab === tab;
    return (
      <button
        type="button"
        onClick={() => togglePanel(tab)}
        aria-pressed={on}
        aria-label={label}
        title={label}
        className={cn(
          'relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors duration-150',
          on
            ? tab === 'helper'
              ? 'bg-assist-soft text-assist'
              : 'bg-surface-2 text-text'
            : 'text-text-muted hover:bg-surface-2 hover:text-text',
        )}
      >
        {icon}
        {tab === 'details' && requestsToCheck > 0 ? (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning-strong px-1 text-[10px] font-semibold leading-none text-white"
          >
            {requestsToCheck}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div
      className={cn(
        '-m-[var(--app-gutter)] flex bg-surface',
        threadOpen
          ? 'h-[calc(100%+2*var(--app-gutter)+env(safe-area-inset-bottom))]'
          : 'h-[calc(100%+2*var(--app-gutter))]',
      )}
    >
      <h1 className="sr-only">Inbox</h1>
      {/* Conversation list — full-width below lg, hidden once a chat is open.

          The panes appear at lg (1024px), not md — the same line the
          JavaScript has always drawn (`isLg` decides URL-driven selection). With
          the panes at md, everything from 768 to 1023px got the app sidebar and
          the list side by side and left the open thread 48-100px wide. */}
      <section
        aria-label="Conversations"
        className={cn(
          'w-full shrink-0 flex-col border-r border-border bg-surface lg:flex lg:w-[320px]',
          selectedId ? 'hidden' : 'flex',
        )}
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-2.5 pt-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="text-base font-semibold text-text">Inbox</h2>
            <HowThisWorks surface="admin-inbox" label="Inbox" variant="icon" />
            {conversationsQ.isFetching && !conversationsQ.isLoading ? (
              <Spinner size={14} className="text-text-muted" />
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <MoreViewsMenu
              views={FILTERS}
              primary={PRIMARY_VIEWS}
              value={filter}
              counts={countMap}
              onChange={(f) => {
                setFilter(f);
                setSelectedId(null);
              }}
            />
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
        <InboxViews
          views={FILTERS}
          primary={PRIMARY_VIEWS}
          value={filter}
          counts={countMap}
          onChange={(f) => {
            setFilter(f);
            setSelectedId(null);
          }}
        />
        {/* overscroll-contain: index.css deliberately leaves html/body alone so
            the shell's pull-to-refresh survives, and contains the inner
            scrollers instead — this one was missed, so flicking to the top of
            the list reloaded the page mid-read. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {conversationsQ.isLoading ? (
            <ConversationListSkeleton />
          ) : conversations.length === 0 ? (
            <EmptyState
              icon={<MessageSquare width={26} height={26} strokeWidth={1.5} />}
              title="All clear"
              description={`Nothing in ${FILTERS.find((f) => f.key === filter)?.label ?? 'this view'} right now.`}
            />
          ) : (
            <ul>
              {conversations.map((c) => (
                <li key={c.id}>
                  <ConversationRow
                    conversation={c}
                    selected={selectedId === c.id}
                    now={now}
                    onOpen={openConversation}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Active chat — the whole width below lg once a conversation is selected */}
      <section
        aria-label="Conversation"
        className={cn(
          'min-w-0 flex-1 flex-col bg-bg lg:flex',
          selectedId ? 'flex' : 'hidden',
        )}
      >
        {!conversation ? (
          selectedId ? (
            /*
             * A thread is open but its details have not arrived — or never
             * will. The header, and with it the Back chevron, renders off
             * `selectedId` and never off the response: in a thread AppShell
             * hides the tab bar, so until this branch existed a slow link
             * showed a "Select a conversation" card with no way back, and a
             * failed GET showed it forever.
             */
            <>
              <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 md:px-4">
                <button
                  type="button"
                  onClick={() => {
                    setMobileContextOpen(false);
                    closeConversation();
                  }}
                  aria-label="Back to conversations"
                  className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 lg:hidden"
                >
                  <ChevronLeft width={20} height={20} strokeWidth={1.75} />
                </button>
                <h2 className="min-w-0 truncate text-base font-semibold text-text">
                  {selectedQ.isError ? 'Conversation' : 'Opening…'}
                </h2>
              </header>
              {selectedQ.isError ? (
                <div className="flex min-h-0 flex-1 items-center justify-center p-4">
                  <div className="w-full max-w-sm">
                    <p className="text-sm font-medium text-text">
                      This conversation could not be loaded.
                    </p>
                    <p className="mt-1 text-sm text-text-muted">
                      The request failed. Check the connection and try again.
                    </p>
                    <ActionRow className="mt-4">
                      <Button
                        variant="secondary"
                        className="lg:hidden"
                        onClick={() => {
                          setMobileContextOpen(false);
                          closeConversation();
                        }}
                      >
                        Back to conversations
                      </Button>
                      <Button
                        onClick={() => void selectedQ.refetch()}
                        loading={selectedQ.isFetching}
                      >
                        Try again
                      </Button>
                    </ActionRow>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <Spinner size={20} />
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                icon={
                  <MessageSquare width={32} height={32} strokeWidth={1.5} />
                }
                title="Pick a conversation"
                description="Choose one from the list to read it and reply."
              />
            </div>
          )
        ) : (
          <>
            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                {/* Below lg the thread has the screen to itself and its header
                    grows to fit: a long name or a group chat's status wraps to a
                    second line rather than being cut to "Not…". */}
                <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 py-1.5 md:gap-3 md:px-4 lg:h-14 lg:py-0">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileContextOpen(false);
                      closeConversation();
                    }}
                    aria-label="Back to conversations"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 lg:hidden"
                  >
                    <ChevronLeft width={20} height={20} strokeWidth={1.75} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <h2
                        className="min-w-0 break-words text-[15px] font-semibold leading-5 text-text lg:truncate"
                        title={memberName}
                      >
                        {memberName}
                      </h2>
                      {memberRole ? (
                        <span className="shrink-0 text-sm text-text-muted">{memberRole}</span>
                      ) : null}
                    </div>
                    <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-4 text-text-muted lg:flex-nowrap">
                      {/* 44px tall below lg, the header's other targets' size,
                          with the growth cancelled by the negative margin so the
                          line keeps its height. */}
                      <Link
                        to={`/dealers/${conversation.dealerId}`}
                        className="-my-3.5 inline-flex min-h-11 shrink-0 items-center font-mono font-medium text-text-muted underline-offset-2 hover:text-brand hover:underline lg:my-0 lg:min-h-0"
                      >
                        {dealerCodeLabel(conversation.dealerCode)}
                      </Link>
                      {/* Below lg the role beside the name already says Manager. */}
                      {conversation.kind === 'manager' ? (
                        <span className="hidden shrink-0 lg:inline">· Group chat</span>
                      ) : null}
                      <span className="lg:min-w-0 lg:truncate">· {statusWords(conversation, currentUserId)}</span>
                      <span className="ml-0.5 inline-flex shrink-0">
                        <TicketFlagBadge conversation={conversation} now={now} />
                      </span>
                    </p>
                  </div>

                  {/* Phone: the status action as one glyph, the helper, and a
                      kebab holding the rest. Four labelled controls took ~232px
                      of a 360px header and left the member's name ~110px. */}
                  <div className="flex shrink-0 items-center md:hidden">
                    {statusAction ? (
                      <IconButton
                        aria-label={statusAction.label}
                        variant={statusAction.variant}
                        onClick={statusAction.run}
                        loading={statusAction.pending}
                      >
                        {statusAction.icon(18)}
                      </IconButton>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openPanel('helper')}
                      aria-label="Reply helper"
                      className="flex h-11 w-11 items-center justify-center rounded-md text-assist hover:bg-assist-soft"
                    >
                      {helperBusy ? (
                        <Spinner size={16} />
                      ) : (
                        <Sparkles width={18} height={18} strokeWidth={1.9} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setThreadMenuOpen(true)}
                      aria-label={
                        requestsToCheck > 0
                          ? `More actions — ${requestsToCheck} to check`
                          : 'More actions'
                      }
                      aria-expanded={threadMenuOpen}
                      className="relative flex h-11 w-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text"
                    >
                      <MoreVertical width={18} height={18} strokeWidth={1.75} />
                      {requestsToCheck > 0 ? (
                        <span
                          aria-hidden
                          className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning-strong px-1 text-[10px] font-semibold leading-none text-white"
                        >
                          {requestsToCheck}
                        </span>
                      ) : null}
                    </button>
                  </div>

                  {/* Desk: the status action in words, then the panel's tabs as
                      glyphs, then everything else under one overflow menu. From
                      md to lg the thread is a 560px column: the status action
                      is a glyph and Take over moves into the menu, or the desk
                      row left the name ~95px. */}
                  <div className="hidden shrink-0 items-center gap-1.5 md:flex">
                    {takeOverShown && isLg ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleTakeOver}
                        loading={assignConv.isPending}
                      >
                        Take over
                      </Button>
                    ) : null}
                    {/* Beside Take over the status action is a glyph until 2xl:
                        both in words took 230px and pushed the dealer's name out
                        of the header. */}
                    {statusAction && (!isLg || (takeOverShown && !is2xl)) ? (
                      <IconButton
                        size="sm"
                        aria-label={statusAction.label === 'Resolve' ? 'Resolve chat' : statusAction.label}
                        title={statusAction.label === 'Resolve' ? 'Resolve chat' : statusAction.label}
                        variant={statusAction.variant}
                        onClick={statusAction.run}
                        loading={statusAction.pending}
                      >
                        {statusAction.icon(16)}
                      </IconButton>
                    ) : statusAction ? (
                      <Button
                        size="sm"
                        variant={statusAction.variant}
                        onClick={statusAction.run}
                        loading={statusAction.pending}
                        leftIcon={statusAction.icon(14)}
                      >
                        {statusAction.label === 'Resolve' ? 'Resolve chat' : statusAction.label}
                      </Button>
                    ) : null}
                    {/* The panel's tabs as glyphs, only while the panel is put
                        away: with it open beside the chat its own tabs are right
                        there, and three more glyphs cost the name its room. Below
                        xl the panel is a drawer with its own tabs, so the header
                        keeps the helper's glyph alone and the other two move
                        into the menu. */}
                    {!(isXl && contextOpen) ? (
                      <>
                        <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
                        {panelGlyph(
                          'helper',
                          'Reply helper',
                          helperBusy ? (
                            <Spinner size={15} className="text-assist" />
                          ) : (
                            <Sparkles width={17} height={17} strokeWidth={1.9} className="text-assist" />
                          ),
                        )}
                        {isXl ? (
                          <>
                            {panelGlyph('ai', 'AI log', <Zap width={17} height={17} strokeWidth={1.75} />)}
                            {panelGlyph('details', 'Details', <Info width={17} height={17} strokeWidth={1.75} />)}
                          </>
                        ) : null}
                      </>
                    ) : null}
                    {composerActions || !isXl ? (
                      <Menu
                        label={
                          !isXl && requestsToCheck > 0
                            ? `More actions — ${requestsToCheck} to check`
                            : 'More actions'
                        }
                        title="Actions"
                        align="end"
                        trigger={
                          <span className="relative inline-flex">
                            <MoreHorizontal width={18} height={18} strokeWidth={1.75} />
                            {!isXl && requestsToCheck > 0 ? (
                              <span
                                aria-hidden
                                className="absolute -right-2.5 -top-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning-strong px-1 text-[10px] font-semibold leading-none text-white"
                              >
                                {requestsToCheck}
                              </span>
                            ) : null}
                          </span>
                        }
                      >
                        {!isXl ? (
                          <>
                            <MenuItem
                              icon={<Info width={15} height={15} strokeWidth={1.75} />}
                              onSelect={() => openPanel('details')}
                            >
                              {requestsToCheck > 0 ? `Details · ${requestsToCheck} to check` : 'Details'}
                            </MenuItem>
                            <MenuItem
                              icon={<Zap width={15} height={15} strokeWidth={1.75} />}
                              onSelect={() => openPanel('ai')}
                            >
                              AI log
                            </MenuItem>
                            {composerActions || (takeOverShown && !isLg) ? <MenuSeparator /> : null}
                          </>
                        ) : null}
                        {takeOverShown && !isLg ? (
                          <MenuItem
                            icon={<UserPlus width={15} height={15} strokeWidth={1.75} />}
                            onSelect={handleTakeOver}
                          >
                            Take over
                          </MenuItem>
                        ) : null}
                        {composerActions?.map((a) => (
                          <MenuItem key={a.id} icon={a.icon} onSelect={a.onSelect}>
                            {a.label}
                          </MenuItem>
                        ))}
                      </Menu>
                    ) : null}
                    <HowThisWorks
                      surface="admin-inbox-thread"
                      label="Conversation"
                      variant="icon"
                    />
                  </div>
                </header>

                {/* Pinned over the messages, never between them and the reply
                    box: an open ticket (a dealer waiting on a person) and the
                    guard's mark. One slim line each; the details are a tap
                    away. Keyed on the thread so a half-written resolution never
                    follows the admin to another dealer. Both draw nothing on the
                    threads they have nothing to say about, which is most. Any
                    other one-line state of the thread belongs in this band too,
                    never under the messages: that space is the reply box's
                    alone. */}
                {/* One cap for the whole band, so however many of these a thread
                    has at once (a quiet, two tickets, a guard mark) the messages
                    keep most of the column; the band scrolls inside itself, and
                    the menus in it draw in a portal, so the scroll cannot clip
                    them. First the AI-quiet line: its "Let AI answer now" must
                    not sit below this block's fold. */}
                {/* A short screen — a phone with its keyboard up — gets a lower
                    cap, or the message being answered scrolls out of sight. */}
                <div className="max-h-[38dvh] shrink-0 overflow-y-auto overscroll-contain [@media(max-height:640px)]:max-h-[24dvh]">
                  <AiQuietLine conversation={conversation} now={now} />
                  <TicketStrip
                    key={conversation.id}
                    conversationId={conversation.id}
                    now={now}
                    focusTicketId={focusTicketId}
                    stampSeen={selectedId !== autoPickedId}
                  />
                  <AiGuardBanner conversationId={conversation.id} guard={threadGuard} now={now} />
                </div>

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
                      dealerId={conversation.dealerId}
                      memberRole={conversation.memberRole}
                      group={conversation.kind === 'manager'}
                      hasEarlier={messagesQ.hasNextPage}
                      loadingEarlier={messagesQ.isFetchingNextPage}
                      onLoadEarlier={messagesQ.fetchNextPage}
                      onReply={handleReply}
                      onToggleReaction={handleToggleReaction}
                      onOpenReactions={handleOpenReactions}
                      onOpenInfo={handleOpenInfo}
                      onMarkReceived={handleMarkReceivedForMessage}
                      onSendBack={handleSendBackForMessage}
                      pendingAnswers={pendingAnswers}
                      askStatuses={askStatuses}
                      jumpTo={jumpTo}
                    />
                  )}
                </div>

                {/* The reply box, alone under the messages. Published as the
                    bottom bar below md, so a toast clears it. */}
                <div ref={threadBottomRef} className="shrink-0">
                  <ThreadComposer
                    /*
                     * KEYED ON THE THREAD, so the draft box empties when the
                     * admin moves to another conversation. `Composer` owns its
                     * draft in local state; without a key the same half-typed
                     * text was reused across threads — and with "Put in reply
                     * box" that is a leak of one dealer's figures to another.
                     */
                    key={conversation.id}
                    conversationId={conversation.id}
                    recipient={recipient}
                    onSend={handleSend}
                    onShareToOutlet={handleShareToOutlet}
                    disabled={conversation.status === 'RESOLVED'}
                    replyingTo={composerReply}
                    onCancelReply={handleCancelReply}
                    onSuggest={handleSuggest}
                    moreActions={composerActions}
                    insert={
                      composerInsert?.conversationId === conversation.id
                        ? composerInsert
                        : null
                    }
                  />
                </div>
              </div>

              {isXl && contextOpen ? (
                <aside
                  aria-label="Side panel"
                  className="flex w-[320px] shrink-0 flex-col border-l border-border bg-surface 2xl:w-[360px]"
                >
                  {sidePanel(() => setContextOpen(false), 'h-full')}
                </aside>
              ) : null}
            </div>

            {!isXl ? (
              <Drawer
                open={mobileContextOpen}
                onClose={() => setMobileContextOpen(false)}
                title={recipient}
                description={dealerCodeLabel(conversation.dealerCode)}
                width="sm"
                bodyPadding="none"
              >
                {sidePanel(undefined, 'h-[80dvh] md:h-full')}
              </Drawer>
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

            <ReceiveAskDialog
              target={receiveTarget}
              dealerId={dealerId}
              requests={openRequests}
              loading={openRequestsQ.isLoading}
              failed={openRequestsFailed}
              onRetry={retryOpenRequests}
              onClose={() => setReceiveTarget(null)}
            />

            <SendBackAskDialog
              target={sendBackTarget}
              dealerId={dealerId}
              requests={openRequests}
              loading={openRequestsQ.isLoading}
              failed={openRequestsFailed}
              onRetry={retryOpenRequests}
              onClose={() => setSendBackTarget(null)}
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

            {/* Phone-only overflow actions, out of the thread header. */}
            <Sheet
              open={threadMenuOpen}
              onClose={() => setThreadMenuOpen(false)}
              // The thread's guided video rides on the sheet's title row: below
              // md the header has room for only three glyphs beside the name.
              title="Actions"
              help={
                <HowThisWorks
                  surface="admin-inbox-thread"
                  label="Conversation"
                  variant="icon"
                />
              }
            >
              {/* First, because it is the same control as the glyph in the
                  header — this row is where that glyph's word went. */}
              {statusAction ? (
                <SheetItem
                  icon={statusAction.icon(20)}
                  onClick={() => {
                    setThreadMenuOpen(false);
                    statusAction.run();
                  }}
                >
                  {statusAction.label === 'Resolve' ? 'Resolve chat' : statusAction.label}
                </SheetItem>
              ) : null}
              <SheetItem
                icon={<Sparkles width={20} height={20} strokeWidth={1.75} />}
                onClick={() => {
                  setThreadMenuOpen(false);
                  openPanel('helper');
                }}
              >
                Reply helper
              </SheetItem>
              <SheetItem
                icon={<Info width={20} height={20} strokeWidth={1.75} />}
                onClick={() => {
                  setThreadMenuOpen(false);
                  openPanel('details');
                }}
              >
                {requestsToCheck > 0 ? `Details · ${requestsToCheck} to check` : 'Details'}
              </SheetItem>
              <SheetItem
                icon={<Zap width={20} height={20} strokeWidth={1.75} />}
                onClick={() => {
                  setThreadMenuOpen(false);
                  openPanel('ai');
                }}
              >
                AI log
              </SheetItem>
              {/* Also here, not only behind the reply box's "+": a resolved
                  chat has no box on a phone, and these still need sending. */}
              {composerActions?.map((a) => (
                <SheetItem
                  key={a.id}
                  icon={a.id === 'portal-login' ? <KeyRound width={20} height={20} strokeWidth={1.75} /> : <Video width={20} height={20} strokeWidth={1.75} />}
                  onClick={() => {
                    setThreadMenuOpen(false);
                    a.onSelect();
                  }}
                >
                  {a.label}
                </SheetItem>
              ))}
              {takeOverShown ? (
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
            </Sheet>
          </>
        )}
      </section>

      <AskPortalLoginDialog
        open={askLoginOpen}
        onClose={() => setAskLoginOpen(false)}
        dealerId={dealerId}
      />
      <SendGuideVideoDialog
        open={videoPickerOpen}
        onClose={() => setVideoPickerOpen(false)}
        conversationId={conversation?.id}
      />

      <NewConversationDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onStarted={handleStarted}
      />
    </div>
  );
}
