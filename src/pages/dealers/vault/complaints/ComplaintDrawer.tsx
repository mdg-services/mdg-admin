import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge, Callout, DealerChip, Drawer, KeyValueList, type KeyValueItem } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { ComplaintAdminRow } from '@dk/shared';

import {
  ATTENTION_WORDS,
  originLabel,
  paneHref,
  ROUTE_LABELS,
  STAGE_INTENT,
  STAGE_WORDS,
} from './format';
import { SettleActions } from './SettleActions';

const BY_WORDS = { dealer: 'dealer', robot: 'robot', admin: 'team', portal: 'portal' } as const;

/**
 * One complaint in full: what was filed, the portal's words as they are, the engineer,
 * what the team has to settle, and the whole timeline oldest first.
 *
 * It is handed the row, not a copy: the caller looks the row up again from the latest
 * list each render, so a settle or a socket refresh shows here at once.
 */
export function ComplaintDrawer({
  row,
  onClose,
  showOutletLink,
}: {
  row: ComplaintAdminRow | null;
  onClose: () => void;
  /** The cross-outlet page links to the outlet's pane; the pane itself does not. */
  showOutletLink?: boolean;
}) {
  if (!row) return null;
  const fieldItems: KeyValueItem[] = Object.entries(row.fields).map(([k, v]) => ({
    key: `f:${k}`,
    label: k,
    value: v,
  }));
  const remarkItems: KeyValueItem[] = Object.entries(row.portalRemarks ?? {}).map(([k, v]) => ({
    key: `r:${k}`,
    label: k,
    value: v,
    block: true,
  }));
  const eng = row.engineer;
  const engineerText = eng
    ? [eng.name, eng.phone, eng.etaHours ? `${eng.etaHours} h promised` : null].filter(Boolean).join(' · ')
    : '';

  const summary: KeyValueItem[] = [
    {
      key: 'outlet',
      label: 'Outlet',
      value: (
        <span className="inline-flex flex-wrap items-center gap-2">
          <DealerChip dealerId={row.dealerId} code={row.dealerCode} linkTo={false} />
          <span>{row.dealerName}</span>
          {showOutletLink ? (
            <Link
              to={paneHref(row.dealerId)}
              className="inline-flex items-center gap-1 text-brand underline"
            >
              Open the outlet’s complaints
              <ExternalLink width={12} height={12} strokeWidth={1.75} aria-hidden />
            </Link>
          ) : null}
        </span>
      ),
    },
    { key: 'route', label: 'Portal', value: ROUTE_LABELS[row.route] },
    { key: 'number', label: 'Number', value: row.number ? `#${row.number}` : 'Not filed yet', copyable: !!row.number },
    { key: 'origin', label: 'Origin', value: originLabel(row) },
    ...(row.raisedBy ? [{ key: 'by', label: 'Raised by', value: row.raisedBy }] : []),
    ...(row.portalStatus ? [{ key: 'ps', label: 'Portal status', value: row.portalStatus }] : []),
    ...(engineerText ? [{ key: 'eng', label: 'Engineer', value: engineerText }] : []),
    ...(row.filedAt ? [{ key: 'filed', label: 'Filed', value: formatDateTime(row.filedAt) }] : []),
    ...(row.lastReadAt ? [{ key: 'read', label: 'Last read on portal', value: formatDateTime(row.lastReadAt) }] : []),
    { key: 'created', label: 'Started', value: formatDateTime(row.createdAt) },
  ];

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={row.title}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Badge intent={STAGE_INTENT[row.stage]}>{STAGE_WORDS[row.stage]}</Badge>
          {row.attention ? <Badge intent="danger">Needs a person</Badge> : null}
        </span>
      }
    >
      <div className="grid gap-4 text-sm">
        {row.attention ? (
          <Callout>
            {ATTENTION_WORDS[row.attention]}
            {row.attentionDetail ? (
              <span className="mt-1 block select-text [overflow-wrap:anywhere]">
                The portal said: {row.attentionDetail}
              </span>
            ) : null}
          </Callout>
        ) : null}

        <SettleActions row={row} />

        <KeyValueList items={summary} />

        {fieldItems.length > 0 ? (
          <section className="grid gap-1">
            <h3 className="text-sm font-semibold text-text">What was filed</h3>
            <KeyValueList items={fieldItems} />
          </section>
        ) : null}

        {row.remark ? (
          <section className="grid gap-1">
            <h3 className="text-sm font-semibold text-text">Remark sent to IndianOil</h3>
            <p className="select-text whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-2 text-text">
              {row.remark}
            </p>
          </section>
        ) : null}

        {remarkItems.length > 0 ? (
          <section className="grid gap-1">
            <h3 className="text-sm font-semibold text-text">Vendor and IndianOil remarks, word for word</h3>
            <KeyValueList items={remarkItems} layout="stacked" />
          </section>
        ) : null}

        <section className="grid gap-1">
          <h3 className="text-sm font-semibold text-text">Timeline</h3>
          {row.history.length === 0 ? (
            <p className="text-text-muted">Nothing recorded yet.</p>
          ) : (
            <ol className="grid gap-2">
              {row.history.map((h, i) => (
                <li key={i} className="grid gap-0.5 border-l-2 border-border pl-3">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-subtle">
                    <span className="tabular-nums">{formatDateTime(h.at)}</span>
                    <Badge intent={STAGE_INTENT[h.stage]}>{STAGE_WORDS[h.stage]}</Badge>
                    {h.by ? <span>by {BY_WORDS[h.by]}</span> : null}
                  </span>
                  <span className="select-text text-text [overflow-wrap:anywhere]">{h.note}</span>
                  {h.portalStatus ? (
                    <span className="select-text text-xs text-text-subtle [overflow-wrap:anywhere]">
                      Portal: {h.portalStatus}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Drawer>
  );
}
