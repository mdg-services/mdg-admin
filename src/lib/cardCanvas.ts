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

/**
 * Devanagari named at the END, after every Latin fallback.
 *
 * A canvas resolves a stack per GLYPH, exactly as CSS does, so a Devanagari face
 * listed last is still the one that draws Hindi — Kohinoor on macOS, Nirmala on
 * Windows, Noto on Android. Naming them at all is the fix for tofu boxes on a
 * machine with no Devanagari default.
 *
 * The ORDER is not cosmetic, and the Credit & DOD card's server-side stack
 * (which puts Devanagari first) is the wrong model here. This app never actually
 * loads Inter — there is no `@font-face` and no font link anywhere — so every
 * card has always been drawn in `system-ui`. Put a Devanagari face ahead of that
 * and it wins the LATIN glyphs too, because it has them: the Fuel P&L card
 * silently re-typeset itself in Kohinoor the moment this stack was written the
 * other way round.
 */
const FONT =
  "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, " +
  "'Noto Sans Devanagari', 'Kohinoor Devanagari', 'Nirmala UI', " +
  "'Devanagari Sangam MN', sans-serif";

/** Where a card's content sits. `inset` is 0 for a card drawn edge to edge. */
export interface CardGeometry {
  width: number;
  /** Content margin, measured from the canvas edge. */
  pad: number;
  /** Gap between the canvas edge and the card's OUTER edge. */
  inset: number;
  /**
   * The frame's border, counted here rather than on {@link CardFrame} because
   * it is geometry: `edge` — where a full-bleed band starts — has to land
   * INSIDE the border, or the band paints over the very frame it sits in.
   */
  borderWidth: number;
}

const DEFAULT_GEOMETRY: CardGeometry = {
  width: CARD_W,
  pad: CARD_PAD,
  inset: 0,
  borderWidth: 0,
};

/** A bordered card floating on a coloured page — the Credit & DOD card's shape. */
export interface CardFrame {
  /** Behind the card, visible at the rounded corners. */
  page: string;
  card: string;
  border: string;
  radius: number;
}

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

  /* The Credit & DOD card's own palette, so a second card in that family is
     the same maroon and the same gold rather than a near miss. Lifted verbatim
     from `automation/sdms/report/renderCard.ts`. */
  maroon: '#7f1d1d',
  maroonDeep: '#5c1010',
  maroonSoft: '#fef2f2',
  cardRed: '#b91c1c',
  cardGreen: '#15803d',
  cardGreenSoft: '#f0fdf4',
  gold: '#f59e0b',
  goldMid: '#fbbf24',
  goldSoft: '#fffaf0',
  cream: '#fffdf5',
  cardInk: '#1c1917',
  cardInkSoft: '#57534e',
  grid: '#e7d9bf',
  pageWarm: '#f4ede0',
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
  /** Canvas width. */
  readonly width: number;
  /** Left edge of CONTENT. */
  readonly pad: number;
  /** Content width. */
  readonly inner: number;
  /** Left edge of the CARD itself — where a full-bleed band starts. */
  readonly edge: number;
  /** Card width, for a band that runs to both edges. */
  readonly edgeW: number;
  /**
   * The raw context, for a card that needs a gradient or a clip.
   *
   * Deliberately exposed rather than wrapped: the primitives here cover the
   * shapes two cards share, and inventing a `gradientRect` for the one band
   * that needs one would be a worse abstraction than handing over the object.
   */
  readonly ctx: CanvasRenderingContext2D;
  font(weight: number, size: number): void;
  /** Draw wrapped text from a top-left origin; returns the height it used. */
  para(s: string, x: number, top: number, maxW: number, o: TextOpts): number;
  /** The height the same call would use, without drawing. */
  paraH(s: string, maxW: number, o: MeasureOpts): number;
  box(x: number, top: number, w: number, h: number, fill: string, stroke: string): void;
  /** A 1px horizontal rule. Does not move the cursor. */
  hline(x: number, top: number, w: number, color: string): void;
  /** A flat filled rectangle. Does not move the cursor. */
  rect(x: number, top: number, w: number, h: number, color: string): void;
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

