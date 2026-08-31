/**
 * The shared drawing surface for the admin's shareable cards.
 *
 * WHY A CANVAS AND NOT THE SERVER. Every other image in this product is rendered
 * by Playwright on the box. These are not, and the reason is per-card: the Fuel
 * P&L's rates live in `localStorage` and have never been sent anywhere, so
 * rendering it server-side would mean posting them. Once one card was drawn in
 * the browser the second one had no reason to open a second route, a second
 * renderer and a second font problem to say the same thing in the same house
 * style — so this file is the house style, and a card is a function that draws
 * into it.
 *
 * TWO PASSES. Text must be measured before the page can be sized, and
 * `measureText` works on any context regardless of its canvas dimensions — so
 * the first pass runs against a throwaway 300×150 canvas purely to learn the
 * height (its drawing is clipped away and discarded) and the second runs against
 * a canvas cut to fit. A `draw` function must therefore be deterministic: it is
 * called twice and the two runs have to agree.
 *
 * The palette is hard-coded light. These images get forwarded into WhatsApp, and
 * they must not come out inverted because the admin who made one prefers dark
 * mode.
 */
import { downloadFile } from './downloadFile';

/** CSS pixels. Wide enough for a six-column table, narrow enough to forward. */
export const CARD_W = 900;
export const CARD_PAD = 40;
export const CARD_INNER = CARD_W - CARD_PAD * 2;
/** Drawn at 2× so the type is not mush on a phone or a retina screen. */
const SCALE = 2;

const FONT =
  "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const C = {
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
  good: '#15803d',
  goodSoft: '#f0fdf4',
  goodLine: '#86efac',
  amberSoft: '#fffbeb',
  amberLine: '#fcd34d',
  amberInk: '#92400e',
  redSoft: '#fef2f2',
  redLine: '#fca5a5',
  redInk: '#991b1b',
} as const;

type Ctx = CanvasRenderingContext2D;

export interface TextOpts {
  weight: number;
  size: number;
  color: string;
  lh: number;
  right?: boolean;
}
export interface MeasureOpts {
  weight: number;
  size: number;
  lh: number;
}

/** A table cell: plain text, or text that needs its own colour or weight. */
export type CardCell = string | { text: string; color?: string; weight?: number };

export interface CardStat {
  label: string;
  value: string;
  hint?: string;
  /** Colour for the value only; the label stays quiet. */
  color?: string;
}

export interface CardKv {
  label: string;
  value: string;
  hint?: string;
}

export interface Painter {
  /** The vertical cursor, in CSS px from the top of the card. */
  y: number;
  font(weight: number, size: number): void;
  /** Draw wrapped text from a top-left origin; returns the height it used. */
  para(s: string, x: number, top: number, maxW: number, o: TextOpts): number;
  /** The height the same call would use, without drawing. */
  paraH(s: string, maxW: number, o: MeasureOpts): number;
  box(x: number, top: number, w: number, h: number, fill: string, stroke: string): void;
  /** A 1px horizontal rule. Does not move the cursor. */
  hline(x: number, top: number, w: number, color: string): void;
  /** The dark header band. Advances past it. */
  band(o: {
    eyebrow: string;
    headline: string;
    sub: string;
    rightTop?: string;
    rightBottom?: string;
  }): void;
  /** A titled rule across the card, with an optional right-aligned aside. */
  section(label: string, note?: string): void;
  /** A full-width tinted note — for a caveat that must not travel separately. */
  strip(note: string, fill: string, stroke: string, ink: string): void;
  /** A bordered row of headline figures. */
  stats(items: CardStat[]): void;
  table(columns: { header: string; right?: boolean }[], weights: number[], rows: CardCell[][]): void;
  /** Labelled values in `columns` columns, laid out row by row. */
  kvGrid(items: CardKv[], columns: number): void;
  /** Small print under a rule. */
  footer(lines: string[]): void;
}

function cellText(c: CardCell): string {
  return typeof c === 'string' ? c : c.text;
}

