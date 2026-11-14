import { MessageSquareText } from 'lucide-react';
import type * as React from 'react';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  MobileCardList,
  type MobileCard,
  type MobileCardKv,
} from '@/components/ui';
import { formatDateTime, formatYmd, inrFormat } from '@/lib/format';
import type { FuelDraftView, FuelOrderView } from '@dk/shared';

import {
  cancelText,
  datesText,
  draftLinesText,
  linesText,
  STATE_WORDS,
  submitReasonText,
} from './format';
import { OrderTimeline, SettlePress } from './OrderTimeline';

/**
 * Every order an owner asked for in the chat, from the first message to the
 * portal's answer: the ones still being put together, the ones read back and
 * waiting for a yes, and the ones that went to the portal.
 *
 * WHY THIS IS NOT FOLDED INTO THE PORTAL TABLE: a refused or unclear order has
 * no portal row at all, and those are exactly the ones a dealer rings about
 * ("I said yes, where is my order?"). This card answers that call: who said yes,
 * in what words, when, and what the portal wrote back, word for word. The
 * portal's sentence is never paraphrased here; it is what an engineer needs to
 * teach the reader a new refusal, and what the owner was shown.
 */
export function ChatOrdersCard({
  drafts,
  orders,
  dealerId,
}: {
  drafts: FuelDraftView[];
  orders: FuelOrderView[];
  /** For settling a press whose answer was lost; without it the buttons are not shown. */
  dealerId?: string;
}) {
  // Newest first. Drafts are by definition the newest work, so they lead.
  const cards: MobileCard[] = [
    ...drafts.map(draftCard),
    ...orders.filter((o) => o.source === 'chat').map((o) => orderCard(o, dealerId)),
  ];

  return (
    <Card>
      <CardContent padding="none" className="md:p-4">
        <CardHeader align="center" padding="comfortable">
          <p className="text-base font-semibold text-text">Orders asked for in the chat</p>
          <p className="text-sm text-text-muted">
            What the owner asked for, who said yes and when, and what the portal answered.
          </p>
        </CardHeader>
        {cards.length === 0 ? (
          <EmptyState
            icon={<MessageSquareText width={28} height={28} strokeWidth={1.75} />}
            title="No order asked for in the chat"
            description="When an owner asks the assistant for a load, the order shows here from the first message."
          />
        ) : (
          // At every width: each entry is a short story with sentences in it,
          // and a table would crush the portal's words into a narrow column.
          <MobileCardList variant="rows" visibility="all" cards={cards} />
        )}
      </CardContent>
    </Card>
  );
}

function StateBadge({ state }: { state: FuelOrderView['state'] }) {
  const w = STATE_WORDS[state];
  return (
    <Badge intent={w.intent} title={w.hint}>
      {w.label}
    </Badge>
  );
}

function draftCard(d: FuelDraftView): MobileCard {
  const tanker =
    d.tanker === 'own'
      ? 'Own tanker'
      : d.tanker === 'hired'
        ? d.transporterTT
          ? 'Hired (owns a tanker, wants a hired one this time)'
          : 'Hired'
        : 'Not answered yet';
  const kv: MobileCardKv[] = [
    { label: 'Delivery date', value: d.deliveryDate ? formatYmd(d.deliveryDate) : 'Not given yet' },
    { label: 'Tanker', value: tanker },
    { label: 'Total', value: `${d.totalKl} KL`, numeric: true },
  ];
  if (d.splitLoad) kv.push({ label: 'Split load', value: 'Asked for' });
  if (d.startedByName) kv.push({ label: 'Started by', value: d.startedByName });
  if (d.updatedAt) kv.push({ label: 'Last change', value: formatDateTime(d.updatedAt) });
  return {
    key: `draft-${d.id}`,
    primary: <span className="block font-medium text-text">{draftLinesText(d.lines)}</span>,
    primaryRight: <StateBadge state={d.state} />,
    primaryRightWidth: 'clamp',
    secondary: <span>{STATE_WORDS[d.state].hint}</span>,
    kv,
  };
}

function orderCard(o: FuelOrderView, dealerId?: string): MobileCard {
  const kv: MobileCardKv[] = [{ label: 'Delivery date', value: datesText(o.deliveryDates) }];
  if (o.sapOrderNo) kv.push({ label: 'Order no.', value: o.sapOrderNo, numeric: true });
  if (o.confirmed) {
    kv.push({
      label: 'Yes from',
      value: `${o.confirmed.byName ?? 'An owner'}${o.confirmed.at ? `, ${formatDateTime(o.confirmed.at)}` : ''}`,
    });
  }
  if (o.submit?.at) kv.push({ label: 'Sent to the portal', value: formatDateTime(o.submit.at) });
  if (o.submit?.shortBy !== null && o.submit?.shortBy !== undefined) {
    kv.push({ label: 'Short by', value: inrFormat(o.submit.shortBy), numeric: true });
  }

  const reason = submitReasonText(o.submit?.reason);
  const cancel = cancelText(o.cancel);
  const meta: React.ReactNode[] = [];
  if (o.confirmed?.text) {
    meta.push(<Quote key="yes" label="The owner wrote" text={o.confirmed.text} />);
  }
  // A placed order's reason is empty; a refused or not-pressed one's says why in our words.
  if (reason && o.state !== 'placed') meta.push(<span key="reason" className="block">{reason}</span>);
  if (o.submit?.portalText) {
    meta.push(<Quote key="portal" label="The portal said" text={o.submit.portalText} />);
  } else if (o.state === 'unclear' || o.state === 'refused') {
    meta.push(
      <span key="portal" className="block">
        The portal’s answer was not captured.
      </span>,
    );
  }
  if (o.state === 'unclear' && !o.sapOrderNo && dealerId) {
    meta.push(<SettlePress key="settle" dealerId={dealerId} indentId={o.id} />);
  }
  if (o.trail?.extraConfirmed) {
    meta.push(
      <span key="extra" className="block">
        The owner said yes to ONE MORE load on top of an order already there.
      </span>,
    );
  }
  if (cancel) {
    meta.push(
      <span key="cancel" className="block">
        {cancel}
        {o.cancel?.at ? ` (${formatDateTime(o.cancel.at)})` : ''}.
      </span>,
    );
    if (o.cancel?.portalText) {
      meta.push(<Quote key="cancel-portal" label="The portal said" text={o.cancel.portalText} />);
    }
  }

  if (o.trail) meta.push(<OrderTimeline key="timeline" order={o} />);

  return {
    key: `order-${o.id}`,
    primary: <span className="block font-medium text-text">{linesText(o.lines)}</span>,
    primaryRight: <StateBadge state={o.state} />,
    primaryRightWidth: 'clamp',
    secondary: <span>{STATE_WORDS[o.state].hint}</span>,
    kv,
    meta: meta.length > 0 ? <span className="grid gap-1">{meta}</span> : undefined,
  };
}

/** Someone else's words, verbatim, set apart so nobody mistakes them for ours. */
function Quote({ label, text }: { label: string; text: string }) {
  return (
    <span className="block break-words">
      <span className="text-text-subtle">{label}: </span>
      <q className="text-text">{text}</q>
    </span>
  );
}
