import {
  CalendarClock,
  MessageCircle,
  NotebookPen,
  Phone,
  PhoneCall,
  RotateCcw,
  UserRound,
  UserPlus,
  XCircle,
  ExternalLink,
} from 'lucide-react';

import { ActionRow, Button, Menu, MenuItem } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { dialHref } from '@/lib/intake';
import { canReopen, chatHref, isClosed, leadName } from '@/lib/leads';
import type { LeadRow } from '@dk/shared';

import { ActionLink, IconLink, type LeadAction } from './shared';

interface ActionsProps {
  lead: LeadRow;
  onAction: (action: LeadAction, lead: LeadRow) => void;
}

const ICON = { width: 15, height: 15, strokeWidth: 1.75 } as const;

/** Whether the lead has a number to ring, and whether there is a chat to open. */
function reach(lead: LeadRow) {
  return {
    tel: lead.phone ? dialHref(lead.phone) : null,
    // Only a chat that exists: for a number nobody has messaged, the inbox
    // opens on "no messages from this person" — calling is the way in.
    chat: lead.hasChat ? chatHref(lead.waId) : null,
    // A share-link lead is known by the link's label until somebody gives us a number.
    needsNumber: !lead.phone && lead.origin === 'share_link',
  };
}

/**
 * The rest of what can be done to an open lead, behind one button. `onOpen` is
 * the way into the drawer from a list; the drawer itself leaves it out.
 */
function MoreMenu({
  lead,
  onAction,
  onOpen,
}: ActionsProps & { onOpen?: (lead: LeadRow) => void }) {
  const { needsNumber } = reach(lead);
  return (
    <Menu label={`More actions for ${leadName(lead)}`} title={leadName(lead)}>
      {onOpen ? (
        <MenuItem icon={<ExternalLink {...ICON} />} onSelect={() => onOpen(lead)}>
          Open details
        </MenuItem>
      ) : null}
      <MenuItem icon={<CalendarClock {...ICON} />} onSelect={() => onAction('followUp', lead)}>
        Set follow-up
      </MenuItem>
      <MenuItem icon={<UserRound {...ICON} />} onSelect={() => onAction('assign', lead)}>
        Assign
      </MenuItem>
      <MenuItem icon={<NotebookPen {...ICON} />} onSelect={() => onAction('note', lead)}>
        Add note
      </MenuItem>
      {needsNumber ? (
        <MenuItem icon={<UserPlus {...ICON} />} onSelect={() => onAction('phone', lead)}>
          Add number
        </MenuItem>
      ) : null}
      <MenuItem danger icon={<XCircle {...ICON} />} onSelect={() => onAction('close', lead)}>
        Close lead
      </MenuItem>
    </Menu>
  );
}

function ReopenButton({ lead, onAction }: ActionsProps) {
  return (
    <Button
      size="sm"
      variant="secondary"
      leftIcon={<RotateCcw {...ICON} />}
      onClick={() => onAction('reopen', lead)}
    >
      Reopen
    </Button>
  );
}

/**
 * What a row offers in the last column of the table (md and up): Log contact, a
 * quiet WhatsApp and Call, and the rest in a menu. A closed lead offers only
 * Reopen (never for a client).
 *
 * Below md the same slot is the top right of the card, where a design-system
 * list puts its overflow menu, and it holds only that menu: the buttons that
 * matter are under the row (`LeadCardActions`) where a thumb can reach them.
 * Which one is decided in JS, as `DataList` decides its own shape, so only one
 * is ever mounted.
 */
