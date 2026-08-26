import { ExternalLink, MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Card,
  CardContent,
  DownloadButton,
  IconButton,
  Label,
  Select,
  Sheet,
} from '@/components/ui';
import type { DsrReportSummary, DsrReportView } from '@/hooks/api/useDsr';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { formatDateTime } from '@/lib/format';

import { dsrArtifactName, dsrDateLabel } from './DsrReportPanel';
import { EditShiftDataButton } from './EditShiftDataButton';
import { GenerateDsrButton, GenerateDsrForDate } from './GenerateDsrButton';

/**
 * The two DSR toolbars, in one place.
 *
 * The full report view and the dealer's DSR tab had grown byte-identical copies
 * of both: the same four-control date toolbar, and the same
 * download/download/regenerate action row. They had already started to drift —
 * only the dealer tab carried "Open full view" — and each copy had its own
 * broken `triggerDownload` helper. One implementation, two call sites, so the
 * mobile shape below cannot exist on one screen and not the other.
 *
 * BOTH BRANCH IN JS, NOT IN CSS. A `md:hidden` pair would put the business-date
 * `<Select id>` in the document twice and mount two date inputs; more to the
 * point, the mobile shape here is not a restyling of the desktop one, it is a
 * different set of elements. `useMediaQuery` mounts exactly one.
 *
 * The consequence to know: a landscape phone is already ≥ md (852×393), so
 * ROTATING THE DEVICE crosses the branch and remounts whatever it swaps. The
 * only state worth protecting from that is `GenerateDsrButton`'s in-flight run
 * watcher, and `DsrReportActions` below keeps that element in the same child
 * slot in both shapes for exactly this reason. The date typed into "Generate
 * for a date" is not protected and does not need to be — it is re-picked in one
 * tap, and the queued run is already server-side.
 */

export interface DsrDateToolbarProps {
  dealerId: string;
  reports: DsrReportSummary[];
  /** The report on screen — its id selects the option. */
  selectedId: string;
  onSelect: (id: string) => void;
  /** The day "Correct shift data" should open on. */
  businessDate?: string;
  /** Shown as "Generated …" when there is a report. */
  generatedAt?: string;
  /** A back-dated day was queued: the caller shows it once it lands. */
  onGenerated: (businessDate: string) => void;
  className?: string;
}

