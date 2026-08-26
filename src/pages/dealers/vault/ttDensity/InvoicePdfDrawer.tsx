import { ExternalLink, FileWarning, RotateCw } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Callout,
  DownloadButton,
  Drawer,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useTtInvoice, useTtInvoicePdfUrl } from '@/hooks/api/useTtDensity';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/api';
import { formatYmd, inrFormat } from '@/lib/format';
import { isNativeShell, requestNativeDownload } from '@/lib/nativeBridge';
import type { TtInvoice, TtInvoiceProduct, TtInvoiceSummary } from '@dk/shared';

import { formatDensity } from './format';

/**
 * One tanker invoice, read without downloading it.
 *
 * A `Drawer`, not a modal: below `md` the `Drawer` is already a bottom sheet
 * with a grabber, a 92dvh cap and a safe-area footer, which is exactly the
 * mobile behaviour this screen needs and which a `Dialog` would have to
 * reimplement; on desktop it keeps the invoice list visible behind it so an
 * operator can step down the rows.
 *
 * THE DENSITY CHIPS SIT ABOVE THE FRAME, ON PURPOSE. They come from the invoice
 * record, which is already loaded; the PDF is a second request that can be slow,
 * refused, or answer 404 because the file never downloaded. Putting the figures
 * first means the operator gets what they came for whether or not a single pixel
 * of the PDF ever paints.
 *
 * BELOW `md` THE IFRAME IS NOT MOUNTED AT ALL — gated on `useMediaQuery`, never
 * on `hidden md:block`. Two reasons, and the second is the one that bites: no
 * mobile engine renders `application/pdf` in a frame (Android WebView shows a
 * grey rectangle or starts a download; iOS WKWebView paints page 1 and refuses
 * to scroll), and a CSS-hidden iframe still fetches the whole file over the
 * operator's mobile data to render nothing.
 *
 * There is no PDF library. Page count, zoom, rotate, print and find all come
 * from the browser's own viewer inside the frame; shipping `pdfjs-dist` and a
 * worker into the admin bundle to redraw controls the browser already draws is
 * not a trade this screen needs to make.
 */

/** How long a frame gets to fire `onLoad` before the skeleton is taken down anyway. */
const FRAME_READY_TIMEOUT_MS = 6000;

export interface InvoicePdfDrawerProps {
  dealerId: string;
  /** The row that was clicked, or null when the drawer is closed. */
  invoice: TtInvoiceSummary | null;
  onClose: () => void;
  /** "Fetch invoices now" — offered when the file never downloaded. */
  onFetch: () => void;
  fetching: boolean;
}

