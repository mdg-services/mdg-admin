import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  Share2,
} from 'lucide-react';
import * as React from 'react';


import { Badge, Button, Card, CardContent, Dialog, useToast } from '@/components/ui';
import { useShareDsr, type DsrReportView } from '@/hooks/api/useDsr';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatLitres } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';
import type { DsrAdvisoryKind, DsrVariationSummary } from '@dk/shared';

/** `YYYY-MM-DD` → `Thu, 23 Jul 2026`, read as a calendar date, not an instant. */
export function dsrDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const ADVISORY_INTENT: Record<DsrAdvisoryKind, Intent> = {
  WITHIN_LIMIT: 'success',
  LOW: 'danger',
  HIGH: 'warning',
};

const ADVISORY_LABEL: Record<DsrAdvisoryKind, string> = {
  WITHIN_LIMIT: 'Within limit',
  LOW: 'Stock short',
  HIGH: 'Stock over',
};

interface Props {
  report: DsrReportView;
  /** Rendered top-right of the report hero header (download / regenerate). */
  actions?: React.ReactNode;
  /** How tall the inline HTML report should be. */
  frameClassName?: string;
}

/**
 * The report, output-first: the self-contained HTML deliverable fills the hero,
 * then the per-product stock-variation cards restate the headline the dealer
 * acts on. Data-quality warnings sit above both so a partial report is never
 * mistaken for a clean one.
 */
