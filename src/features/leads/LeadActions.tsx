import {
  CalendarClock,
  MessageCircle,
  NotebookPen,
  PhoneCall,
  RotateCcw,
  UserRound,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { ActionRow, Button, Menu, MenuItem } from '@/components/ui';
import { dialHref } from '@/lib/intake';
import { canReopen, chatHref, isClosed, leadName } from '@/lib/leads';
import type { LeadRow } from '@dk/shared';

import { ActionLink, type LeadAction } from './shared';

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
 * The rest of what can be done to an open lead, behind one button: the two ways
 * to reach them that used to be icons on the row (the number and the WhatsApp
 * icon in the lead's own cell cover the quick paths now), then the follow-up,
 * the owner, a note and the close.
 */
function MoreMenu({ lead, onAction }: ActionsProps) {
  const navigate = useNavigate();
  const { tel, chat, needsNumber } = reach(lead);
  return (
    <Menu label={`More actions for ${leadName(lead)}`} title={leadName(lead)}>
      {chat ? (
        <MenuItem icon={<MessageCircle {...ICON} />} onSelect={() => navigate(chat)}>
          Open WhatsApp chat
        </MenuItem>
      ) : null}
      {tel ? (
        <MenuItem icon={<PhoneCall {...ICON} />} onSelect={() => window.location.assign(tel)}>
          Call
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
 * What a row offers in the last column of the table, which only exists from md
 * up: Log contact and the menu. A closed lead offers only Reopen (never for a
 * client). The row itself opens the drawer.
 *
 * A phone has no such column. Its card is one tap target that opens the drawer,
 * where every action is a labelled 44px button, and a button cannot sit inside
 * a tappable card; the page passes no actions to the list there.
 */
export function LeadRowActions({ lead, onAction }: ActionsProps) {
  if (isClosed(lead.status)) {
    return (
      <div className="flex items-center justify-end gap-1">
        {canReopen(lead.status) ? <ReopenButton lead={lead} onAction={onAction} /> : null}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-1">
      <Button size="sm" onClick={() => onAction('contact', lead)}>
        Log contact
      </Button>
      <MoreMenu lead={lead} onAction={onAction} />
    </div>
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