export function InvoicePdfDrawer({
  dealerId,
  invoice,
  onClose,
  onFetch,
  fetching,
}: InvoicePdfDrawerProps) {
  const toast = useToast();
  const wideEnoughToEmbed = useMediaQuery('(min-width: 768px)');

  const detailQ = useTtInvoice(dealerId, invoice?.id);
  const urlsQ = useTtInvoicePdfUrl(dealerId, invoice?.id);

  const detail = detailQ.data ?? null;
  const urls = urlsQ.data ?? null;
  // A 404 here is a STATE, not a failure: the portal lists an invoice before we
  // manage to fetch its file, so "not downloaded yet" is an ordinary morning.
  const noFile = urlsQ.isError && urlsQ.error instanceof ApiError && urlsQ.error.status === 404;
  // Everything else that can go wrong signing the file — a 500 out of the
  // presigner, a dropped connection — used to fall through to `PdfFrame` with a
  // null src, which renders a skeleton with no error branch and no `onLoad` to
  // ever take it down. A rectangle that shimmers for ever tells the operator
  // nothing and offers them nothing to press.
  const urlsFailed = urlsQ.isError && !noFile;

  async function openOnPhone(): Promise<void> {
    if (!urls) return;
    if (isNativeShell()) {
      // The admin shell runs with `setSupportMultipleWindows={false}`, so
      // `window.open` is unreliable inside it; the shell's own handler saves the
      // file and hands it to whatever the phone uses for PDFs.
      const result = await requestNativeDownload({
        id: `tt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: urls.downloadUrl,
        filename: urls.filename,
        contentType: urls.contentType,
        kind: 'file',
      });
      if (result.ok) return;
      if (!result.timedOut) {
        toast.error(result.error || 'Could not open the invoice');
        return;
      }
      // Old shell without the handler — fall through to the browser.
    }
    window.open(urls.viewUrl, '_blank', 'noopener');
  }

  const description = invoice
    ? [
        [formatYmd(invoice.invoiceDate), invoice.invoiceTime].filter(Boolean).join(', '),
        invoice.vehicleNo,
        typeof detail?.invoiceTotal === 'number' ? inrFormat(detail.invoiceTotal) : null,
      ]
        .filter((v): v is string => !!v)
        .join(' · ')
    : undefined;

  return (
    <Drawer
      open={!!invoice}
      onClose={onClose}
      width="lg"
      title={invoice ? `Invoice ${invoice.sapInvoiceNo}` : undefined}
      description={description}
      footer={
        <>
          {wideEnoughToEmbed && urls ? (
            <Button
              variant="secondary"
              leftIcon={<ExternalLink width={14} height={14} strokeWidth={1.75} />}
              onClick={() => window.open(urls.viewUrl, '_blank', 'noopener')}
            >
              Open in a new tab
            </Button>
          ) : null}
          {/*
            One control on a phone, not two. `openOnPhone()` already hands the
            file to the shell's own download path, which saves it and opens it in
            whatever the phone uses for PDFs — so a second "Download" beside it
            did the same job, and did it through `window.open`, which this file
            documents (above) as unreliable here because the shell runs
            `setSupportMultipleWindows={false}`. A button that probably does
            nothing, beside one that works, is worse than no button.

            At md the pair is meaningful again — view in a tab, or save — and the
            save goes through `DownloadButton`, so a landscape phone (already
            `≥ md` at 852px) still gets the native route and a visible error
            instead of a dropped window.
          */}
          {!wideEnoughToEmbed && urls ? (
            <Button onClick={() => void openOnPhone()}>Open PDF</Button>
          ) : null}
          {wideEnoughToEmbed && urls ? (
            <DownloadButton
              variant="ghost"
              size="md"
              url={urls.downloadUrl}
              filename={urls.filename}
              contentType={urls.contentType}
              kind="file"
            />
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {invoice ? (
        <div className="grid gap-4">
          <DensityChips
            summary={invoice}
            products={detail?.products}
            unreadable={detail?.parseStatus === 'UNREADABLE'}
          />

          {detail ? <InvoiceFacts invoice={detail} /> : null}

          {noFile ? (
            <MissingFile
              onFetch={onFetch}
              fetching={fetching}
              hasFigures={invoice.densities.length > 0}
            />
          ) : urlsFailed ? (
            <div className="grid gap-2 justify-items-start">
              <Callout intent="warning">
                The invoice PDF could not be opened just now. Try again in a
                moment.
              </Callout>
              <Button
                variant="secondary"
                loading={urlsQ.isFetching}
                leftIcon={<RotateCw width={14} height={14} strokeWidth={1.75} />}
                onClick={() => void urlsQ.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : wideEnoughToEmbed ? (
            <PdfFrame src={urls?.viewUrl ?? null} sapInvoiceNo={invoice.sapInvoiceNo} />
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}

/**
 * What we read off this invoice, in type big enough to transcribe from.
 *
 * Rendered from the row's own `densities` until the full invoice arrives, then
 * from the invoice's product lines, which additionally carry the tank number,
 * the compartments and the sample reference.
 */
function DensityChips({
  summary,
  products,
  unreadable,
}: {
  summary: TtInvoiceSummary;
  products?: TtInvoiceProduct[];
  unreadable?: boolean;
}) {
  if (summary.densities.length === 0 && summary.pdfStatus !== 'STORED') {
    // Nobody has failed at READING anything here — there is nothing to read. The
    // portal lists an invoice before we manage to download it, so telling an
    // operator to read figures off a PDF that the block below simultaneously
    // says is not in the vault is two false sentences about one ordinary
    // morning.
    return summary.pdfStatus === 'FAILED' ? (
      <Callout intent="warning">
        This invoice&apos;s PDF was given up on after three attempts, so there
        are no figures to show. It needs an engineer.
      </Callout>
    ) : (
      <Callout intent="info">
        The portal listed this invoice but its PDF has not downloaded yet, so
        there are no figures to show.
      </Callout>
    );
  }

  if (unreadable || (products && products.length === 0) || summary.densities.length === 0) {
    return (
      <Callout intent="warning">
        We could not read the density figures out of this invoice. The PDF is
        below — please read them off it.
      </Callout>
    );
  }

  const rows = products?.length
    ? products.map((p, i) => ({
        key: `${p.materialCode}-${i}`,
        // A provisional line has no friendly name to print — `labelEn` IS the
        // description — so a plain join reads "LDO · LDO" and buries the one
        // thing needed to report the new grade: the SAP material code.
        label: p.provisional
          ? [p.materialCode, p.description].filter(Boolean).join(' · ')
          : [p.labelEn, p.description].filter(Boolean).join(' · '),
        figure: formatDensity(p.density15, p.density15Raw),
        meta: [
          typeof p.quantity === 'number' ? `${p.quantity} ${p.unit ?? ''}`.trim() : null,
          p.tankNo,
          p.compartments.length > 0 ? `compartments ${p.compartments.join(', ')}` : null,
        ]
          .filter((v): v is string => !!v)
          .join(' · '),
        sampleNo: p.sampleNo,
      }))
    : summary.densities.map((d, i) => ({
        key: `${d.productKey}-${i}`,
        label: d.labelEn,
        figure: formatDensity(d.density15, d.density15Raw),
        meta: [
          typeof d.quantity === 'number' ? `${d.quantity} ${d.unit ?? ''}`.trim() : null,
          d.tankNo,
        ]
          .filter((v): v is string => !!v)
          .join(' · '),
        sampleNo: null,
      }));

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        What we read from this invoice
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.key} className="rounded-md border border-border bg-surface-2 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              {row.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-text">
              {row.figure}
              <span className="ml-1 text-xs font-normal text-text-subtle">kg/m³</span>
            </p>
            {row.meta ? (
              <p className="mt-1 text-xs text-text-subtle">{row.meta}</p>
            ) : null}
            {row.sampleNo ? (
              <p className="mt-1 font-mono text-[11px] text-text-subtle">{row.sampleNo}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The invoice's own identifiers, kept out of the list so the list stays about density. */
function InvoiceFacts({ invoice }: { invoice: TtInvoice }) {
  const facts: Array<[string, string | null]> = [
    ['Document no', invoice.docNumber ?? null],
    [
      'Invoice total',
      typeof invoice.invoiceTotal === 'number' ? inrFormat(invoice.invoiceTotal) : null,
    ],
    ['Delivery no', invoice.deliveryNo ?? null],
    ['Sales order', invoice.salesOrderNo ?? null],
    [
      // Recorded, never presented as a product figure: a two-product invoice
      // still prints only ONE header density, so it is not a summary of both.
      'Header Density@15',
      typeof invoice.headerDensity15 === 'number'
        ? invoice.headerDensity15.toFixed(3)
        : null,
    ],
  ];
  const shown = facts.filter((f): f is [string, string] => !!f[1]);
  if (shown.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Invoice details
      </p>
      <dl className="mt-2 grid gap-y-1">
        {shown.map(([label, value]) => (
          <div key={label} className="flex min-h-11 items-center justify-between gap-3 border-b border-border py-1 last:border-b-0 md:min-h-0">
            <dt className="text-sm text-text-muted">{label}</dt>
            <dd className="text-sm tabular-nums text-text">{value}</dd>
          </div>
        ))}
      </dl>
      {invoice.dateMismatch ? (
        <Callout intent="warning" className="mt-2">
          The date printed on this PDF does not match the date the portal listed
          it under.
        </Callout>
      ) : null}
      {invoice.parseWarnings.map((w) => (
        <Callout intent="warning" className="mt-2" key={w}>
          {w}
        </Callout>
      ))}
    </div>
  );
}

/** The browser's own PDF viewer, with a skeleton that cannot outlive the frame. */
function PdfFrame({ src, sapInvoiceNo }: { src: string | null; sapInvoiceNo: string }) {
  const [ready, setReady] = React.useState(false);

  // An iframe whose load event never fires — a slow signature, a viewer that
  // decides to download instead — would otherwise leave a shimmering rectangle
  // on screen for ever. After six seconds the frame is on its own.
  React.useEffect(() => {
    if (!src) return;
    setReady(false);
    const timer = window.setTimeout(() => setReady(true), FRAME_READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [src]);

  if (!src) {
    return <Skeleton className="h-[460px] w-full rounded-md" />;
  }

  return (
    <div className="relative">
      {ready ? null : <Skeleton className="absolute inset-0 rounded-md" />}
      <iframe
        src={src}
        title={`Tax invoice ${sapInvoiceNo}`}
        className="h-[calc(100dvh-22rem)] min-h-[460px] w-full rounded-md border border-border bg-white"
        referrerPolicy="no-referrer"
        onLoad={() => setReady(true)}
      />
    </div>
  );
}

/** The file never arrived. Not an error — the figures above are still true. */
function MissingFile({
  onFetch,
  fetching,
  hasFigures,
}: {
  onFetch: () => void;
  fetching: boolean;
  /** False on an invoice nothing has been read from — then there is no "above". */
  hasFigures: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-border px-6 py-12 text-center">
      <FileWarning
        width={28}
        height={28}
        strokeWidth={1.75}
        className="text-text-subtle"
        aria-hidden
      />
      <p className="text-sm font-medium text-text">
        The invoice PDF is not in the vault
      </p>
      <p className="max-w-sm text-sm text-text-muted">
        The portal listed this invoice but the file did not download.
        {hasFigures ? ' The figures above were read from an earlier copy.' : ''}{' '}
        Fetch again to try.
      </p>
      <Button variant="secondary" loading={fetching} onClick={onFetch} className="mt-2">
        Fetch invoices now
      </Button>
    </div>
  );
}
