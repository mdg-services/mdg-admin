import { Fuel } from 'lucide-react';

import {
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
import { formatDateTime } from '@/lib/format';
import type { FuelIndentVaultView } from '@dk/shared';

import { klText, productName } from './format';

/**
 * The fuels this outlet may order, as the portal's Create Indent screen lists
 * them. The robot finds each fuel's row on that screen by its SMS code, so a
 * fuel missing here is a fuel the assistant cannot order — this is where an
 * admin looks when an owner says "it won't take my XtraGreen order".
 *
 * A row on a contract is shown but marked: the portal will not mix contract and
 * normal fuels in one order, and MDG never places contract orders (ADR 0041 §7).
 */
export function ProductsCard({
  catalog,
  isMd,
}: {
  catalog: FuelIndentVaultView['catalog'];
  isMd: boolean;
}) {
  const products = catalog?.products ?? [];
  return (
    <Card>
      <CardContent padding="none" className="md:p-4">
        <CardHeader align="center" padding="comfortable">
          <p className="text-base font-semibold text-text">Fuels this outlet can order</p>
          <p className="text-sm text-text-muted">
            {catalog?.capturedAt
              ? `As the portal listed them on ${formatDateTime(catalog.capturedAt)}. Read again when older than 7 days.`
              : 'Not read from the portal yet. It is read on the next visit to the portal.'}
          </p>
          {catalog?.minTotalKlRefused ? (
            <p className="mt-1 text-sm text-text-muted">
              The plant refused an order of {klText(catalog.minTotalKlRefused)} KL as smaller than its
              smallest tanker, so its minimum is more than that.
            </p>
          ) : null}
        </CardHeader>
        {products.length === 0 ? (
          <EmptyState
            icon={<Fuel width={28} height={28} strokeWidth={1.75} />}
            title="No fuel list yet"
            description="Until the portal’s list is read, the assistant cannot place an order for this outlet."
          />
        ) : isMd ? (
          <Table>
            <THead>
              <TRow>
                <TH>Fuel</TH>
                <TH>Portal code</TH>
                <TH>Portal group</TH>
                <TH>Contract</TH>
              </TRow>
            </THead>
            <TBody>
              {products.map((p) => (
                <TRow key={p.smscd}>
                  <TD>{productName(p.product, 'Not recognised')}</TD>
                  <TD className="tabular-nums">{p.smscd}</TD>
                  <TD>{p.matkl || '-'}</TD>
                  <TD>{p.contract ? `${p.contract} (not ordered through MDG)` : 'None'}</TD>
                </TRow>
              ))}
            </TBody>
          </Table>
        ) : (
          <MobileCardList
            variant="rows"
            cards={products.map((p) => ({
              key: p.smscd,
              primary: (
                <span className="block font-medium text-text">
                  {productName(p.product, 'Not recognised')}
                </span>
              ),
              primaryRight: <span className="tabular-nums text-text-muted">{p.smscd}</span>,
              secondary: p.matkl ? <span>{p.matkl}</span> : undefined,
              meta: p.contract ? (
                <span>On contract {p.contract}, not ordered through MDG.</span>
              ) : undefined,
            }))}
          />
        )}
      </CardContent>
    </Card>
  );
}
