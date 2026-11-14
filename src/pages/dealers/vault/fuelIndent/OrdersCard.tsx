import { ClipboardList } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  MobileCardList,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
} from '@/components/ui';
import { useSettleUnclearCancel } from '@/hooks/api/useFuelIndent';
import { formatDateTime, formatYmd } from '@/lib/format';
import type { FuelOrderView } from '@dk/shared';

import { datesText, linesText, portalTimeText, tankerMessageWords } from './format';

/**
 * The outlet's orders as IndianOil's View/Cancel Indents lists them: those placed
 * through the chat and those placed directly on the portal, side by side,
 * because a dealer asking "where is my tanker?" does not care which way they
 * ordered.
 *
 * The status column is the portal's own "Order Execution Status", word for word.
 * It is not coloured: the full list of those words is not known yet, and a
 * colour would be a guess about what a sentence we have never seen means.
 */
export function OrdersCard({
  orders,
  isMd,
  dealerId,
}: {
  orders: FuelOrderView[];
  isMd: boolean;
  /** For settling a cancel whose answer was lost; without it the buttons are not shown. */
  dealerId?: string;
}) {
  const waiting = orders.filter((o) => o.waitingForTanker).length;
  return (
    <Card>
      {/* `padding="none"` so the phone rows sit flush; the table gets its inset back from md. */}
      <CardContent padding="none" className="md:p-4">
        <CardHeader
          align="center"
          padding="comfortable"
          action={
            waiting > 0 ? (
              <Badge intent="warning" className="tabular-nums">
                {waiting} waiting for a tanker
              </Badge>
            ) : undefined
          }
        >
          <p className="text-base font-semibold text-text">Orders on the portal</p>
          <p className="text-sm text-text-muted">
            Every order the portal lists for this outlet in the last few days, whoever placed it.
          </p>
        </CardHeader>

        {orders.length === 0 ? (
          <EmptyState
            icon={<ClipboardList width={28} height={28} strokeWidth={1.75} />}
            title="No orders on the portal"
            description="The portal’s list had no order for this outlet at the last read."
          />
        ) : isMd ? (
          <Table>
            <THead>
              <TRow>
                <TH>Order no.</TH>
                <TH>Ordered on</TH>
                <TH>Fuels</TH>
                <TH>Delivery wanted</TH>
                <TH>Portal status</TH>
                <TH>Tanker no.</TH>
                <TH>Shipment time</TH>
                <TH>Invoice no.</TH>
                <TH>Placed from</TH>
                <TH>Tanker message</TH>
              </TRow>
            </THead>
            <TBody>
              {orders.map((o) => {
                const msg = tankerMessageWords(o.tankerMessage, !!o.ttNo);
                return (
                  <TRow key={o.id}>
                    <TD className="whitespace-nowrap font-medium tabular-nums">{o.sapOrderNo}</TD>
                    <TD className="whitespace-nowrap">{formatYmd(o.orderDate)}</TD>
                    <TD>{linesText(o.lines)}</TD>
                    <TD className="whitespace-nowrap">{datesText(o.deliveryDates)}</TD>
                    <TD>
                      <StatusCell order={o} dealerId={dealerId} />
                    </TD>
                    <TD className="whitespace-nowrap tabular-nums">{o.ttNo ?? '-'}</TD>
                    <TD className="whitespace-nowrap">{portalTimeText(o.shipmentAt)}</TD>
                    <TD className="whitespace-nowrap tabular-nums">{o.invoiceNo ?? '-'}</TD>
                    <TD className="whitespace-nowrap">{o.source === 'chat' ? 'Chat' : 'Portal'}</TD>
                    <TD className="whitespace-nowrap">
                      <Badge intent={msg.intent}>{msg.label}</Badge>
                    </TD>
                  </TRow>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <MobileCardList
            variant="rows"
            cards={orders.map((o) => {
              const msg = tankerMessageWords(o.tankerMessage, !!o.ttNo);
              return {
                key: o.id,
                primary: (
                  <span className="block font-medium tabular-nums text-text">
                    Order {o.sapOrderNo}
                  </span>
                ),
                primaryRight: o.waitingForTanker ? (
                  <Badge intent="warning">Waiting for tanker</Badge>
                ) : o.ttNo ? (
                  <Badge intent="success">Tanker {o.ttNo}</Badge>
                ) : undefined,
                primaryRightWidth: 'clamp' as const,
                secondary: <span>{linesText(o.lines)}</span>,
                kv: [
                  { label: 'Ordered on', value: formatYmd(o.orderDate) },
                  { label: 'Delivery wanted', value: datesText(o.deliveryDates) },
                  { label: 'Portal status', value: <StatusCell order={o} dealerId={dealerId} /> },
                  { label: 'Shipment time', value: portalTimeText(o.shipmentAt) },
                  { label: 'Invoice no.', value: o.invoiceNo ?? '-' },
                  { label: 'Placed from', value: o.source === 'chat' ? 'Chat' : 'Portal' },
                  { label: 'Tanker message', value: msg.label },
                ],
              };
            })}
          />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The portal's status verbatim, with the two things beside it that change what
 * an admin tells the dealer: why the portal has not executed it, and a cancel
 * in progress. When it was last seen on the list is on hover, for a status that
 * looks stuck.
 */
function StatusCell({ order: o, dealerId }: { order: FuelOrderView; dealerId?: string }) {
  return (
    <span className="block min-w-0 break-words" title={o.lastSeenAt ? `Last seen on the list ${formatDateTime(o.lastSeenAt)}` : undefined}>
      {o.status ?? 'No status yet'}
      {o.notExecutedReason ? (
        <span className="mt-0.5 block text-xs text-text-muted">{o.notExecutedReason}</span>
      ) : null}
      {o.cancel?.state === 'cancelled' ? (
        <span className="mt-0.5 block text-xs text-text-muted">Cancelled through the chat</span>
      ) : null}
      {o.cancel?.state === 'unclear' && dealerId ? <SettleCancel dealerId={dealerId} indentId={o.id} /> : null}
    </span>
  );
}

/**
 * A cancel was pressed and its answer lost, and the list could not settle it (the
 * order left the portal's window first). A person checks the portal and records
 * how it ended; nothing is pressed from here, and the owner is told the outcome.
 */
function SettleCancel({ dealerId, indentId }: { dealerId: string; indentId: string }) {
  const settle = useSettleUnclearCancel(dealerId);
  return (
    <span className="mt-1 block text-xs text-text-muted">
      Cancel pressed, answer not read. After checking the portal:
      <span className="mt-1 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={settle.isPending}
          onClick={() => settle.mutate({ indentId, outcome: 'cancelled' })}
        >
          It was cancelled
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={settle.isPending}
          onClick={() => settle.mutate({ indentId, outcome: 'not_cancelled' })}
        >
          It was not cancelled
        </Button>
      </span>
    </span>
  );
}
