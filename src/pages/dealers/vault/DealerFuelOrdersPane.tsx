import { AlertCircle, ClipboardList, DownloadCloud, Plug, Truck } from 'lucide-react';

import { RunPlaceButton } from '@/components/RunPlaceButton';
import { Button, Callout, Card, CardContent, EmptyState, Skeleton, useToast } from '@/components/ui';
import { useDealerServicesQuery, useRunNow } from '@/hooks/api/useDealerServices';
import { useFuelIndentView } from '@/hooks/api/useFuelIndent';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { StatTile, StatTileRow, StatTileSkeletons } from '@/pages/dataVault/StatTile';
import { dealerCodeLabel, FUEL_INDENT_SERVICE_ID, type BrowserPlace } from '@dk/shared';

import { ChatOrdersCard } from './fuelIndent/ChatOrdersCard';
import { placingOffText } from './fuelIndent/format';
import { OrdersCard } from './fuelIndent/OrdersCard';
import { PlacingControlCard } from './fuelIndent/PlacingControlCard';
import { ProductsCard } from './fuelIndent/ProductsCard';
import { useFuelIndentRunWatcher } from './fuelIndent/useFuelIndentRunWatcher';
import type { DealerVaultPaneProps } from './types';

/**
 * A dealer's fuel orders (ADR 0041): what was ordered on IndianOil's portal,
 * where each order stands, and whether a tanker has been assigned.
 *
 * The question this pane exists to answer is the dealer's phone call: "I asked
 * for a load, where is it?". So it reads top to bottom in the order that call
 * goes: is anything waiting for a tanker, what does the portal list, what did
 * the owner ask for in the chat and what did the portal say back, and finally
 * which fuels the portal will take at all.
 *
 * READ ONLY, deliberately (the writes are recording how an unclear cancel or
 * press ended, after a person checked the portal, and pausing PLACING for the
 * outlet or everywhere). Placing and cancelling happen only on an owner's
 * "yes" in the chat, checked by code (ADR 0041 §6); an admin button that placed
 * an order would be a second way in that skips the owner. "Check now" reads the
 * portal's list. If a confirmed order is still waiting to be placed, that same
 * run places it, because any non-attach run carries out a waiting confirmed
 * write — which is what the owner already asked for.
 */
export function DealerFuelOrdersPane({ dealer }: DealerVaultPaneProps) {
  // Which shape to BUILD, not just which to show: a table and a card stack are
  // the same rows twice, and building the hidden one costs a phone real work.
  const isMd = useMediaQuery('(min-width: 768px)');
  const toast = useToast();
  const viewQ = useFuelIndentView(dealer.id);
  // The view carries no attachment id, and the run-now endpoint needs one. The
  // dealer's services list is already cached by the Services tab and the rail.
  const servicesQ = useDealerServicesQuery(dealer.id);
  const attachment = servicesQ.data?.find((s) => s.serviceId === FUEL_INDENT_SERVICE_ID) ?? null;
  const runNow = useRunNow(dealer.id);
  const runWatch = useFuelIndentRunWatcher(dealer.id);
  const busy = runNow.isPending || runWatch.busy;

  function runCheck(browserOn: BrowserPlace = 'server') {
    if (!attachment) return;
    runNow.mutate(
      { dsId: attachment.id, body: browserOn === 'laptop' ? { browserOn } : {} },
      {
        onSuccess: (res) => {
          runWatch.watch(res.runId);
          toast.success('Checking. The portal takes about a minute; this section refreshes when it is done.');
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Could not start the check'),
      },
    );
  }

  const checkButton = (
    <RunPlaceButton
      serviceId={FUEL_INDENT_SERVICE_ID}
      variant="secondary"
      size="sm"
      loading={busy}
      disabled={!attachment}
      leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
      onRun={runCheck}
    >
      Check now
    </RunPlaceButton>
  );

  if (viewQ.isLoading) {
    return (
      <div className="grid gap-3 md:gap-4">
        <StatTileSkeletons count={3} />
        <Card>
          <CardContent className="grid gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (viewQ.isError) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load the fuel orders"
        description={viewQ.error instanceof ApiError ? viewQ.error.message : 'Please try again.'}
        cta={
          <Button variant="secondary" size="sm" onClick={() => void viewQ.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const view = viewQ.data!;
  // Only portal orders have a row on View/Cancel Indents. A chat order the
  // portal refused never got a number, and lives only in the chat card.
  const portalOrders = view.orders.filter((o) => o.sapOrderNo);
  const waiting = portalOrders.filter((o) => o.waitingForTanker).length;
  const withTanker = portalOrders.filter((o) => o.ttNo).length;
  const inChat = view.drafts.length;
  const notAttached = !servicesQ.isLoading && !attachment && view.attachment.status === null;

  if (notAttached && view.orders.length === 0 && view.drafts.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<Plug width={28} height={28} strokeWidth={1.75} />}
            title={`Fuel orders are not set up for ${dealerCodeLabel(dealer.code)}`}
            description="Attach Fuel orders from the Services tab. The outlet’s orders on the portal then show here."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 md:gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text">Fuel orders</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Outlet {dealerCodeLabel(dealer.code)} · Last checked{' '}
            {view.lastCheckedAt ? formatDateTime(view.lastCheckedAt) : 'never'}
            {view.attachment.nextRunAt
              ? ` · Next check ${formatDateTime(view.attachment.nextRunAt)}`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{checkButton}</div>
      </div>

      {view.attachment.status === 'PAUSED' ? (
        <Callout>
          Fuel orders are paused for this outlet, so the portal is not checked by itself and the
          dealer is not told about tankers. Switch it on from the Services tab.
        </Callout>
      ) : !view.placingEnabled ? (
        // Tracking carries on whatever this says; only placing and cancelling stop.
        <Callout>
          {placingOffText(view.placingBlock)} Orders already on the portal are still checked, and
          the dealer is still told when a tanker is assigned.
        </Callout>
      ) : null}

      <StatTileRow>
        <StatTile
          label="Waiting for a tanker"
          value={waiting}
          tone="warning"
          icon={<Truck width={16} height={16} strokeWidth={1.75} />}
          hint={
            waiting > 0
              ? 'Checked at 7:30, 8:00, 8:30, 9:00 and 15:00 (also 17:00 and 19:00 when one is due today), and on every portal visit'
              : 'Nothing waiting'
          }
        />
        <StatTile
          label="Tanker assigned"
          value={withTanker}
          tone="neutral"
          icon={<Truck width={16} height={16} strokeWidth={1.75} />}
          hint={`of ${portalOrders.length} on the portal`}
        />
        <StatTile
          label="Being asked for in the chat"
          value={inChat}
          tone="neutral"
          icon={<ClipboardList width={16} height={16} strokeWidth={1.75} />}
          hint={inChat > 0 ? 'Not confirmed yet' : 'None open'}
        />
      </StatTileRow>

      <OrdersCard orders={portalOrders} isMd={isMd} dealerId={dealer.id} />
      <ChatOrdersCard drafts={view.drafts} orders={view.orders} dealerId={dealer.id} />
      <ProductsCard catalog={view.catalog} isMd={isMd} />
      {view.attachment.status !== null ? <PlacingControlCard view={view} dealerId={dealer.id} /> : null}
    </div>
  );
}
