/**
 * Painting {@link PnlCardModel} onto a canvas, and getting the result out of the
 * browser.
 *
 * WHY A CANVAS AND NOT THE SERVER. Every other shareable image in this product
 * is rendered by Playwright on the box, and this one deliberately is not. The
 * rates that make these figures rupees live in `localStorage`, on the machine of
 * the admin who typed them, and have never been sent anywhere. Rendering this
 * card on the server would mean posting them there — which is the one thing the
 * P&L endpoint was written not to do. So the picture is drawn where the numbers
 * already are.
 *
 * Two passes. Text has to be measured before the page can be sized, and
 * `measureText` works on any context regardless of its canvas dimensions — so
 * the first pass runs against a throwaway 300×150 canvas purely to learn the
 * height (its drawing is clipped away and thrown out), and the second runs
 * against a canvas cut to fit. `paint` is deterministic, so the two agree.
 *
 * The palette is hard-coded light. This image gets forwarded into WhatsApp, and
 * it must not come out inverted because the admin who made it prefers dark mode.
 */
import { downloadFile } from './downloadFile';
import type { CardKv, CardScenario, CardTable, PnlCardModel } from './pnlCard';

/** CSS pixels. Wide enough for a five-column table, narrow enough to forward. */
const W = 900;
/** Drawn at 2× so the type is not mush on a phone or a retina screen. */
const SCALE = 2;
const PAD = 40;
const INNER = W - PAD * 2;

const FONT =
  "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const C = {
  page: '#ffffff',
  band: '#0f172a',
  bandKey: '#93c5fd',
  bandMuted: '#cbd5e1',
  bandSubtle: '#94a3b8',
  ink: '#0f172a',
  muted: '#475569',
  subtle: '#64748b',
  line: '#e2e8f0',
  soft: '#f8fafc',
  brand: '#1d4ed8',
  brandSoft: '#eff6ff',
  brandLine: '#93c5fd',
  danger: '#b91c1c',
  amberSoft: '#fffbeb',
  amberLine: '#fcd34d',
  amberInk: '#92400e',
  redSoft: '#fef2f2',
  redLine: '#fca5a5',
  redInk: '#991b1b',
} as const;

type Ctx = CanvasRenderingContext2D;

