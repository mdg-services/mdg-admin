import { FileText } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  MobileCardList,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
} from '@/components/ui';
import { formatYmd } from '@/lib/format';
import type { TtInvoiceSummary } from '@dk/shared';

import { compareInvoiceRows, densityCellLines } from './format';

/**
 * The tanker invoices under the headline: one row per delivery, five columns.
 *
 * Five, and no more. Invoice total, document number, delivery number, sales
 * order, tank numbers, compartments and sample references are all real and all
 * live in the drawer — a table carrying them would be the dense spreadsheet this
 * screen was asked not to be, and none of them is what an operator came here to
 * read. The list is about density.
 *
 * The quantity beside each figure (`727.300 · 6 KL`) rides on the summary rather
 * than being fetched: a row that had to load its own invoice to print `6 KL`
 * would be one request per row, on a card that shows twenty.
 */

export interface InvoiceTableProps {
  invoices: TtInvoiceSummary[];
  onOpen: (invoice: TtInvoiceSummary) => void;
}

export function InvoiceTable({ invoices, onOpen }: InvoiceTableProps) {
  const rows = React.useMemo(
    () => [...invoices].sort(compareInvoiceRows),
    [invoices],
  );

  return (
    <>
      {/* Desktop table (≥ md). The pane's `min-w-0` track keeps a wide table
          scrolling inside its own card rather than sideways across the page. */}
      <div className="hidden md:block">
        <Table>
          <THead>
            <TRow>
              <TH>Inv date</TH>
              <TH>SAP invoice #</TH>
              <TH>Tanker</TH>
              <TH>Density@15</TH>
              <TH className="text-right">Invoice</TH>
            </TRow>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TRow key={row.id} clickable onClick={() => onOpen(row)}>
                <TD className="whitespace-nowrap">{formatYmd(row.invoiceDate)}</TD>
                <TD className="font-mono text-xs text-text-muted">
                  {row.sapInvoiceNo}
                </TD>
                <TD className="whitespace-nowrap font-mono">
                  {row.vehicleNo || '—'}
                </TD>
                <TD>
                  <DensityCell densities={row.densities} />
                </TD>
                <TD className="whitespace-nowrap text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<FileText width={14} height={14} strokeWidth={1.75} />}
                    onClick={(e) => {
                      // Mandatory inside a clickable TRow: without it the row's
                      // own handler fires too and the drawer opens twice.
                      e.stopPropagation();
                      onOpen(row);
                    }}
                  >
                    View invoice
                  </Button>
                </TD>
              </TRow>
            ))}
          </TBody>
        </Table>
      </div>

      {/* Mobile card-stack (< md). The whole card is the tap target, so it
          carries no buttons of its own. */}
      <MobileCardList
        className="p-3"
        cards={rows.map((row) => ({
          key: row.id,
          onClick: () => onOpen(row),
          primary: (
            <span className="block truncate font-medium text-text">
              {formatYmd(row.invoiceDate)}
            </span>
          ),
          primaryRight: (
            <span className="whitespace-nowrap text-xs font-medium text-brand">
              View invoice ›
            </span>
          ),
          secondary: (
            <span className="font-mono text-xs">
              {row.sapInvoiceNo}
              {row.vehicleNo ? ` · ${row.vehicleNo}` : ''}
            </span>
          ),
          meta: <DensityCell densities={row.densities} />,
        }))}
      />
    </>
  );
}

/** One row's density lines, capped at three with a `+N more`. */
function DensityCell({ densities }: { densities: TtInvoiceSummary['densities'] }) {
  const { lines, moreCount } = densityCellLines(densities);
  if (lines.length === 0) {
    return <span className="text-text-subtle">No density read</span>;
  }
  return (
    <span className="flex flex-col gap-0.5">
      {lines.map((line) => (
        <span key={line.key} className="flex items-center gap-1.5">
          <Badge intent="neutral" className="text-[10px]">
            {line.chip}
          </Badge>
          <span className="font-medium tabular-nums">{line.text}</span>
        </span>
      ))}
      {moreCount > 0 ? (
        <span className="text-xs text-text-subtle">+{moreCount} more</span>
      ) : null}
    </span>
  );
}
