import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  FileWarning,
} from 'lucide-react';
import * as React from 'react';

import type { DsrAdvisoryKind, DsrVariationSummary } from '@dk/shared';

import type { DsrReportView } from '@/hooks/api/useDsr';

import { Badge, Card, CardContent } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatLitres } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';

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
