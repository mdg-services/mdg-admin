/**
 * The PDF reader's engine: pdf.js, loaded only the first time someone opens a PDF.
 *
 * WHY THE APP READS PDFs ITSELF
 * -----------------------------
 * Android's WebView cannot show a PDF at all — an <iframe> is a grey box, and a
 * link is handed by the admin phone app to Chrome, which takes the admin out of
 * the app to read a paper. So the app draws the pages itself (the dealer app
 * has the same engine, `mdg-client/src/lib/pdf.ts`).
 *
 * pdf.js is about a megabyte with its worker, which nobody should pay for on
 * every start, so it is a separate download fetched on the first open and kept
 * for the rest of the visit. The LEGACY build: it carries the
 * fallbacks an older WebView needs.
 *
 * The file is fetched whole, then handed over as bytes. The storage allows the
 * app's own addresses to read it (CORS), and a paper is a few hundred kilobytes,
 * so one plain fetch is simpler and surer than pdf.js's ranged requests.
 */
import type * as PdfJs from 'pdfjs-dist/legacy/build/pdf.mjs';

type PdfLib = typeof PdfJs;
type PDFDocumentProxy = PdfJs.PDFDocumentProxy;

let pdfLib: Promise<PdfLib> | null = null;

/** pdf.js and its worker, fetched once. A failed fetch is forgotten, so Try again can work. */
export function loadPdfLib(): Promise<PdfLib> {
  if (!pdfLib) {
    pdfLib = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
    pdfLib.catch(() => {
      pdfLib = null;
    });
  }
  return pdfLib;
}

/**
 * Read a PDF in the app's own reader rather than a browser tab: inside the phone
 * app (where a tab is the phone's browser) and on any narrow screen. A laptop
 * browser keeps its own PDF viewer, which can search and print.
 */
export function readsPdfInApp(isNativeShell: boolean, wide: boolean): boolean {
  return isNativeShell || !wide;
}

/** A PDF's bytes from a signed link. Throws on anything but a 2xx. */
export async function fetchPdfBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The file could not be fetched (${res.status}).`);
  return res.arrayBuffer();
}

/** Open a PDF from its bytes. The caller destroys the document when done with it. */
export async function openPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const lib = await loadPdfLib();
  return lib.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    // Pictures decoded the plain way, not on a worker's off-screen canvas: the
    // combination checked inside the Android app (see PdfViewer's render queue).
    isOffscreenCanvasSupported: false,
  }).promise;
}

/** The most pages drawn. A paper is a page or three; past this, Save opens the whole file. */
export const MAX_PDF_PAGES = 40;

/** Zoom steps of the − / + buttons; 1 = the page fills the screen's width. */
export const PDF_ZOOMS = [1, 1.5, 2, 3] as const;

/**
 * The scale a page is drawn at: sharp on the phone's screen (up to 2 device
 * pixels per CSS pixel), but never a canvas over `maxPixels` — a 3× zoom of an
 * A4 page at full sharpness is ~30 million pixels, which a cheap phone's
 * memory does not have.
 */
export function pageRenderScale(
  pageWidth: number,
  pageHeight: number,
  cssWidth: number,
  devicePixelRatio: number,
  maxPixels = 4_000_000,
): number {
  const dpr = Math.min(Math.max(devicePixelRatio || 1, 1), 2);
  const wanted = (cssWidth * dpr) / pageWidth;
  const cap = Math.sqrt(maxPixels / (pageWidth * pageHeight));
  return Math.max(0.1, Math.min(wanted, cap));
}

/** A file the app reads itself: a PDF by its name or its type (a phone may send a PDF as octet-stream). */
export function isPdfFile(filename: string, contentType?: string | null): boolean {
  return /\.pdf$/i.test(filename.trim()) || (contentType ?? '').toLowerCase() === 'application/pdf';
}
