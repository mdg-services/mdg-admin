import { Target } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useLeadLookupQuery } from '@/hooks/api/useLeads';
import { canAddChatAsLead, leadHref, lookupLine } from '@/lib/leads';
import type { WhatsAppLine } from '@dk/shared';

import { AddAsLeadButton } from './AddAsLeadButton';

/**
 * One line in the WhatsApp inbox's contact panel when the chat is a lead:
 * "Lead L-0007 · Interested · Due tomorrow 11:00 · Open lead".
 *
 * When the lookup says the chat is not a lead, in the MDG Services inbox, and
 * the chat is an Indian mobile not on the stop list, the line is an "Add as
 * lead" button instead; once it is pressed the lookup is re-read and the lead's
 * line takes its place. Nothing is offered on the clients line (our outlets and
 * dealers), to somebody who asked us to stop, or for a chat with no number we
 * can make a lead of (a username, a foreign number, a landline).
 *
 * Nothing at all while it is still being looked up, and when the lookup fails:
 * the panel is about the person, and a missing note about leads is not worth a
 * line of error in it (nor an "Add" offered when we cannot tell whether the
 * person is already a lead). The line is re-read whenever
 * the Leads queries are (`useLeadsLive`), so a contact logged on the Leads page
 * shows here without a reload.
 */
export function LeadLookupLine({
  person,
  line,
  stopped,
}: {
  person: string;
  /** The inbox the chat is open in: only the MDG Services (marketing) one finds leads. */
  line: WhatsAppLine;
  /** On the stop list: a lead made now would only close as "asked to stop". */
  stopped: boolean;
}) {
  const q = useLeadLookupQuery(person);
  const lead = q.data;
  if (!lead) {
    if (!q.isSuccess || line !== 'marketing' || stopped || !canAddChatAsLead(person)) return null;
    return (
      <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-sm">
        <Target
          width={14}
          height={14}
          strokeWidth={1.75}
          aria-hidden
          className="shrink-0 text-text-subtle"
        />
        <p className="min-w-0 flex-1 text-text-muted">Not a lead yet</p>
        <AddAsLeadButton person={person} />
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 border-t border-border px-4 py-3 text-sm">
      <Target width={14} height={14} strokeWidth={1.75} aria-hidden className="mt-1 shrink-0 text-text-subtle" />
      <p className="min-w-0 text-text [overflow-wrap:anywhere]">
        {lookupLine(lead, Date.now())}
        {' · '}
        <Link
          to={leadHref(lead.id)}
          className="inline-flex min-h-11 items-center rounded-sm text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
        >
          Open lead
        </Link>
      </p>
    </div>
  );
}
