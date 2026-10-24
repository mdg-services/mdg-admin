import { Target } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useLeadLookupQuery } from '@/hooks/api/useLeads';
import { leadHref, lookupLine } from '@/lib/leads';

/**
 * One line in the WhatsApp inbox's contact panel when the chat is a lead:
 * "Lead L-0007 · Interested · Due tomorrow 11:00 · Open lead".
 *
 * Nothing at all when the chat is not a lead, while it is still being looked up,
 * and when the lookup fails: the panel is about the person, and a missing note
 * about leads is not worth a line of error in it. The line is re-read whenever
 * the Leads queries are (`useLeadsLive`), so a contact logged on the Leads page
 * shows here without a reload.
 */
export function LeadLookupLine({ person }: { person: string }) {
  const q = useLeadLookupQuery(person);
  const lead = q.data;
  if (!lead) return null;
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