function paint(ctx: Ctx, m: PnlCardModel): number {
  const f = (weight: number, size: number): void => {
    ctx.font = `${weight} ${size}px ${FONT}`;
  };

  /** Greedy wrap at the CURRENT font. Always returns at least one line. */
  const wrap = (s: string, maxW: number): string[] => {
    const out: string[] = [];
    let cur = '';
    for (const word of s.split(/\s+/)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && ctx.measureText(next).width > maxW) {
        out.push(cur);
        cur = word;
      } else {
        cur = next;
      }
    }
    if (cur) out.push(cur);
    return out.length ? out : [''];
  };

  /** Draw wrapped text from a top-left origin; returns the height it used. */
  const para = (
    s: string,
    x: number,
    top: number,
    maxW: number,
    o: { weight: number; size: number; color: string; lh: number; right?: boolean },
  ): number => {
    f(o.weight, o.size);
    ctx.fillStyle = o.color;
    ctx.textAlign = o.right ? 'right' : 'left';
    const ls = wrap(s, maxW);
    ls.forEach((line, i) => ctx.fillText(line, o.right ? x + maxW : x, top + i * o.lh));
    ctx.textAlign = 'left';
    return ls.length * o.lh;
  };

  /** Height of the same call without drawing — for boxes sized before painting. */
  const paraH = (s: string, maxW: number, o: { weight: number; size: number; lh: number }): number => {
    f(o.weight, o.size);
    return wrap(s, maxW).length * o.lh;
  };

  const box = (x: number, top: number, w: number, h: number, fill: string, stroke: string): void => {
    ctx.beginPath();
    const rr = (ctx as Ctx & { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void })
      .roundRect;
    if (typeof rr === 'function') rr.call(ctx, x, top, w, h, 10);
    else ctx.rect(x, top, w, h);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  ctx.textBaseline = 'top';
  ctx.fillStyle = C.page;
  ctx.fillRect(0, 0, W, 20000);

  /* ── the band ──────────────────────────────────────────────────────── */
  const BAND = 150;
  ctx.fillStyle = C.band;
  ctx.fillRect(0, 0, W, BAND);
  f(700, 12);
  ctx.fillStyle = C.bandKey;
  ctx.fillText('FUEL PROFIT & LOSS', PAD, 40);
  f(700, 34);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(m.outlet, PAD, 64);
  f(500, 15);
  ctx.fillStyle = C.bandMuted;
  ctx.fillText(m.period, PAD, 108);
  f(500, 12);
  ctx.fillStyle = C.bandSubtle;
  ctx.textAlign = 'right';
  ctx.fillText(`Prepared ${m.prepared}`, W - PAD, 41);
  ctx.fillText('MDG Services', W - PAD, 108);
  ctx.textAlign = 'left';

  let y = BAND + 30;

  const section = (label: string, note?: string): void => {
    f(700, 12);
    ctx.fillStyle = C.subtle;
    ctx.fillText(label.toUpperCase(), PAD, y);
    if (note) {
      f(500, 12);
      ctx.fillStyle = C.subtle;
      ctx.textAlign = 'right';
      ctx.fillText(note, W - PAD, y);
      ctx.textAlign = 'left';
    }
    y += 18;
    ctx.fillStyle = C.line;
    ctx.fillRect(PAD, y, INNER, 1);
    y += 16;
  };

  /* ── the two answers ───────────────────────────────────────────────── */
  section('The answer — both of them', 'Nobody knows which');

  const GAP = 16;
  const colW = (INNER - GAP) / 2;
  const bodyW = colW - 36;

  const scenarioH = (s: CardScenario): number =>
    18 +
    paraH(s.heading, bodyW - 70, { weight: 700, size: 15, lh: 20 }) +
    paraH(s.subheading, bodyW, { weight: 500, size: 12, lh: 16 }) +
    14 +
    14 +
    38 +
    10 +
    s.rows.length * 22 +
    18 +
    16 +
    s.variation.length * 19 +
    18;

  const drawScenario = (s: CardScenario, x: number, top: number, h: number): void => {
    box(
      x,
      top,
      colW,
      h,
      s.selected ? C.brandSoft : C.soft,
      s.selected ? C.brandLine : C.line,
    );
    let cy = top + 18;
    const cx = x + 18;

    if (s.selected) {
      f(700, 10);
      ctx.fillStyle = C.brand;
      ctx.textAlign = 'right';
      ctx.fillText('SHOWN ON SCREEN', x + colW - 18, cy + 3);
      ctx.textAlign = 'left';
    }
    cy += para(s.heading, cx, cy, bodyW - 70, {
      weight: 700,
      size: 15,
      color: C.ink,
      lh: 20,
    });
    cy += para(s.subheading, cx, cy, bodyW, {
      weight: 500,
      size: 12,
      color: C.muted,
      lh: 16,
    });
    cy += 14;

    f(700, 10);
    ctx.fillStyle = C.subtle;
    ctx.fillText('FUEL PROFIT', cx, cy);
    cy += 14;
    f(700, 30);
    ctx.fillStyle = s.profitBad ? C.danger : C.ink;
    ctx.fillText(s.profit, cx, cy);
    cy += 38 + 10;

    for (const r of s.rows) {
      f(500, 12);
      ctx.fillStyle = C.muted;
      ctx.fillText(r.hint ? `${r.label} (${r.hint})` : r.label, cx, cy + 2);
      f(600, 13);
      ctx.fillStyle = r.bad ? C.danger : C.ink;
      ctx.textAlign = 'right';
      ctx.fillText(r.value, x + colW - 18, cy + 1);
      ctx.textAlign = 'left';
      cy += 22;
    }

    cy += 8;
    ctx.fillStyle = s.selected ? C.brandLine : C.line;
    ctx.fillRect(cx, cy, bodyW, 1);
    cy += 10;
    f(700, 10);
    ctx.fillStyle = C.subtle;
    ctx.fillText('STOCK VARIATION', cx, cy);
    cy += 16;
    for (const v of s.variation) {
      f(500, 12);
      ctx.fillStyle = C.muted;
      ctx.fillText(v.label, cx, cy);
      f(600, 12);
      ctx.fillStyle = v.bad ? C.danger : C.ink;
      ctx.textAlign = 'right';
      ctx.fillText(v.value, x + colW - 18, cy);
      ctx.textAlign = 'left';
      cy += 19;
    }
  };

  const boxH = Math.max(...m.scenarios.map(scenarioH));
  m.scenarios.forEach((s, i) => drawScenario(s, PAD + i * (colW + GAP), y, boxH));
  y += boxH;

  // The two caveats that must never be separated from the figures above them:
  // what the unanswered question is worth, and a surplus too big to believe.
  const strip = (note: string, fill: string, stroke: string, ink: string): void => {
    y += 12;
    const h = paraH(note, INNER - 32, { weight: 500, size: 13, lh: 19 }) + 24;
    box(PAD, y, INNER, h, fill, stroke);
    para(note, PAD + 16, y + 12, INNER - 32, { weight: 500, size: 13, color: ink, lh: 19 });
    y += h;
  };
  if (m.swing) strip(m.swing, C.amberSoft, C.amberLine, C.amberInk);
  if (m.caution) strip(m.caution, C.redSoft, C.redLine, C.redInk);
  if (m.unpriced) strip(m.unpriced, C.soft, C.line, C.muted);
  y += 28;

  /* ── measured ──────────────────────────────────────────────────────── */
  section('What was measured', 'Counted from the day book');
  {
    const n = m.measured.length;
    const cw = INNER / n;
    let labelLines = 1;
    for (const k of m.measured) labelLines = Math.max(labelLines, paraH(k.label, cw - 16, { weight: 700, size: 10, lh: 13 }) / 13);
    const h = 16 + labelLines * 13 + 4 + 22 + 14 + 16;
    box(PAD, y, INNER, h, C.soft, C.line);
    m.measured.forEach((k, i) => {
      const x = PAD + i * cw + 14;
      const w = cw - 20;
      para(k.label.toUpperCase(), x, y + 16, w, {
        weight: 700,
        size: 10,
        color: C.subtle,
        lh: 13,
      });
      const vt = y + 16 + labelLines * 13 + 4;
      para(k.value, x, vt, w, { weight: 700, size: 17, color: C.ink, lh: 22 });
      if (k.hint) para(k.hint, x, vt + 24, w, { weight: 500, size: 10, color: C.subtle, lh: 13 });
    });
    y += h;
  }
  y += 28;

  /* ── tables ────────────────────────────────────────────────────────── */
  const table = (t: CardTable, weights: number[]): void => {
    const widths = weights.map((wt) => wt * INNER);
    const xs: number[] = [];
    let acc = PAD;
    for (const w of widths) {
      xs.push(acc);
      acc += w;
    }

    let headH = 13;
    t.columns.forEach((c, i) =>
      (headH = Math.max(headH, paraH(c.header, widths[i]! - 12, { weight: 700, size: 10, lh: 13 }))),
    );
    t.columns.forEach((c, i) =>
      para(c.header.toUpperCase(), xs[i]! + (c.right ? 0 : 2), y, widths[i]! - 12, {
        weight: 700,
        size: 10,
        color: C.subtle,
        lh: 13,
        right: c.right,
      }),
    );
    y += headH + 8;
    ctx.fillStyle = C.line;
    ctx.fillRect(PAD, y, INNER, 1);
    y += 1;

    for (const row of t.rows) {
      let rowH = 17;
      row.forEach((cell, i) => {
        const bold = i === 0;
        rowH = Math.max(
          rowH,
          paraH(cell, widths[i]! - 12, { weight: bold ? 600 : 500, size: 12.5, lh: 17 }),
        );
      });
      const top = y + 10;
      row.forEach((cell, i) => {
        const right = !!t.columns[i]?.right;
        para(cell, xs[i]! + (right ? 0 : 2), top, widths[i]! - 12, {
          weight: i === 0 ? 600 : 500,
          size: 12.5,
          color: C.ink,
          lh: 17,
          right,
        });
      });
      y = top + rowH + 10;
      ctx.fillStyle = C.line;
      ctx.fillRect(PAD, y, INNER, 1);
      y += 1;
    }
  };

  section('What was assumed — the prices', m.priced ? undefined : 'None entered yet');
  table(m.rates, [0.4, 0.2, 0.2, 0.2]);
  y += 12;
  y += para(m.rateSource, PAD, y, INNER, { weight: 500, size: 11.5, color: C.muted, lh: 16 });
  if (m.rateWarning) {
    y += 6;
    y += para(m.rateWarning, PAD, y, INNER, {
      weight: 600,
      size: 11.5,
      color: C.amberInk,
      lh: 16,
    });
  }
  y += 28;

  /* ── engine constants ──────────────────────────────────────────────── */
  section("What was assumed — the report's own settings", 'Not editable here');
  {
    const cw = (INNER - 24) / 2;
    const itemH = (k: CardKv): number =>
      paraH(k.label, cw, { weight: 700, size: 10, lh: 13 }) +
      3 +
      paraH(k.value, cw, { weight: 500, size: 13, lh: 18 }) +
      (k.hint ? paraH(k.hint, cw, { weight: 500, size: 11, lh: 15 }) : 0);

    for (let i = 0; i < m.engine.length; i += 2) {
      const pair = m.engine.slice(i, i + 2);
      const h = Math.max(...pair.map(itemH));
      pair.forEach((k, j) => {
        const x = PAD + j * (cw + 24);
        let ky = y;
        ky += para(k.label.toUpperCase(), x, ky, cw, {
          weight: 700,
          size: 10,
          color: C.subtle,
          lh: 13,
        });
        ky += 3;
        ky += para(k.value, x, ky, cw, { weight: 500, size: 13, color: C.ink, lh: 18 });
        if (k.hint) para(k.hint, x, ky, cw, { weight: 500, size: 11, color: C.subtle, lh: 15 });
      });
      y += h + 16;
    }
  }
  y += 12;

  /* ── grade by grade ────────────────────────────────────────────────── */
  section('Grade by grade', 'Both answers, per fuel');
  table(m.grades, [0.28, 0.15, 0.2, 0.18, 0.19]);
  y += 28;

  /* ── footer ────────────────────────────────────────────────────────── */
  ctx.fillStyle = C.line;
  ctx.fillRect(PAD, y, INNER, 1);
  y += 14;
  for (const line of m.footer) {
    y += para(line, PAD, y, INNER, { weight: 500, size: 11, color: C.subtle, lh: 16 });
    y += 6;
  }

  return y + PAD - 6;
}

