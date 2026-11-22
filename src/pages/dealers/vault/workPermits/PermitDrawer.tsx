import { ExternalLink, FileText } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import {
  Badge,
  Button,
  Callout,
  DealerChip,
  Drawer,
  ImageLightbox,
  KeyValueList,
  useToast,
  type KeyValueItem,
} from '@/components/ui';
import { fetchPermitFileUrl } from '@/hooks/api/useWorkPermits';
import { useOpenPaper } from '@/hooks/useOpenPaper';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { WorkPermitAdminRow } from '@dk/shared';

import {
  ATTENTION_WORDS,
  complaintText,
  paneHref,
  STAGE_INTENT,
  STAGE_WORDS,
  workText,
} from './format';
import { SettleActions } from './SettleActions';

const BY_WORDS = { dealer: 'dealer', robot: 'robot', admin: 'team', portal: 'SDMS' } as const;

/**
 * One permit in full: who, what work, the window in IST, what the robot read back from
 * the form, the PDF and the letter, what the team has to settle, and the timeline.
 * It is handed the row, not a copy, so a settle or a socket refresh shows at once.
 */
export function PermitDrawer({
  row,
  onClose,
  showOutletLink,
}: {
  row: WorkPermitAdminRow | null;
  onClose: () => void;
  showOutletLink?: boolean;
}) {
  const toast = useToast();
  const [opening, setOpening] = React.useState<'pdf' | 'letter' | null>(null);
  const [showReadBack, setShowReadBack] = React.useState(false);
  // In-app viewers only (the admin phone app hands any other address to the phone's browser).
  const paper = useOpenPaper('Could not open the permit PDF');
  const [letterUrl, setLetterUrl] = React.useState<string | null>(null);
  if (!row) return null;

  async function open(doc: 'pdf' | 'letter') {
    if (!row) return;
    setOpening(doc);
    try {
      const { url } = await fetchPermitFileUrl(row.dealerId, row.id, doc);
      if (doc === 'letter') setLetterUrl(url);
      else paper.open({ viewUrl: url, downloadUrl: url, filename: `Work permit ${row.number ?? ''}.pdf`.replace(' .pdf', '.pdf'), contentType: 'application/pdf' });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not open the file');
    } finally {
      setOpening(null);
    }
  }

  const readBack = Object.entries(row.readBack ?? {});
  const summary: KeyValueItem[] = [
    {
      key: 'outlet',
      label: 'Outlet',
      value: (
        <span className="inline-flex flex-wrap items-center gap-2">
          <DealerChip dealerId={row.dealerId} code={row.dealerCode} linkTo={false} />
          <span>{row.dealerName}</span>
          {showOutletLink ? (
            <Link to={paneHref(row.dealerId)} className="inline-flex items-center gap-1 text-brand underline">
              Open the outlet’s work permits
              <ExternalLink width={12} height={12} strokeWidth={1.75} aria-hidden />
            </Link>
          ) : null}
        </span>
      ),
    },
    { key: 'number', label: 'Permit number', value: row.number ? `#${row.number}` : 'Not issued yet', copyable: !!row.number },
    { key: 'vendor', label: 'Vendor', value: row.vendor ? [row.vendor.name, row.vendor.code].filter(Boolean).join(' · ') : '-' },
    {
      key: 'eng',
      label: 'Engineer',
      value: row.vendorRep ? [row.vendorRep.name, row.vendorRep.mobile].filter(Boolean).join(' · ') : '-',
    },
    { key: 'dealerRep', label: 'Dealer representative', value: row.dealerRep?.name ?? '-' },
    { key: 'work', label: 'Work', value: workText(row.jsa), block: true },
    { key: 'complaint', label: 'Complaint', value: complaintText(row.complaint) },
    { key: 'wo', label: 'Work order', value: row.workOrderNumber ?? '-' },
    {
      key: 'window',
      label: 'Work window (IST)',
      value:
        row.validFrom && row.validTill
          ? `${formatDateTime(row.validFrom)} to ${formatDateTime(row.validTill)}`
          : '-',
    },
    ...(row.portalStatus ? [{ key: 'ps', label: 'SDMS status', value: row.portalStatus }] : []),
    ...(row.raisedBy ? [{ key: 'by', label: 'Raised by', value: row.raisedBy }] : []),
    { key: 'created', label: 'Started', value: formatDateTime(row.createdAt) },
  ];

  return (
    <>
      {paper.reader}
      <ImageLightbox
        open={!!letterUrl}
        onClose={() => setLetterUrl(null)}
        src={letterUrl ?? ''}
        alt="Letter of authorization"
        title="Letter of authorization"
      />
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
                Detail: {row.attentionDetail}
              </span>
            ) : null}
          </Callout>
        ) : null}

        {row.hasPdf || row.hasLetter ? (
          <div className="flex flex-wrap gap-2">
            {row.hasPdf ? (
              <Button
                size="sm"
                variant="secondary"
                loading={opening === 'pdf'}
                leftIcon={<FileText width={14} height={14} strokeWidth={1.75} />}
                onClick={() => void open('pdf')}
              >
                Open the permit PDF
              </Button>
            ) : null}
            {row.hasLetter ? (
              <Button
                size="sm"
                variant="secondary"
                loading={opening === 'letter'}
                leftIcon={<FileText width={14} height={14} strokeWidth={1.75} />}
                onClick={() => void open('letter')}
              >
                Open the letter
              </Button>
            ) : null}
          </div>
        ) : null}

        <SettleActions row={row} />

        <KeyValueList items={summary} />

        {readBack.length > 0 ? (
          <section className="grid gap-1">
            <button
              type="button"
              className="w-fit text-sm font-semibold text-text underline"
              aria-expanded={showReadBack}
              onClick={() => setShowReadBack((v) => !v)}
            >
              {showReadBack ? 'Hide' : 'Show'} what was read back from the form ({readBack.length})
            </button>
            {showReadBack ? (
              <KeyValueList
                items={readBack.map(([k, v]) => ({ key: `rb:${k}`, label: k, value: v }))}
              />
            ) : null}
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
                      SDMS: {h.portalStatus}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Drawer>
    </>
  );
}