export function createPainter(ctx: Ctx): Painter {
  const font = (weight: number, size: number): void => {
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

  const para: Painter['para'] = (s, x, top, maxW, o) => {
    font(o.weight, o.size);
    ctx.fillStyle = o.color;
    ctx.textAlign = o.right ? 'right' : 'left';
    const ls = wrap(s, maxW);
    ls.forEach((line, i) => ctx.fillText(line, o.right ? x + maxW : x, top + i * o.lh));
    ctx.textAlign = 'left';
    return ls.length * o.lh;
  };

  const paraH: Painter['paraH'] = (s, maxW, o) => {
    font(o.weight, o.size);
    return wrap(s, maxW).length * o.lh;
  };

  const box: Painter['box'] = (x, top, w, h, fill, stroke) => {
    ctx.beginPath();
    const rr = (
      ctx as Ctx & { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void }
    ).roundRect;
    if (typeof rr === 'function') rr.call(ctx, x, top, w, h, 10);
    else ctx.rect(x, top, w, h);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  const p: Painter = {
    y: 0,
    font,
    para,
    paraH,
    box,

    hline(x, top, w, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x, top, w, 1);
    },

    band(o) {
      const BAND = 150;
      ctx.fillStyle = C.band;
      ctx.fillRect(0, 0, CARD_W, BAND);
      font(700, 12);
      ctx.fillStyle = C.bandKey;
      ctx.fillText(o.eyebrow, CARD_PAD, 40);
      font(700, 34);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(o.headline, CARD_PAD, 64);
      font(500, 15);
      ctx.fillStyle = C.bandMuted;
      ctx.fillText(o.sub, CARD_PAD, 108);
      font(500, 12);
      ctx.fillStyle = C.bandSubtle;
      ctx.textAlign = 'right';
      if (o.rightTop) ctx.fillText(o.rightTop, CARD_W - CARD_PAD, 41);
      if (o.rightBottom) ctx.fillText(o.rightBottom, CARD_W - CARD_PAD, 108);
      ctx.textAlign = 'left';
      p.y = BAND + 30;
    },

    section(label, note) {
      font(700, 12);
      ctx.fillStyle = C.subtle;
      ctx.fillText(label.toUpperCase(), CARD_PAD, p.y);
      if (note) {
        font(500, 12);
        ctx.fillStyle = C.subtle;
        ctx.textAlign = 'right';
        ctx.fillText(note, CARD_W - CARD_PAD, p.y);
        ctx.textAlign = 'left';
      }
      p.y += 18;
      ctx.fillStyle = C.line;
      ctx.fillRect(CARD_PAD, p.y, CARD_INNER, 1);
      p.y += 16;
    },

    strip(note, fill, stroke, ink) {
      p.y += 12;
      const h = paraH(note, CARD_INNER - 32, { weight: 500, size: 13, lh: 19 }) + 24;
      box(CARD_PAD, p.y, CARD_INNER, h, fill, stroke);
      para(note, CARD_PAD + 16, p.y + 12, CARD_INNER - 32, {
        weight: 500,
        size: 13,
        color: ink,
        lh: 19,
      });
      p.y += h;
    },

    stats(items) {
      const cw = CARD_INNER / items.length;
      let labelLines = 1;
      for (const k of items) {
        labelLines = Math.max(
          labelLines,
          paraH(k.label, cw - 20, { weight: 700, size: 10, lh: 13 }) / 13,
        );
      }
      const h = 16 + labelLines * 13 + 4 + 22 + 14 + 16;
      box(CARD_PAD, p.y, CARD_INNER, h, C.soft, C.line);
      items.forEach((k, i) => {
        const x = CARD_PAD + i * cw + 14;
        const w = cw - 20;
        para(k.label.toUpperCase(), x, p.y + 16, w, {
          weight: 700,
          size: 10,
          color: C.subtle,
          lh: 13,
        });
        const vt = p.y + 16 + labelLines * 13 + 4;
        para(k.value, x, vt, w, { weight: 700, size: 17, color: k.color ?? C.ink, lh: 22 });
        if (k.hint) para(k.hint, x, vt + 24, w, { weight: 500, size: 10, color: C.subtle, lh: 13 });
      });
      p.y += h;
    },

    table(columns, weights, rows) {
      const widths = weights.map((wt) => wt * CARD_INNER);
      const xs: number[] = [];
      let acc = CARD_PAD;
      for (const w of widths) {
        xs.push(acc);
        acc += w;
      }

      let headH = 13;
      columns.forEach((c, i) => {
        headH = Math.max(
          headH,
          paraH(c.header, widths[i]! - 12, { weight: 700, size: 10, lh: 13 }),
        );
      });
      columns.forEach((c, i) =>
        para(c.header.toUpperCase(), xs[i]! + (c.right ? 0 : 2), p.y, widths[i]! - 12, {
          weight: 700,
          size: 10,
          color: C.subtle,
          lh: 13,
          right: c.right,
        }),
      );
      p.y += headH + 8;
      ctx.fillStyle = C.line;
      ctx.fillRect(CARD_PAD, p.y, CARD_INNER, 1);
      p.y += 1;

      for (const row of rows) {
        let rowH = 17;
        row.forEach((cell, i) => {
          const weight = typeof cell === 'string' ? (i === 0 ? 600 : 500) : (cell.weight ?? 500);
          rowH = Math.max(
            rowH,
            paraH(cellText(cell), widths[i]! - 12, { weight, size: 12.5, lh: 17 }),
          );
        });
        const top = p.y + 10;
        row.forEach((cell, i) => {
          const right = !!columns[i]?.right;
          const weight = typeof cell === 'string' ? (i === 0 ? 600 : 500) : (cell.weight ?? 500);
          const color = typeof cell === 'string' ? C.ink : (cell.color ?? C.ink);
          para(cellText(cell), xs[i]! + (right ? 0 : 2), top, widths[i]! - 12, {
            weight,
            size: 12.5,
            color,
            lh: 17,
            right,
          });
        });
        p.y = top + rowH + 10;
        ctx.fillStyle = C.line;
        ctx.fillRect(CARD_PAD, p.y, CARD_INNER, 1);
        p.y += 1;
      }
    },

    kvGrid(items, columns) {
      const gap = 24;
      const cw = (CARD_INNER - gap * (columns - 1)) / columns;
      const itemH = (k: CardKv): number =>
        paraH(k.label, cw, { weight: 700, size: 10, lh: 13 }) +
        3 +
        paraH(k.value, cw, { weight: 500, size: 13, lh: 18 }) +
        (k.hint ? paraH(k.hint, cw, { weight: 500, size: 11, lh: 15 }) : 0);

      for (let i = 0; i < items.length; i += columns) {
        const rowItems = items.slice(i, i + columns);
        const h = Math.max(...rowItems.map(itemH));
        rowItems.forEach((k, j) => {
          const x = CARD_PAD + j * (cw + gap);
          let ky = p.y;
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
        p.y += h + 16;
      }
    },

    footer(lines) {
      ctx.fillStyle = C.line;
      ctx.fillRect(CARD_PAD, p.y, CARD_INNER, 1);
      p.y += 14;
      for (const line of lines) {
        p.y += para(line, CARD_PAD, p.y, CARD_INNER, {
          weight: 500,
          size: 11,
          color: C.subtle,
          lh: 16,
        });
        p.y += 6;
      }
      p.y -= 6;
    },
  };

  return p;
}

/**
 * Run a card's `draw` twice — once to measure, once to paint — and hand back a
 * PNG. `draw` must be deterministic; see the two-pass note at the top.
 */
export async function renderCardPng(draw: (p: Painter) => void): Promise<Blob> {
  // Canvas draws with whatever the font stack resolves to AT THE MOMENT of the
  // call, so a card rendered before Inter finishes loading silently comes out in
  // the fallback — with different metrics from the ones just measured.
  try {
    await document.fonts?.ready;
  } catch {
    /* a browser without the Font Loading API still gets a card */
  }

  const prepare = (ctx: Ctx, height: number): void => {
    ctx.textBaseline = 'top';
    ctx.fillStyle = C.page;
    ctx.fillRect(0, 0, CARD_W, height);
  };

  const measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) throw new Error('This browser cannot draw the image.');
  prepare(measureCtx, 1);
  const measure = createPainter(measureCtx);
  draw(measure);
  const height = Math.ceil(measure.y + CARD_PAD);

  const canvas = document.createElement('canvas');
  canvas.width = CARD_W * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the image.');
  ctx.scale(SCALE, SCALE);
  prepare(ctx, height);
  draw(createPainter(ctx));

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
 * The share sheet first, because "shareable" means WhatsApp and the sheet is the
 * only route that reaches it without a trip through the Downloads folder. A
 * cancelled sheet is a normal outcome and not an error — it is reported
 * separately so the caller does not congratulate someone who changed their mind.
 * Everything else falls through to `downloadFile`, which knows the three ways a
 * download silently does nothing inside the Expo shell.
 */
export async function shareCardPng(blob: Blob, filename: string): Promise<SharePngResult> {
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
