import * as React from 'react';

import { PdfViewer, useToast } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { downloadFile } from '@/lib/downloadFile';
import { isNativeShell, requestNativeDownload } from '@/lib/nativeBridge';
import { fetchPdfBytes, isPdfFile, readsPdfInApp } from '@/lib/pdf';

/** A stored paper's two signed links: one that shows it, one that saves it. */
export interface PaperLinks {
  /** Inline disposition: the browser (or the reader) shows it. */
  viewUrl: string;
  /** Attachment disposition: the browser saves it under `filename`. */
  downloadUrl: string;
  filename: string;
  contentType: string;
}

/**
 * Open a stored paper the way the screen it is on can actually show it — one
 * road for the vault drawers (document review, document validity, calibration
 * papers, tanker invoices) and the DU OTP paper button, which each had their
 * own copy of it.
 *
 *  - A PDF inside the phone app, or on any narrow screen: the app's own reader
 *    (`PdfViewer`). It used to go to the shell's file handler, which on Android
 *    hands the file to Chrome — out of the app.
 *  - Anything else inside the phone app: the shell's file handler, as before.
 *  - A laptop browser: a new tab, where the browser's own PDF viewer can search
 *    and print.
 *
 * Save, in the reader, takes the shell's file handler in the app (an old shell
 * that never answers gets a tab) and a plain download in a browser.
 *
 * Returns `open`, and `reader` to render somewhere in the caller's tree.
 */
export function useOpenPaper(failWords: string): {
  open: (paper: PaperLinks) => void;
  reader: React.ReactNode;
} {
  const toast = useToast();
  const wide = useMediaQuery('(min-width: 768px)');
  const [reading, setReading] = React.useState<PaperLinks | null>(null);

  const save = React.useCallback(
    async (paper: PaperLinks) => {
      if (isNativeShell()) {
        const result = await requestNativeDownload({
          id: `paper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          url: paper.downloadUrl,
          filename: paper.filename,
          contentType: paper.contentType,
          kind: 'file',
        });
        if (result.ok) return;
        if (!result.timedOut) {
          toast.error(result.error || failWords);
          return;
        }
        // An old shell without the handler: its nav gate takes a tab to the phone.
        window.open(paper.viewUrl, '_blank', 'noopener');
        return;
      }
      const result = await downloadFile({
        url: paper.downloadUrl,
        filename: paper.filename,
        contentType: paper.contentType,
        kind: 'file',
      });
      if (!result.ok) toast.error(result.reason || failWords);
    },
    [failWords, toast],
  );

  const open = React.useCallback(
    (paper: PaperLinks) => {
      if (isPdfFile(paper.filename, paper.contentType) && readsPdfInApp(isNativeShell(), wide)) {
        setReading(paper);
        return;
      }
      if (isNativeShell()) {
        void save(paper);
        return;
      }
      window.open(paper.viewUrl, '_blank', 'noopener');
    },
    [save, wide],
  );

  const reader = reading ? (
    <PdfViewer
      title={reading.filename}
      load={() => fetchPdfBytes(reading.viewUrl)}
      onSave={() => void save(reading)}
      onClose={() => setReading(null)}
    />
  ) : null;

  return { open, reader };
}
