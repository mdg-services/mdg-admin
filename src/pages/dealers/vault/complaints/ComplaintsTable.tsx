import { Wrench } from 'lucide-react';

import { Badge, DataList, DealerChip, EmptyState } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { ComplaintAdminRow } from '@dk/shared';

import { ageText, originLabel, ROUTE_SHORT, STAGE_INTENT, STAGE_WORDS } from './format';

/**
 * The complaints as a table at md+ and a card stack below. Used by the outlet's pane
 * and by the cross-outlet page, which adds the outlet column.
 *
 * The portal's own status words are printed verbatim in small text under the stage
 * badge: the stage is MDG's reading of them, and when the two disagree a person has to
 * be able to see what the portal actually said.
 */
export function ComplaintsTable({
  rows,
  now,
  onOpen,
  showOutlet = false,
  loading,
  empty,
}: {
  rows: readonly ComplaintAdminRow[];
  now: number;
  onOpen: (row: ComplaintAdminRow) => void;
  showOutlet?: boolean;
  loading?: boolean;
  empty?: React.ReactNode;
}) {
  return (
    <DataList<ComplaintAdminRow>
      rows={rows}
      rowKey={(r) => r.id}
      loading={loading}
      cardVariant="rows"
      minWidth="52rem"
      onRowClick={onOpen}
      empty={
        empty ?? (
          <EmptyState
            icon={<Wrench width={24} height={24} strokeWidth={1.75} />}
            title="No complaints"
            description="Nothing to show here."
          />
        )
      }
      columns={[
        {
          id: 'complaint',
          header: 'Complaint',
          mobile: 'primary',
          cell: (r) => (
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-text">{ROUTE_SHORT[r.route]}</span>
                <Badge intent={r.origin === 'chat' ? 'info' : 'neutral'}>{originLabel(r)}</Badge>
                {r.attention ? <Badge intent="danger">Needs a person</Badge> : null}
              </div>
              <p className="mt-0.5 text-sm text-text-muted">{r.title}</p>
            </div>
          ),
        },
        ...(showOutlet
          ? [
              {
                id: 'outlet',
                header: 'Outlet',
                mobile: 'secondary' as const,
                width: '6rem',
                cell: (r: ComplaintAdminRow) => (
                  // A chip is a link; inside a clickable row it could not fire, so it is plain text here.
                  <span className="inline-flex items-center gap-2">
                    <DealerChip dealerId={r.dealerId} code={r.dealerCode} linkTo={false} />
                    <span className="text-xs text-text-subtle md:hidden">{r.dealerName}</span>
                  </span>
                ),
              },
            ]
          : []),
        {
          id: 'number',
          header: 'Number',
          mobile: 'meta',
          mobileLabel: 'Number',
          width: '8rem',
          cell: (r) => (
            <span className="select-text whitespace-nowrap tabular-nums text-sm text-text">
              {r.number ? `#${r.number}` : '-'}
            </span>
          ),
        },
        {
          id: 'stage',
          header: 'Where it stands',
          mobile: 'primaryRight',
          width: '13rem',
          cell: (r) => (
            <span className="flex flex-col items-start gap-1">
              <Badge intent={STAGE_INTENT[r.stage]}>{STAGE_WORDS[r.stage]}</Badge>
              {r.portalStatus ? (
                <span className="text-xs text-text-subtle [overflow-wrap:anywhere]">
                  Portal: {r.portalStatus}
                </span>
              ) : null}
            </span>
          ),
        },
        {
          id: 'filed',
          header: 'Filed',
          mobile: 'kv',
          width: '7rem',
          cell: (r) => (
            <span className="text-xs text-text-muted" title={r.filedAt ? formatDateTime(r.filedAt) : undefined}>
              {r.filedAt ? ageText(r.filedAt, now) : 'not filed'}
            </span>
          ),
        },
        {
          id: 'updated',
          header: 'Updated',
          mobile: 'kv',
          width: '7rem',
          cell: (r) => (
            <span className="text-xs text-text-muted" title={formatDateTime(r.updatedAt)}>
              {ageText(r.updatedAt, now)}
            </span>
          ),
        },
      ]}
    />
  );
}
