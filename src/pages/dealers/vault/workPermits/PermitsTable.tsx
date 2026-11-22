import { ShieldCheck } from 'lucide-react';

import { Badge, DataList, DealerChip, EmptyState } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { WorkPermitAdminRow } from '@dk/shared';

import { ageText, STAGE_INTENT, STAGE_WORDS } from './format';

/** The permits as a table at md+ and a card stack below. Used by the outlet's pane and the cross-outlet page. */
export function PermitsTable({
  rows,
  now,
  onOpen,
  showOutlet = false,
  loading,
  empty,
}: {
  rows: readonly WorkPermitAdminRow[];
  now: number;
  onOpen: (row: WorkPermitAdminRow) => void;
  showOutlet?: boolean;
  loading?: boolean;
  empty?: React.ReactNode;
}) {
  return (
    <DataList<WorkPermitAdminRow>
      rows={rows}
      rowKey={(r) => r.id}
      loading={loading}
      cardVariant="rows"
      minWidth="52rem"
      onRowClick={onOpen}
      empty={
        empty ?? (
          <EmptyState
            icon={<ShieldCheck width={24} height={24} strokeWidth={1.75} />}
            title="No work permits"
            description="Nothing to show here."
          />
        )
      }
      columns={[
        {
          id: 'permit',
          header: 'Permit',
          mobile: 'primary',
          cell: (r) => (
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-text">{r.title}</span>
                {r.attention ? <Badge intent="danger">Needs a person</Badge> : null}
              </div>
              <p className="mt-0.5 text-sm text-text-muted">
                {[r.vendor?.name ?? r.vendor?.code, r.vendorRep?.name].filter(Boolean).join(' · ') || '-'}
              </p>
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
                cell: (r: WorkPermitAdminRow) => (
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
            <Badge intent={STAGE_INTENT[r.stage]}>{STAGE_WORDS[r.stage]}</Badge>
          ),
        },
        {
          id: 'window',
          header: 'Work window',
          mobile: 'kv',
          width: '11rem',
          cell: (r) => (
            <span className="text-xs text-text-muted">
              {r.validFrom && r.validTill
                ? `${formatDateTime(r.validFrom)} to ${formatDateTime(r.validTill)}`
                : '-'}
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