/** Render the card. Resolves to a PNG blob; rejects only if canvas is unusable. */
export async function renderPnlCardPng(model: PnlCardModel): Promise<Blob> {
  // Canvas draws with whatever the font stack resolves to AT THE MOMENT of the
  // call, so a card rendered before Inter finishes loading silently comes out in
  // the fallback — with different metrics from the ones just measured.
  try {
    await document.fonts?.ready;
  } catch {
    /* a browser without the Font Loading API still gets a card */
  }

  const measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) throw new Error('This browser cannot draw the image.');
  const height = Math.ceil(paint(measureCtx, model));

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the image.');
  ctx.scale(SCALE, SCALE);
  paint(ctx, model);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded.'))),
      'image/png',
    );
  });
}

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded' | 'failed';

export interface SharePngResult {
  outcome: ShareOutcome;
  /** Present when `outcome === 'failed'` — show it. Never fail silently. */
  reason?: string;
}

/**
 * Hand the PNG to whatever this device actually has.
 *
 * The share sheet first, because "sharable" means WhatsApp and the sheet is the
 * only route that reaches it without a trip through the Downloads folder. A
 * cancelled sheet is a normal outcome and not an error — it is reported
 * separately so the caller does not congratulate someone who changed their mind.
 * Everything else falls through to `downloadFile`, which knows the three ways a
 * download silently does nothing inside the Expo shell.
 */
export async function sharePnlCardPng(blob: Blob, filename: string): Promise<SharePngResult> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return { outcome: 'shared' };
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return { outcome: 'cancelled' };
      // Anything else — a sheet that refused the file type, a permission
      // policy — is not fatal; the download below still works.
    }
  }
  const res = await downloadFile({ blob, filename, contentType: 'image/png', kind: 'image' });
  return res.ok ? { outcome: 'downloaded' } : { outcome: 'failed', reason: res.reason };
}
