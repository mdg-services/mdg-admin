import {
  ChevronLeft,
  Copy,
  Info,
  MailOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Phone,
  Pin,
  PinOff,
  Tag,
} from 'lucide-react';

import { BUTTON_VARIANTS } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import type { WhatsAppChatSummary, WhatsAppReplyRoute } from '@dk/shared';

import { ChatAvatar } from './ChatAvatar';
import { chatTitle, dialHref, hasName, headerStatus, phoneLabel, type StatusTone } from './format';

const TONE_CLASS: Record<StatusTone, string> = {
  open: 'text-success-strong',
  closed: 'text-warning-strong',
  stopped: 'text-danger-strong',
};

export interface ChatHeaderProps {
  person: string;
  /** From the chat itself once it has loaded, from the list row before that. */
  chat: WhatsAppChatSummary | undefined;
  route: WhatsAppReplyRoute | null;
  now: number;
  /** Back to the list. Only drawn below lg, where the list and the chat take turns. */
  onBack: () => void;
  /** The contact-info panel (a column at xl, a drawer below it). */
  detailsOpen: boolean;
  onToggleDetails: () => void;
  /** At xl the panel is a column the header toggles; below it, a drawer the header opens. */
  panelIsColumn: boolean;
  onMarkUnread: () => void;
  onTogglePin: () => void;
  onCopyNumber: () => void;
  onEditName: () => void;
  onSetStage: () => void;
}

/**
 * The strip across the top of an open chat: who it is, what state their reply
 * window is in, and the few things a person might want to do to the chat.
 *
 * Built from the app's own tokens, laid out as WhatsApp's header is — back
 * arrow, picture, name over a line of status, then icons — and the whole
 * name block is the button that opens the contact panel, as it is there.
 */
export function ChatHeader({
  person,
  chat,
  route,
  now,
  onBack,
  detailsOpen,
  onToggleDetails,
  panelIsColumn,
  onMarkUnread,
  onTogglePin,
  onCopyNumber,
  onEditName,
  onSetStage,
}: ChatHeaderProps) {
  const status = chat ? headerStatus(chat, route, now) : null;
  const named = chat ? hasName(chat) : false;
  const phone = chat?.phone ?? null;

  return (
    <header className="flex items-center gap-1 border-b border-border bg-surface px-1 py-1.5 md:px-2">
      <IconButton aria-label="Back to the chat list" className="lg:hidden" onClick={onBack}>
        <ChevronLeft width={22} height={22} strokeWidth={1.75} />
      </IconButton>

      <button
        type="button"
        onClick={onToggleDetails}
        aria-label={chat ? `${chatTitle(chat)}, contact info` : 'Contact info'}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring lg:pl-2"
      >
        {chat ? (
          <ChatAvatar person={person} name={named ? chat.name : null} size={40} />
        ) : (
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        )}
        <span className="min-w-0 flex-1">
          {chat ? (
            <>
              <span className={cn('block truncate text-base font-medium text-text', !named && 'tabular-nums')}>
                {chatTitle(chat)}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
                {/* On a phone the line is too short for both. The window state is
                    the one that changes what the admin does, and the number is a
                    tap away (the call button, the contact panel), so it gives way. */}
                {named ? (
                  <span className={cn('shrink-0 tabular-nums', status && 'hidden md:inline')}>{phoneLabel(phone)}</span>
                ) : null}
                {status ? (
                  <>
                    {named ? (
                      <span aria-hidden className="hidden md:inline">
                        ·
                      </span>
                    ) : null}
                    <span className={cn('min-w-0 truncate', TONE_CLASS[status.tone])}>{status.text}</span>
                  </>
                ) : null}
              </span>
            </>
          ) : (
            <>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-1.5 h-3 w-24" />
            </>
          )}
        </span>
      </button>

      {phone ? (
        <a
          href={dialHref(phone)}
          aria-label={`Call ${phoneLabel(phone)}`}
          title="Call"
          className={cn(
            'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md p-0 md:h-9 md:w-9',
            'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
            BUTTON_VARIANTS.ghost,
          )}
        >
          <Phone width={18} height={18} strokeWidth={1.75} />
        </a>
      ) : null}

      <IconButton
        aria-label={panelIsColumn ? (detailsOpen ? 'Hide contact info' : 'Show contact info') : 'Contact info'}
        title="Contact info"
        aria-pressed={panelIsColumn ? detailsOpen : undefined}
        onClick={onToggleDetails}
      >
        {panelIsColumn ? (
          detailsOpen ? (
            <PanelRightClose width={18} height={18} strokeWidth={1.75} />
          ) : (
            <PanelRightOpen width={18} height={18} strokeWidth={1.75} />
          )
        ) : (
          <Info width={18} height={18} strokeWidth={1.75} />
        )}
      </IconButton>

      <Menu label="Chat actions" title="Chat">
        <MenuItem icon={<MailOpen width={15} height={15} strokeWidth={1.75} />} onSelect={onMarkUnread} disabled={!chat}>
          Mark as unread
        </MenuItem>
        <MenuItem
          icon={
            chat?.pinned ? (
              <PinOff width={15} height={15} strokeWidth={1.75} />
            ) : (
              <Pin width={15} height={15} strokeWidth={1.75} />
            )
          }
          onSelect={onTogglePin}
          disabled={!chat}
        >
          {chat?.pinned ? 'Unpin chat' : 'Pin chat'}
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Copy width={15} height={15} strokeWidth={1.75} />} onSelect={onCopyNumber} disabled={!phone}>
          Copy number
        </MenuItem>
        <MenuItem icon={<Pencil width={15} height={15} strokeWidth={1.75} />} onSelect={onEditName} disabled={!chat}>
          Edit name
        </MenuItem>
        <MenuItem icon={<Tag width={15} height={15} strokeWidth={1.75} />} onSelect={onSetStage} disabled={!chat}>
          {chat?.stage ? 'Change stage' : 'Set stage'}
        </MenuItem>
      </Menu>
    </header>
  );
}