export function LeadRowActions({
  lead,
  onAction,
  onOpen,
}: ActionsProps & { onOpen: (lead: LeadRow) => void }) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const closed = isClosed(lead.status);
  if (!isMd) return closed ? null : <MoreMenu lead={lead} onAction={onAction} onOpen={onOpen} />;
  if (closed) {
    return (
      <div className="flex items-center justify-end gap-1">
        {canReopen(lead.status) ? <ReopenButton lead={lead} onAction={onAction} /> : null}
      </div>
    );
  }
  const { tel, chat, needsNumber } = reach(lead);
  return (
    <div className="flex items-center justify-end gap-1">
      <Button size="sm" onClick={() => onAction('contact', lead)}>
        Log contact
      </Button>
      {chat ? (
        <IconLink to={chat} label={`WhatsApp ${leadName(lead)}`}>
          <MessageCircle width={16} height={16} strokeWidth={1.75} />
        </IconLink>
      ) : null}
      {tel ? (
        <IconLink href={tel} label={`Call ${leadName(lead)}`}>
          <Phone width={16} height={16} strokeWidth={1.75} />
        </IconLink>
      ) : null}
      {needsNumber ? (
        <Button size="sm" variant="secondary" onClick={() => onAction('phone', lead)}>
          Add number
        </Button>
      ) : null}
      <MoreMenu lead={lead} onAction={onAction} onOpen={onOpen} />
    </div>
  );
}

/**
 * The same on a phone card, under the row: every button is a labelled 44px
 * target, wrapping onto a second line instead of running off the edge. The
 * overflow menu is the card's top-right button (`LeadRowActions`).
 */
export function LeadCardActions({ lead, onAction }: ActionsProps) {
  if (isClosed(lead.status)) {
    return canReopen(lead.status) ? (
      <ActionRow below="wrap" align="start">
        <ReopenButton lead={lead} onAction={onAction} />
      </ActionRow>
    ) : null;
  }
  const { tel, chat, needsNumber } = reach(lead);
  return (
    <ActionRow below="wrap" align="start">
      <Button size="sm" onClick={() => onAction('contact', lead)}>
        Log contact
      </Button>
      {chat ? (
        <ActionLink to={chat} icon={<MessageCircle {...ICON} />}>
          WhatsApp
        </ActionLink>
      ) : null}
      {tel ? (
        <ActionLink href={tel} icon={<PhoneCall {...ICON} />}>
          Call
        </ActionLink>
      ) : null}
      {needsNumber ? (
        <Button size="sm" variant="secondary" onClick={() => onAction('phone', lead)}>
          Add number
        </Button>
      ) : null}
    </ActionRow>
  );
}

/**
 * Everything, as buttons, at the top of the drawer. A phone has no address bar
 * and no right click, so nothing here may hide behind a gesture: each action is
 * a button a thumb can hit, and they wrap rather than scroll.
 */
export function LeadDrawerActions({ lead, onAction }: ActionsProps) {
  if (isClosed(lead.status)) {
    return canReopen(lead.status) ? (
      <ActionRow below="wrap" align="start">
        <ReopenButton lead={lead} onAction={onAction} />
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<NotebookPen {...ICON} />}
          onClick={() => onAction('note', lead)}
        >
          Add note
        </Button>
      </ActionRow>
    ) : (
      <ActionRow below="wrap" align="start">
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<NotebookPen {...ICON} />}
          onClick={() => onAction('note', lead)}
        >
          Add note
        </Button>
      </ActionRow>
    );
  }
  const { tel, chat, needsNumber } = reach(lead);
  return (
    <ActionRow below="wrap" align="start">
      <Button size="sm" onClick={() => onAction('contact', lead)}>
        Log contact
      </Button>
      {chat ? (
        <ActionLink to={chat} icon={<MessageCircle {...ICON} />}>
          WhatsApp
        </ActionLink>
      ) : null}
      {tel ? (
        <ActionLink href={tel} icon={<PhoneCall {...ICON} />}>
          Call
        </ActionLink>
      ) : null}
      {needsNumber ? (
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<UserPlus {...ICON} />}
          onClick={() => onAction('phone', lead)}
        >
          Add number
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<CalendarClock {...ICON} />}
        onClick={() => onAction('followUp', lead)}
      >
        Set follow-up
      </Button>
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<UserRound {...ICON} />}
        onClick={() => onAction('assign', lead)}
      >
        Assign
      </Button>
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<NotebookPen {...ICON} />}
        onClick={() => onAction('note', lead)}
      >
        Add note
      </Button>
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<XCircle {...ICON} />}
        onClick={() => onAction('close', lead)}
      >
        Close lead
      </Button>
    </ActionRow>
  );
}
