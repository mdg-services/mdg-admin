import { AlertCircle, BellRing, ExternalLink, FileText, Save } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  DownloadButton,
  Drawer,
  HowThisWorks,
  Input,
  Label,
  MIN_SELECTABLE_YMD,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useDocumentAskFileUrl, useSetDocumentValidity } from '@/hooks/api/useDocumentAsks';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/api';
import { formatDateTime, istTodayYmd } from '@/lib/format';
import { isNativeShell, requestNativeDownload } from '@/lib/nativeBridge';
import {
  dealerCodeLabel,
  dealerProfileDateLabel,
  documentValidityLabel,
  isIsoDay,
  sameReminderLadder,
} from '@dk/shared';
import { DOCUMENT_VALIDITY_MAX_DAY } from '@dk/shared/schemas';

import { cadenceSentence, daysFromToday, type DocumentValidityRow } from './format';
import {
  ladderValueFrom,
  ladderValueToOffsets,
  ReminderLadderField,
  type ReminderLadderValue,
} from './ReminderLadderField';
import { ValidityPill } from './ValidityPill';

/**
 * One filed paper: when it runs out, and who gets told before it does.
 *
 * TWO EDITS AND NOTHING ELSE, because `PATCH /v1/asks/:id/validity` is
 * deliberately not an accept. Accepting is a verdict on a paper and the one
 * closed state that refuses to reopen — reopening would erase the reviewer's
 * name and the time, which IS the compliance record. This corrects a number
 * somebody mistyped, or quietens the reminders on the single certificate a
 * dealer has already said is being replaced. Both are ordinary admin work; both
 * are audited separately (`DOCUMENT_ASK_VALIDITY_SET` /
 * `DOCUMENT_ASK_CADENCE_SET`) precisely so "who quietened the trade licence, and
 * when" has an answer after one lapses unwarned.
 *
 * CORRECTING THE DATE DOES NOT RE-FIRE THE LADDER. Steps already settled stay
 * settled, so pushing a date six months out does not send the fifteen-day
 * warning the dealer already had. The drawer says so above the box, because the
 * opposite assumption — "I fixed the date, they will be told again" — is exactly
 * how a certificate goes unwarned.
 *
 * THE PAPER ITSELF IS ONE BUTTON, NOT A PREVIEW. Reviewing a submission is
 * `ReviewAskDrawer`'s job and it owns the image-plus-lightbox treatment; here
 * somebody is checking a date against a scan they have already accepted, so the
 * drawer offers the file and gets out of the way. The signed URL is short-lived
 * and every read is audited server-side, which is why it is only fetched while
 * this is open.
 */

export interface DocumentValidityDrawerProps {
  open: boolean;
  /** The paper being corrected. `null` while the drawer is closed. */
  row: DocumentValidityRow | null;
  onClose: () => void;
}