export function DsrDateToolbar({
  dealerId,
  reports,
  selectedId,
  onSelect,
  businessDate,
  generatedAt,
  onGenerated,
  className,
}: DsrDateToolbarProps) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = React.useState(false);
  const selectId = React.useId();

  const dateField = (
    <>
      <Label htmlFor={selectId}>Business date</Label>
      <Select
        id={selectId}
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        className={isMd ? 'w-full sm:w-72' : 'w-full'}
      >
        {reports.map((r, i) => (
          <option key={r.id} value={r.id}>
            {dsrDateLabel(r.businessDate)}
            {i === 0 ? ' · latest' : ''}
          </option>
        ))}
      </Select>
    </>
  );

  if (isMd) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-wrap items-end gap-4 p-3">
          <div>{dateField}</div>
          <GenerateDsrForDate dealerId={dealerId} onGenerated={onGenerated} />
          <EditShiftDataButton
            dealerId={dealerId}
            businessDate={businessDate}
          />
          {generatedAt ? (
            <p className="ml-auto text-xs text-text-subtle">
              Generated {formatDateTime(generatedAt)}
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  // Below md the four controls wrapped into four rows — about 200px of toolbar
  // above a report, with `ml-auto` parking the timestamp alone on a right-
  // aligned line of its own. The date picker is what an admin came for; the
  // other two are occasional, so they sit one tap away.
  return (
    <Card className={className}>
      <CardContent className="grid gap-2 p-3">
        <div>{dateField}</div>
        <Button
          variant="secondary"
          className="w-full justify-between"
          leftIcon={
            <SlidersHorizontal width={16} height={16} strokeWidth={1.75} />
          }
          onClick={() => setOpen(true)}
          aria-expanded={open}
        >
          Generate or correct a day
        </Button>
        {generatedAt ? (
          <p className="text-xs text-text-subtle">
            Generated {formatDateTime(generatedAt)}
          </p>
        ) : null}
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title="Daily Sales Report"
        >
          <div className="grid gap-3 px-4 py-2">
            <GenerateDsrForDate
              dealerId={dealerId}
              onGenerated={(d) => {
                setOpen(false);
                onGenerated(d);
              }}
            />
            <EditShiftDataButton
              dealerId={dealerId}
              businessDate={businessDate}
              className="w-full"
            />
          </div>
        </Sheet>
      </CardContent>
    </Card>
  );
}

export interface DsrReportActionsProps {
  report: DsrReportView;
  /** Fired with the business date once a regeneration is queued. */
  onRegenerated: (businessDate: string) => void;
  /** The dealer tab's link out to the full report view. Omitted elsewhere. */
  onOpenFullView?: () => void;
}

/**
 * The report header's actions.
 *
 * Both downloads go through `DownloadButton`. What was here before built an
 * `<a target="_blank">` and clicked it synthetically, which inside the shell is
 * a window that never opens: no file, no error, nothing at all. These are the
 * dealer's own day book as a spreadsheet and as JSON — the two things an admin
 * takes off this screen.
 *
 * Below md the four controls needed ~600px in a 296px header and wrapped into
 * three rows of chrome above the report. Regenerate stays out (it is the one
 * that changes what is on screen); the rest move behind a 44px kebab.
 */
export function DsrReportActions({
  report,
  onRegenerated,
  onOpenFullView,
}: DsrReportActionsProps) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = React.useState(false);

  const openFull = onOpenFullView ? (
    <Button
      variant="ghost"
      size="sm"
      className={isMd ? undefined : 'w-full'}
      rightIcon={<ExternalLink width={14} height={14} strokeWidth={1.75} />}
      onClick={() => {
        setOpen(false);
        onOpenFullView();
      }}
    >
      Open full view
    </Button>
  ) : null;

  const excel = (
    <DownloadButton
      className={isMd ? undefined : 'w-full'}
      url={report.xlsxUrl}
      disabled={!report.xlsxUrl}
      filename={dsrArtifactName(report, 'xlsx')}
      contentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      kind="file"
      label="Download Excel"
    />
  );

  const json = (
    <DownloadButton
      className={isMd ? undefined : 'w-full'}
      url={report.jsonUrl}
      disabled={!report.jsonUrl}
      filename={dsrArtifactName(report, 'json')}
      contentType="application/json"
      kind="file"
      label="Download JSON"
    />
  );

  const regenerate = (
    <GenerateDsrButton
      dealerId={report.dealerId}
      businessDate={report.businessDate}
      label="Regenerate"
      onQueued={() => onRegenerated(report.businessDate)}
    />
  );

  // Regenerate is deliberately its own, unconditional child in the middle of
  // this fragment. React reconciles fixed JSX children by position, so keeping
  // it at the same slot in both shapes means rotating a phone mid-run — which
  // crosses 768px on any handset — does not remount `GenerateDsrButton` and
  // throw away the "Generating…" watcher polling that run.
  return (
    <>
      {isMd ? (
        <>
          {openFull}
          {excel}
          {json}
        </>
      ) : null}
      {regenerate}
      {isMd ? null : (
        <>
          <IconButton
            aria-label="More report actions"
            size="sm"
            variant="secondary"
            onClick={() => setOpen(true)}
          >
            <MoreHorizontal width={18} height={18} strokeWidth={1.75} />
          </IconButton>
          <Sheet
            open={open}
            onClose={() => setOpen(false)}
            title={`Daily Sales Report · ${dsrDateLabel(report.businessDate)}`}
          >
            <div className="grid gap-2 px-4 py-2">
              {openFull}
              {excel}
              {json}
            </div>
          </Sheet>
        </>
      )}
    </>
  );
}
