import {
  ArrowDownLeft,
  ArrowUpRight,
  AudioLines,
  BadgeCheck,
  BellOff,
  Clapperboard,
  ClipboardPen,
  Headset,
  PenLine,
  Phone,
  PhoneCall,
  PhoneIncoming,
  Send,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui';
import { istStamp } from '@/lib/intake';
import type { LeadTimelineItem, LeadTimelineKind } from '@dk/shared';

/** One glyph per kind of thing that can happen, so the eye can run down the list before it reads it. */
const ICONS: Record<LeadTimelineKind, LucideIcon> = {
  film_visit: Clapperboard,
  campaign_sent: Send,
  whatsapp_in: ArrowDownLeft,
  whatsapp_out: ArrowUpRight,
  call_me: PhoneCall,
  callback: PhoneIncoming,
  registration: ClipboardPen,
  registration_call: Phone,
  client: BadgeCheck,
  assistant: Headset,
  opted_out: BellOff,
  activity: PenLine,
  call_recording: AudioLines,
};

/** Shown first. The server sends up to 150, newest first, and a phone does not want them all at once. */
const FIRST = 12;

/**
 * Everything we know happened with this person, from every source, newest
 * first: their visits, the messages both ways, what they tapped, their
 * registration, and what the team did. Worded on the server, so this only draws
 * it; an item that has a page behind it links there.
 */
export function LeadTimeline({ items, now }: { items: readonly LeadTimelineItem[]; now: number }) {
  const [all, setAll] = React.useState(false);
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">Nothing has happened yet.</p>;
  }
  const shown = all ? items : items.slice(0, FIRST);
  return (
    <div>
      <ol className="grid gap-3">
        {shown.map((it, i) => {
          const Icon = ICONS[it.kind];
          return (
            <li key={`${it.at}-${it.kind}-${i}`} className="flex min-w-0 gap-2.5">
              <span
                aria-hidden
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-muted"
              >
                <Icon width={13} height={13} strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
                <p className="font-medium text-text">{it.title}</p>
                {it.detail ? (
                  <p className="mt-0.5 select-text whitespace-pre-wrap text-text-muted">{it.detail}</p>
                ) : null}
                <p className="mt-0.5 text-xs text-text-subtle">
                  {istStamp(it.at, now)}
                  {it.by ? ` · ${it.by}` : ''}
                  {it.href && it.href.startsWith('/') ? (
                    <>
                      {' · '}
                      <Link
                        to={it.href}
                        className="inline-flex min-h-11 items-center rounded-sm text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
                      >
                        Open
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {items.length > FIRST ? (
        <Button
          variant="ghost"
          size="sm"
          tone="brand"
          padding="none"
          align="start"
          className="mt-2"
          onClick={() => setAll((v) => !v)}
        >
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </Button>
      ) : null}
    </div>
  );
}