export function DocumentValidityDrawer({ open, row, onClose }: DocumentValidityDrawerProps) {
  const toast = useToast();
  const today = istTodayYmd();
  const wideEnoughToEmbed = useMediaQuery('(min-width: 768px)');
  const save = useSetDocumentValidity();

  const [validUntil, setValidUntil] = React.useState('');
  const [ladder, setLadder] = React.useState<ReminderLadderValue>({ mode: 'remind', text: '' });
  const [error, setError] = React.useState<string | null>(null);

  /**
   * The row's stored ladder as a VALUE rather than a reference.
   *
   * `row.cadence` is rebuilt by `rowFromValidityAsk` on every render of the
   * list, so it is a new array each time — and an effect keyed on it would
   * re-run constantly, wiping a half-typed correction on every keystroke
   * anywhere else on the page. Keyed on the contents, the effect runs when the
   * contents actually change and at no other time. The same trap
   * `AskDocumentDialog` documents for its pre-ticked dealer list.
   */
  const cadenceKey = (row?.cadence ?? []).join(',');
  const storedUntil = row?.validUntil ?? '';
  const askId = row?.askId;

  // Every field is per-row. Carrying a half-typed date from one dealer's
  // certificate onto the next is the one mistake this screen could make that
  // nobody would notice until a reminder fired on the wrong morning.
  React.useEffect(() => {
    setValidUntil(storedUntil);
    setLadder(ladderValueFrom(cadenceKey === '' ? [] : cadenceKey.split(',').map(Number)));
    setError(null);
  }, [askId, storedUntil, cadenceKey]);

  const fileQ = useDocumentAskFileUrl(row?.askId, open && Boolean(row?.hasFile));

  /** Open a PDF the way the shell can actually open one. Same route as the review drawer. */
  async function openPaper(): Promise<void> {
    const urls = fileQ.data;
    if (!urls) return;
    if (isNativeShell()) {
      // The admin shell runs `setSupportMultipleWindows={false}`, so
      // `window.open` is unreliable inside it; the shell's own handler saves the
      // file and hands it to whatever the phone uses for PDFs.
      const result = await requestNativeDownload({
        id: `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: urls.downloadUrl,
        filename: urls.filename,
        contentType: urls.contentType,
        kind: 'file',
      });
      if (result.ok) return;
      if (!result.timedOut) {
        toast.error(result.error || 'Could not open the paper');
        return;
      }
    }
    window.open(urls.viewUrl, '_blank', 'noopener');
  }

  if (!row) return null;

  const parsedLadder = ladderValueToOffsets(ladder);
  const dateChanged = validUntil !== (row.validUntil ?? '');
  const ladderChanged = parsedLadder.offsets !== null && !sameReminderLadder(parsedLadder.offsets, row.cadence);
  const dirty = dateChanged || ladderChanged;

  const typedDays = isIsoDay(validUntil) ? daysFromToday(validUntil, today) : null;

  async function handleSave(): Promise<void> {
    if (!row) return;
    setError(null);

    if (validUntil !== '' && !isIsoDay(validUntil)) {
      setError('That is not a real date. Use the date printed on the paper.');
      return;
    }
    if (validUntil > DOCUMENT_VALIDITY_MAX_DAY) {
      setError('That is too far ahead to be a real expiry.');
      return;
    }
    if (parsedLadder.error) {
      setError(parsedLadder.error);
      return;
    }
    if (!dirty) {
      setError('Nothing has changed yet.');
      return;
    }

    try {
      await save.mutateAsync({
        askId: row.askId,
        // `null` CLEARS the date — the honest move when somebody realises the
        // paper carries no expiry after all. Omitted when untouched, because the
        // route treats absent and null as two different instructions.
        ...(dateChanged ? { validUntil: validUntil === '' ? null : validUntil } : {}),
        ...(ladderChanged && parsedLadder.offsets
          ? { reminderOffsetDays: parsedLadder.offsets }
          : {}),
      });
      toast.success(`Updated for ${dealerCodeLabel(row.dealerCode)}`);
      onClose();
    } catch (err) {
      // The server's own sentence, shown as written: it already says why and
      // what to do instead.
      const message = err instanceof ApiError ? err.message : 'Could not save it';
      setError(message);
      toast.error(message);
    }
  }

  const sent = (row.ask.remindersSent ?? []).filter((r) => r.outcome === 'sent');
  const skipped = (row.ask.remindersSent ?? []).length - sent.length;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 break-words">{row.title}</span>
          <HowThisWorks
            surface="admin-document-validity"
            label="When a paper runs out"
            variant="icon"
          />
        </span>
      }
      description={`${dealerCodeLabel(row.dealerCode)} · on file${
        row.filedAt ? ` since ${formatDateTime(row.filedAt)}` : ''
      }`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Close
          </Button>
          <Button
            onClick={() => void handleSave()}
            loading={save.isPending}
            disabled={save.isPending || !dirty}
            leftIcon={<Save width={16} height={16} strokeWidth={1.75} />}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ValidityPill state={row.validityState} daysToExpiry={row.daysToExpiry} />
          {row.renewalOpen ? <Badge intent="info">Renewal already asked for</Badge> : null}
          {row.isRenewal ? <Badge intent="neutral">This one is a renewal</Badge> : null}
          {row.filedByMdg ? <Badge intent="neutral">Filed by MDG</Badge> : null}
        </div>

        {error ? <Callout intent="warning">{error}</Callout> : null}

        {/* ── The paper itself ── */}
        {row.hasFile ? (
          fileQ.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : fileQ.isError ? (
            <Callout intent="warning" onRetry={() => void fileQ.refetch()}>
              {fileQ.error instanceof ApiError
                ? fileQ.error.message
                : 'The paper could not be opened.'}{' '}
              Do not change the date until you have read it off the paper.
            </Callout>
          ) : fileQ.data ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-2 p-3">
              <FileText width={16} height={16} strokeWidth={1.75} className="text-text-muted" />
              <span className="min-w-0 flex-1 break-all text-sm text-text">
                {fileQ.data.filename}
              </span>
              {wideEnoughToEmbed ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<ExternalLink width={14} height={14} strokeWidth={1.75} />}
                    onClick={() => window.open(fileQ.data.viewUrl, '_blank', 'noopener')}
                  >
                    Open
                  </Button>
                  <DownloadButton
                    variant="ghost"
                    size="sm"
                    url={fileQ.data.downloadUrl}
                    filename={fileQ.data.filename}
                    label="Save"
                  />
                </>
              ) : (
                <Button size="sm" onClick={() => void openPaper()}>
                  Open
                </Button>
              )}
            </div>
          ) : null
        ) : null}

        {/* ── The date ── */}
        <div>
          <Label htmlFor="validity-until">Valid until</Label>
          <Input
            id="validity-until"
            type="date"
            value={validUntil}
            min={MIN_SELECTABLE_YMD}
            max={DOCUMENT_VALIDITY_MAX_DAY}
            disabled={save.isPending}
            onChange={(e) => setValidUntil(e.target.value)}
          />
          <p className="mt-1 text-xs text-text-muted">
            The date printed on the paper — not a date worked out from an issue date. Where the
            catalog maps this paper to a field on the Info tab, saving here moves that date too,
            so the two can never disagree.
          </p>
          {typedDays !== null ? (
            <p className="mt-1 text-xs text-text-subtle">
              {dealerProfileDateLabel(validUntil, 'en')} · {documentValidityLabel(typedDays, 'en')}
            </p>
          ) : null}
          {validUntil !== '' ? (
            <Button
              variant="ghost"
              size="sm"
              padding="none"
              className="mt-1"
              disabled={save.isPending}
              onClick={() => setValidUntil('')}
            >
              This paper does not run out — clear the date
            </Button>
          ) : null}
        </div>

        {/* ── The ladder ── */}
        <ReminderLadderField
          id="validity-ladder"
          value={ladder}
          onChange={setLadder}
          disabled={save.isPending}
          subject={`${dealerCodeLabel(row.dealerCode)}’s ${row.title}`}
          inherited={
            row.cadenceOverridden
              ? 'this paper has its own ladder; clearing it back to the catalog’s needs a re-type'
              : `it follows the catalog — ${cadenceSentence(row.cadence).toLowerCase()}`
          }
        />

        {/* ── What has already gone out ── */}
        <div className="rounded-md border border-border bg-surface-2 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
            <BellRing width={13} height={13} strokeWidth={1.75} aria-hidden />
            What the dealer has already been told
          </p>
          {sent.length === 0 && skipped === 0 ? (
            <p className="mt-1 text-sm text-text-muted">Nothing yet.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm text-text">
              {sent.map((entry) => (
                <li key={`${entry.offsetDays}-${entry.at}`} className="break-words">
                  {/* The message quoted the REAL days left, not the step. A sweep
                      resuming on the tenth day fires the fifteen-day step and
                      says "10 days left", because that is what was true — so
                      this prints what they read, not which rung it came off. */}
                  {formatDateTime(entry.at)} — “{documentValidityLabel(entry.daysLeft, 'en')}”
                </li>
              ))}
              {skipped > 0 ? (
                <li className="text-xs text-text-subtle">
                  {skipped} step{skipped === 1 ? '' : 's'} written off because the window had
                  already gone by — that is what stops four notifications about one certificate
                  landing in one minute.
                </li>
              ) : null}
            </ul>
          )}
          {row.lapsedNoticeAt ? (
            <p className="mt-1 text-xs text-text-muted">
              The “this has lapsed” notice went out on {formatDateTime(row.lapsedNoticeAt)}.
            </p>
          ) : null}
        </div>

        <Callout intent="info">
          <span className="flex items-start gap-1.5">
            <AlertCircle width={13} height={13} strokeWidth={1.75} className="mt-px shrink-0" />
            Correcting the date does not re-send anything. Steps already sent stay sent, so
            pushing a date further out will not repeat a warning the dealer has already had.
          </span>
        </Callout>
      </div>
    </Drawer>
  );
}
