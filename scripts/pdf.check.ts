/**
 * Checks for the PDF reader's decisions (`src/lib/pdf.ts`): when a PDF is read
 * in the app instead of a browser tab, what counts as a PDF, and how sharp a
 * page is drawn. The drawing itself needs a browser; this is the arithmetic.
 *
 *   cd mdg-admin && npm run check:pdf
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isPdfFile, pageRenderScale, readsPdfInApp } from '../src/lib/pdf';

describe('readsPdfInApp', () => {
  it('reads in the app inside the phone app, whatever the width (a tablet is wide)', () => {
    assert.equal(readsPdfInApp(true, false), true);
    assert.equal(readsPdfInApp(true, true), true);
  });
  it('reads in the app on a narrow browser screen', () => {
    assert.equal(readsPdfInApp(false, false), true);
  });
  it("leaves a laptop browser its own PDF viewer, which can search and print", () => {
    assert.equal(readsPdfInApp(false, true), false);
  });
});

describe('isPdfFile', () => {
  it('knows a PDF by its name, whatever the type a phone gave it', () => {
    assert.equal(isPdfFile('Certificate.PDF', 'application/octet-stream'), true);
    assert.equal(isPdfFile('invoice.pdf ', null), true);
  });
  it('knows a PDF by its type when the name has no extension', () => {
    assert.equal(isPdfFile('scan', 'application/pdf'), true);
  });
  it('is not fooled by a picture or a spreadsheet', () => {
    assert.equal(isPdfFile('photo.jpg', 'image/jpeg'), false);
    assert.equal(isPdfFile('sales.xlsx', undefined), false);
    assert.equal(isPdfFile('pdf-notes.txt', 'text/plain'), false);
  });
});

describe('pageRenderScale', () => {
  const A4 = { w: 595, h: 842 };
  it('draws sharp: two device pixels per CSS pixel', () => {
    assert.ok(Math.abs(pageRenderScale(A4.w, A4.h, 360, 2) * A4.w - 720) < 1e-6);
  });
  it('never past 2× however dense the screen, and an odd ratio counts as 1', () => {
    assert.equal(pageRenderScale(A4.w, A4.h, 360, 3.5), pageRenderScale(A4.w, A4.h, 360, 2));
    assert.ok(Math.abs(pageRenderScale(A4.w, A4.h, 360, 0) * A4.w - 360) < 1e-6);
  });
  it('caps a zoomed page at four million pixels', () => {
    const s = pageRenderScale(A4.w, A4.h, 1080, 2);
    assert.ok(A4.w * s * A4.h * s <= 4_000_001);
  });
});