export function DsrReportPanel({
  report,
  actions,
  frameClassName = 'h-[72vh] min-h-[520px]',
}: Props) {
  const { digest } = report;

  return (
    <div className="flex flex-col gap-4">
      {report.warnings.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2.5 text-sm text-warning">
          <AlertTriangle
            width={16}
            height={16}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0"
          />
          <div className="min-w-0">
            <p className="font-medium">
              This report has {report.warnings.length} data-quality note
              {report.warnings.length === 1 ? '' : 's'}
            </p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
              {report.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* The deliverable itself — the hero. */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">
              Daily Sales Report
            </p>
            <p className="text-xs text-text-subtle">
              {dsrDateLabel(report.businessDate)}
              {report.outletCode ? ` · Outlet ${report.outletCode}` : ''}
            </p>
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
        {report.htmlUrl ? (
          <iframe
            src={report.htmlUrl}
            title={`Daily Sales Report — ${report.businessDate}`}
            className={cn('w-full border-0 bg-white', frameClassName)}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <FileWarning
              width={28}
              height={28}
              strokeWidth={1.75}
              className="text-text-subtle"
            />
            <p className="text-sm font-medium text-text">
              The rendered report is not available
            </p>
            <p className="max-w-sm text-sm text-text-muted">
              The HTML artifact could not be signed. The figures below still come
              straight from the generated report.
            </p>
          </div>
        )}
        {report.htmlUrl ? (
          <div className="border-t border-border px-4 py-2 text-right">
            <a
              href={report.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
            >
              Open full report in a new tab
              <ExternalLink width={13} height={13} strokeWidth={1.75} />
            </a>
          </div>
        ) : null}
      </Card>

      {/* Supporting: per-product stock variation. */}
      {digest.products.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Stock variation
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {digest.products.map((p) => (
              <VariationCard key={p.productKey} variation={p.variation} />
            ))}
          </div>
        </div>
      ) : null}

      {/* The dealer deliverable: the two shareable cards + the share action. */}
      <DsrShareSection report={report} />
    </div>
  );
}

/**
 * The two cards the dealer receives (Variation + Daily Sales) with the
 * admin-approved Share action — the DSR twin of the Credit & DOD share card.
 * An admin reviews the images, then Share posts them plus a bilingual summary to
 * the dealer's chat. Idempotent: once shared, the button becomes a disabled
 * "Shared" with a timestamp.
 */
function DsrShareSection({ report }: { report: DsrReportView }) {
  const toast = useToast();
  const share = useShareDsr(report.id);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const alreadyShared = !!report.shared;
  const cards: { url?: string; label: string; alt: string }[] = [
    { url: report.variationCardUrl, label: 'Stock variation', alt: 'DSR stock-variation card' },
    { url: report.salesCardUrl, label: 'Daily sales', alt: 'DSR daily-sales card' },
  ];
  const haveImages = cards.some((c) => c.url);

  async function onConfirm() {
    try {
      const result = await share.mutateAsync();
      toast.success(
        result?.alreadyShared
          ? 'This report had already been shared with the dealer.'
          : 'Cards shared with the dealer.',
      );
      setConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to share');
    }
  }

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Share with dealer
      </p>
      <Card>
        <CardContent className="grid gap-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {cards.map((c) =>
              c.url ? (
                <a
                  key={c.label}
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open the ${c.label.toLowerCase()} card`}
                  className="block"
                >
                  <img
                    src={c.url}
                    alt={c.alt}
                    className="h-auto w-full rounded-md border border-border bg-surface-2"
                  />
                </a>
              ) : (
                <div
                  key={c.label}
                  className="flex h-40 items-center justify-center rounded-md border border-dashed border-border bg-surface-2 px-4 text-center text-xs text-text-muted"
                >
                  The {c.label.toLowerCase()} card will be generated when you
                  share.
                </div>
              ),
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {alreadyShared ? (
              <>
                <Button
                  variant="secondary"
                  disabled
                  leftIcon={<Check width={14} height={14} strokeWidth={1.75} />}
                >
                  Shared
                </Button>
                <span className="text-xs text-text-subtle">
                  {formatDateTime(report.shared?.at)}
                </span>
              </>
            ) : (
              <>
                <Button
                  onClick={() => setConfirmOpen(true)}
                  leftIcon={<Share2 width={14} height={14} strokeWidth={1.75} />}
                >
                  Share with dealer
                </Button>
                {!haveImages ? (
                  <span className="text-xs text-text-subtle">
                    The cards render when you share.
                  </span>
                ) : null}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Share with dealer"
        description="Post both cards and a bilingual summary to the dealer's chat? This will message the dealer."
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={share.isPending}
            >
              Cancel
            </Button>
            <Button onClick={onConfirm} loading={share.isPending}>
              Share
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">
          The Variation and Daily Sales cards will be posted to the dealer&apos;s
          chat, along with a short summary they can read.
        </p>
      </Dialog>
    </div>
  );
}

const INTENT_TEXT: Record<Intent, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  neutral: 'text-text',
};

function VariationCard({ variation }: { variation: DsrVariationSummary }) {
  const kind = variation.advisory.kind;
  const intent = ADVISORY_INTENT[kind];
  const withinLimit = variation.variationNotWithinLimit === 0;

  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">
              {variation.productLabel}
            </p>
            <p className="text-xs text-text-subtle">
              Since {dsrDateLabel(variation.sinceDate)}
            </p>
          </div>
          <Badge intent={intent} className="shrink-0 gap-1">
            {kind === 'WITHIN_LIMIT' ? (
              <CheckCircle2 width={12} height={12} strokeWidth={2} />
            ) : kind === 'LOW' ? (
              <ArrowDownRight width={12} height={12} strokeWidth={2} />
            ) : (
              <ArrowUpRight width={12} height={12} strokeWidth={2} />
            )}
            {ADVISORY_LABEL[kind]}
          </Badge>
        </div>

        <div>
          <p
            className={cn(
              'text-2xl font-semibold tabular-nums',
              INTENT_TEXT[intent],
            )}
          >
            {formatLitres(variation.variation, { sign: true })}
          </p>
          <p className="mt-0.5 text-xs text-text-subtle">
            Permissible band ± {formatLitres(variation.permissibleVariation)}
            {withinLimit
              ? ''
              : ` · ${formatLitres(variation.variationNotWithinLimit)} outside`}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <Figure
            label="Receipts"
            value={formatLitres(variation.totalReceiptSinceInspection)}
          />
          <Figure
            label="Testing"
            value={formatLitres(variation.totalTestSinceInspection)}
          />
        </dl>

        <div
          className={cn(
            'mt-auto rounded-md px-3 py-2 text-sm',
            intent === 'success'
              ? 'bg-success-soft text-success'
              : intent === 'danger'
                ? 'bg-danger-soft text-danger'
                : 'bg-warning-soft text-warning',
          )}
        >
          <p className="font-medium">{variation.advisory.messageHi}</p>
          <p className="mt-0.5 opacity-90">{variation.advisory.messageEn}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-text-subtle">{label}</dt>
      <dd className="tabular-nums font-medium text-text">{value}</dd>
    </div>
  );
}