export function createPainter(ctx: Ctx, geometry: CardGeometry = DEFAULT_GEOMETRY): Painter {
  const { width: W, pad: PAD, inset, borderWidth } = geometry;
  const INNER = W - PAD * 2;
  const EDGE = inset + borderWidth;
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
    width: W,
    pad: PAD,
    inner: INNER,
    edge: EDGE,
    edgeW: W - EDGE * 2,
    ctx,
    font,
    para,
    paraH,
    box,

    hline(x, top, w, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x, top, w, 1);
    },

    rect(x, top, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x, top, w, h);
    },

    band(o) {
      // Every offset below is measured from where the band STARTS, not from the
      // top of the canvas: a framed card begins its content inside the border,
      // and absolute baselines would print the title over it.
      const BAND = 150;
      const t = p.y;
      ctx.fillStyle = C.band;
      ctx.fillRect(0, t, W, BAND);
      font(700, 12);
      ctx.fillStyle = C.bandKey;
      ctx.fillText(o.eyebrow, PAD, t + 40);
      font(700, 34);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(o.headline, PAD, t + 64);
      font(500, 15);
      ctx.fillStyle = C.bandMuted;
      ctx.fillText(o.sub, PAD, t + 108);
      font(500, 12);
      ctx.fillStyle = C.bandSubtle;
      ctx.textAlign = 'right';
      if (o.rightTop) ctx.fillText(o.rightTop, W - PAD, t + 41);
      if (o.rightBottom) ctx.fillText(o.rightBottom, W - PAD, t + 108);
      ctx.textAlign = 'left';
      p.y = t + BAND + 30;
    },

    section(label, note) {
      font(700, 12);
      ctx.fillStyle = C.subtle;
      ctx.fillText(label.toUpperCase(), PAD, p.y);
      if (note) {
        font(500, 12);
        ctx.fillStyle = C.subtle;
        ctx.textAlign = 'right';
        ctx.fillText(note, W - PAD, p.y);
        ctx.textAlign = 'left';
      }
      p.y += 18;
      ctx.fillStyle = C.line;
      ctx.fillRect(PAD, p.y, INNER, 1);
      p.y += 16;
    },

    strip(note, fill, stroke, ink) {
      p.y += 12;
      const h = paraH(note, INNER - 32, { weight: 500, size: 13, lh: 19 }) + 24;
      box(PAD, p.y, INNER, h, fill, stroke);
      para(note, PAD + 16, p.y + 12, INNER - 32, {
        weight: 500,
        size: 13,
        color: ink,
        lh: 19,
      });
      p.y += h;
    },

    stats(items) {
      const cw = INNER / items.length;
      let labelLines = 1;
      for (const k of items) {
        labelLines = Math.max(
          labelLines,
          paraH(k.label, cw - 20, { weight: 700, size: 10, lh: 13 }) / 13,
        );
      }
      const h = 16 + labelLines * 13 + 4 + 22 + 14 + 16;
      box(PAD, p.y, INNER, h, C.soft, C.line);
      items.forEach((k, i) => {
        const x = PAD + i * cw + 14;
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
      const widths = weights.map((wt) => wt * INNER);
      const xs: number[] = [];
      let acc = PAD;
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
      ctx.fillRect(PAD, p.y, INNER, 1);
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
        ctx.fillRect(PAD, p.y, INNER, 1);
        p.y += 1;
      }
    },

    kvGrid(items, columns) {
      const gap = 24;
      const cw = (INNER - gap * (columns - 1)) / columns;
      const itemH = (k: CardKv): number =>
        paraH(k.label, cw, { weight: 700, size: 10, lh: 13 }) +
        3 +
        paraH(k.value, cw, { weight: 500, size: 13, lh: 18 }) +
        (k.hint ? paraH(k.hint, cw, { weight: 500, size: 11, lh: 15 }) : 0);

      for (let i = 0; i < items.length; i += columns) {
        const rowItems = items.slice(i, i + columns);
        const h = Math.max(...rowItems.map(itemH));
        rowItems.forEach((k, j) => {
          const x = PAD + j * (cw + gap);
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
      ctx.fillRect(PAD, p.y, INNER, 1);
      p.y += 14;
      for (const line of lines) {
        p.y += para(line, PAD, p.y, INNER, {
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

/** How one card wants to be laid out and framed. */
export interface RenderCardOptions {
  geometry?: CardGeometry;
  /** Omit for a card drawn edge to edge on a plain ground. */
  frame?: CardFrame;
}

/**
 * Run a card's `draw` twice — once to measure, once to paint — and hand back a
 * PNG. `draw` must be deterministic; see the two-pass note at the top.
 *
 * A framed card is painted in three moves: the page colour over the whole
 * canvas, the rounded card on top of it, then `draw` under a clip of that same
 * rounded path — so a full-bleed band inside the card cannot square off its
 * corners. The frame can only be drawn on the SECOND pass, because it needs the
 * height the first pass measured.
 */
export async function renderCardPng(
  draw: (p: Painter) => void,
  opts: RenderCardOptions = {},
): Promise<Blob> {
  const geometry = opts.geometry ?? DEFAULT_GEOMETRY;
  const frame = opts.frame;
  const W = geometry.width;
  // Where content begins: inside the border for a framed card, at the top
  // otherwise. Both passes must agree, so it is computed once here.
  const top = geometry.inset + geometry.borderWidth;

  // Canvas draws with whatever the font stack resolves to AT THE MOMENT of the
  // call, so a card rendered before Inter finishes loading silently comes out in
  // the fallback — with different metrics from the ones just measured.
  try {
    await document.fonts?.ready;
  } catch {
    /* a browser without the Font Loading API still gets a card */
  }

  const roundedCard = (ctx: Ctx, height: number, f: CardFrame): void => {
    // The stroke straddles the path, so the path sits half a border in.
    const half = geometry.borderWidth / 2;
    const x = geometry.inset + half;
    const y = geometry.inset + half;
    const w = W - geometry.inset * 2 - geometry.borderWidth;
    const h = height - geometry.inset * 2 - geometry.borderWidth;
    ctx.beginPath();
    const rr = (
      ctx as Ctx & { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void }
    ).roundRect;
    if (typeof rr === 'function') rr.call(ctx, x, y, w, h, f.radius);
    else ctx.rect(x, y, w, h);
  };

  const measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) throw new Error('This browser cannot draw the image.');
  measureCtx.textBaseline = 'top';
  const measure = createPainter(measureCtx, geometry);
  measure.y = top;
  draw(measure);
  const height = Math.ceil(
    measure.y + (frame ? geometry.borderWidth + geometry.inset : geometry.pad),
  );

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the image.');
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'top';
  ctx.fillStyle = frame ? frame.page : C.page;
  ctx.fillRect(0, 0, W, height);

  if (frame) {
    roundedCard(ctx, height, frame);
    ctx.fillStyle = frame.card;
    ctx.fill();
    ctx.strokeStyle = frame.border;
    ctx.lineWidth = geometry.borderWidth;
    ctx.stroke();
    ctx.save();
    roundedCard(ctx, height, frame);
    ctx.clip();
  }
  const painter = createPainter(ctx, geometry);
  painter.y = top;
  draw(painter);
  if (frame) ctx.restore();

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
