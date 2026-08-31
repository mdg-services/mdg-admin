/**
 * The Water Ingress Testing card, drawn in the Credit & DOD card's clothes.
 *
 * Same maroon, same gold, same cream, same repeating brand strip — lifted from
 * `automation/sdms/report/renderCard.ts` so a dealer who has been receiving one
 * of those every morning recognises this as the same desk writing, not a second
 * supplier. That card is Playwright-rendered HTML on the server; this one is a
 * canvas in the browser, so the styling is re-expressed rather than shared. The
 * palette constants ARE shared (`C` in `cardCanvas.ts`), which is the half that
 * would otherwise drift.
 *
 * Bilingual everywhere: the English line is the portal's own term, the Hindi
 * under it is what the term means.
 *
 * The table is drawn here rather than through `Painter.table` because every cell
 * may carry a second, smaller Hindi line, and a generic table that grew a
 * parallel-language mode would be a worse abstraction than fifty lines of layout
 * in the one card that needs it.
 */
import {
  C,
  renderCardPng,
  type CardCell,
  type CardFrame,
  type CardGeometry,
  type Painter,
} from './cardCanvas';
import type { Bi, CardNote, CardTile, WaterIngressCardModel } from './waterIngressCard';

/** 1000px wide with a 6px border, exactly like the Credit & DOD card. */
const GEOMETRY: CardGeometry = { width: 1000, pad: 52, inset: 16, borderWidth: 6 };

const FRAME: CardFrame = {
  page: C.pageWarm,
  card: C.cream,
  border: C.maroon,
  radius: 22,
};

const BRAND = "Dealer's कवच · @MDG Services";

function cellText(c: CardCell): string {
  return typeof c === 'string' ? c : c.text;
}

/** The gold marquee that tops and tails every card in this family. */
function brandStrip(p: Painter, atTop: boolean): void {
  const H = 34;
  const top = p.y;
  const g = p.ctx.createLinearGradient(p.edge, 0, p.edge + p.edgeW, 0);
  g.addColorStop(0, C.gold);
  g.addColorStop(0.5, C.goldMid);
  g.addColorStop(1, C.gold);
  p.ctx.fillStyle = g;
  p.ctx.fillRect(p.edge, top, p.edgeW, H);
  // The rule goes on the strip's INNER edge — under it at the top of the card,
  // over it at the bottom — so the band always reads as bound to the body.
  p.rect(p.edge, atTop ? top + H - 2 : top, p.edgeW, 2, C.maroon);

  p.font(800, 15);
  const step = p.ctx.measureText(BRAND).width + 24;
  p.ctx.save();
  p.ctx.beginPath();
  p.ctx.rect(p.edge, top, p.edgeW, H);
  p.ctx.clip();
  p.ctx.fillStyle = C.maroon;
  for (let x = p.edge + 12; x < p.edge + p.edgeW; x += step) p.ctx.fillText(BRAND, x, top + 9);
  p.ctx.restore();
  p.y = top + H;
}

/** Maroon: the MDG mark, the bilingual title, and the dealer's code in gold. */
function header(p: Painter, m: WaterIngressCardModel): void {
  const H = 122;
  const top = p.y;
  const g = p.ctx.createLinearGradient(0, top, 0, top + H);
  g.addColorStop(0, C.maroon);
  g.addColorStop(1, C.maroonDeep);
  p.ctx.fillStyle = g;
  p.ctx.fillRect(p.edge, top, p.edgeW, H);

  // The mark.
  const lx = p.edge + 26;
  const ly = top + 26;
  p.box(lx, ly, 70, 70, '#ffffff', '#ffffff');
  p.ctx.fillStyle = C.maroon;
  p.font(800, 21);
  p.ctx.textAlign = 'center';
  p.ctx.fillText('MDG', lx + 35, ly + 27);

  // The title, centred on the card rather than on the space between the mark
  // and the code — the two flanks are different widths and a title centred
  // between them reads as accidentally off-centre.
  const cx = p.edge + p.edgeW / 2;
  p.ctx.fillStyle = '#ffffff';
  p.font(800, 33);
  p.ctx.fillText(m.title.en, cx, top + 30);
  p.ctx.fillStyle = C.gold;
  p.font(600, 20);
  p.ctx.fillText(m.title.hi, cx, top + 74);
  p.ctx.textAlign = 'left';

  // The code, in a gold pill.
  p.font(800, 25);
  const cw = p.ctx.measureText(m.outlet).width;
  const pillW = cw + 34;
  const px = p.edge + p.edgeW - 26 - pillW;
  const py = top + 40;
  p.box(px, py, pillW, 44, C.gold, C.gold);
  p.ctx.fillStyle = C.maroon;
  p.ctx.textAlign = 'center';
  p.ctx.fillText(m.outlet, px + pillW / 2, py + 9);
  p.ctx.textAlign = 'left';

  p.y = top + H;
}

/** One number, one day, one verdict — the Credit & DOD hero, restated. */
function hero(p: Painter, m: WaterIngressCardModel): void {
  const H = 192;
  const top = p.y;
  const PANEL = 306;
  const good = m.hero.good;
  const tone = good ? C.cardGreen : C.maroon;

  p.rect(p.edge, top, p.edgeW, H, good ? C.cardGreenSoft : C.maroonSoft);

  const x = p.edge + 30;
  const lw = p.edgeW - PANEL - 60;
  p.para(m.hero.eyebrow.en, x, top + 24, lw, { weight: 800, size: 15, color: tone, lh: 19 });
  p.para(m.hero.value, x, top + 46, lw, { weight: 800, size: 62, color: tone, lh: 70 });
  p.para(m.hero.eyebrow.hi, x, top + 118, lw, {
    weight: 700,
    size: 19,
    color: C.cardInk,
    lh: 24,
  });
  p.para(m.hero.sub.hi, x, top + 144, lw, { weight: 600, size: 16, color: C.cardInk, lh: 20 });
  p.para(m.hero.sub.en, x, top + 166, lw, {
    weight: 600,
    size: 14,
    color: C.cardInkSoft,
    lh: 18,
  });

  // The panel.
  const px = p.edge + p.edgeW - PANEL;
  p.rect(px, top, PANEL, H, good ? C.cardGreenSoft : C.cream);
  p.rect(px, top, 3, H, C.grid);
  const ix = px + 26;
  const iw = PANEL - 52;
  p.para(m.hero.panel.label.en, ix, top + 26, iw, {
    weight: 800,
    size: 14,
    color: good ? C.cardGreen : C.maroon,
    lh: 18,
  });
  p.para(m.hero.panel.value.en, ix, top + 50, iw, {
    weight: 800,
    size: 25,
    color: C.cardInk,
    lh: 30,
  });
  p.para(m.hero.panel.value.hi, ix, top + 82, iw, {
    weight: 600,
    size: 16,
    color: C.cardInkSoft,
    lh: 20,
  });
  p.para(m.hero.panel.verdict.hi, ix, top + 116, iw, {
    weight: 700,
    size: 19,
    color: good ? C.cardGreen : C.cardRed,
    lh: 24,
  });
  p.para(m.hero.panel.verdict.en, ix, top + 144, iw, {
    weight: 600,
    size: 15,
    color: good ? C.cardGreen : C.cardRed,
    lh: 19,
  });

  p.y = top + H;
}

/** Four white tiles on the cream ground. */
function tiles(p: Painter, list: CardTile[]): void {
  const GAP = 14;
  const w = (p.inner - GAP * (list.length - 1)) / list.length;
  const top = p.y;
  let h = 0;
  for (const t of list) {
    const inner = w - 32;
    h = Math.max(
      h,
      16 +
        p.paraH(t.label.en, inner, { weight: 800, size: 13, lh: 17 }) +
        p.paraH(t.label.hi, inner, { weight: 600, size: 13, lh: 17 }) +
        6 +
        p.paraH(t.value, inner, { weight: 800, size: 20, lh: 26 }) +
        (t.valueHi ? p.paraH(t.valueHi, inner, { weight: 600, size: 13, lh: 17 }) : 0) +
        16,
    );
  }
  list.forEach((t, i) => {
    const x = p.pad + i * (w + GAP);
    p.box(x, top, w, h, '#ffffff', C.grid);
    const ix = x + 16;
    const iw = w - 32;
    let ty = top + 16;
    ty += p.para(t.label.en, ix, ty, iw, { weight: 800, size: 13, color: C.maroon, lh: 17 });
    ty += p.para(t.label.hi, ix, ty, iw, { weight: 600, size: 13, color: C.cardInkSoft, lh: 17 });
    ty += 6;
    ty += p.para(t.value, ix, ty, iw, {
      weight: 800,
      size: 20,
      color: t.color ?? C.cardInk,
      lh: 26,
    });
    if (t.valueHi) {
      p.para(t.valueHi, ix, ty, iw, { weight: 600, size: 13, color: C.cardInkSoft, lh: 17 });
    }
  });
  p.y = top + h;
}

const NOTE_TONES: Record<CardNote['tone'], { fill: string; line: string; ink: string }> = {
  bad: { fill: '#fee2e2', line: '#fca5a5', ink: C.cardRed },
  good: { fill: C.cardGreenSoft, line: '#86efac', ink: C.cardGreen },
  info: { fill: '#ffffff', line: C.grid, ink: C.cardInkSoft },
  warn: { fill: C.goldSoft, line: C.gold, ink: '#c2410c' },
};

function notes(p: Painter, list: CardNote[]): void {
  for (const n of list) {
    const t = NOTE_TONES[n.tone];
    const iw = p.inner - 36;
    const h =
      16 +
      p.paraH(n.text.hi, iw, { weight: 700, size: 18, lh: 25 }) +
      4 +
      p.paraH(n.text.en, iw, { weight: 600, size: 14, lh: 19 }) +
      16;
    p.y += 12;
    p.box(p.pad, p.y, p.inner, h, t.fill, t.line);
    // Hindi first and larger here, not second: this is the sentence a dealer
    // acts on, and the English above it would make them read past it.
    let ny = p.y + 16;
    ny += p.para(n.text.hi, p.pad + 18, ny, iw, { weight: 700, size: 18, color: t.ink, lh: 25 });
    ny += 4;
    p.para(n.text.en, p.pad + 18, ny, iw, { weight: 600, size: 14, color: C.cardInkSoft, lh: 19 });
    p.y += h;
  }
}

/** Every observation window, both languages, inside one white tile. */
function grid(p: Painter, m: WaterIngressCardModel): void {
  const WEIGHTS = [0.3, 0.18, 0.24, 0.28];
  const PADX = 18;
  const top = p.y;
  const widths = WEIGHTS.map((w) => (p.inner - PADX * 2) * w);
  const xs: number[] = [];
  let acc = p.pad + PADX;
  for (const w of widths) {
    xs.push(acc);
    acc += w;
  }

  // Measure first: the tile has to be drawn under the rows, not over them.
  const headH =
    Math.max(
      ...m.columns.map((c) => p.paraH(c.en, 200, { weight: 800, size: 13, lh: 17 })),
    ) +
    Math.max(...m.columns.map((c) => p.paraH(c.hi, 200, { weight: 600, size: 13, lh: 17 }))) +
    18;
  const rowHs = m.rows.map((r) => {
    let h = 0;
    r.cells.forEach((cell, i) => {
      const en = p.paraH(cellText(cell), widths[i]! - 10, { weight: 600, size: 15, lh: 20 });
      const hi = r.hi[i]
        ? p.paraH(r.hi[i]!, widths[i]! - 10, { weight: 600, size: 13, lh: 17 })
        : 0;
      h = Math.max(h, en + hi);
    });
    return h + 18;
  });
  const total = 16 + headH + rowHs.reduce((a, b) => a + b, 0) + 12;

  p.box(p.pad, top, p.inner, total, '#ffffff', C.grid);

  let y = top + 16;
  m.columns.forEach((c, i) => {
    const used = p.para(c.en, xs[i]!, y, widths[i]! - 10, {
      weight: 800,
      size: 13,
      color: C.maroon,
      lh: 17,
    });
    p.para(c.hi, xs[i]!, y + used, widths[i]! - 10, {
      weight: 600,
      size: 13,
      color: C.cardInkSoft,
      lh: 17,
    });
  });
  y = top + 16 + headH - 8;
  p.hline(p.pad + PADX, y, p.inner - PADX * 2, C.grid);
  y += 8;

  m.rows.forEach((r, ri) => {
    r.cells.forEach((cell, i) => {
      const colour = typeof cell === 'string' ? C.cardInk : (cell.color ?? C.cardInk);
      const weight = typeof cell === 'string' ? (i === 0 ? 700 : 600) : (cell.weight ?? 600);
      const used = p.para(cellText(cell), xs[i]!, y + 9, widths[i]! - 10, {
        weight,
        size: 15,
        color: colour,
        lh: 20,
      });
      if (r.hi[i]) {
        p.para(r.hi[i]!, xs[i]!, y + 9 + used, widths[i]! - 10, {
          weight: 600,
          size: 13,
          color: colour,
          lh: 17,
        });
      }
    });
    y += rowHs[ri]!;
    if (ri < m.rows.length - 1) p.hline(p.pad + PADX, y, p.inner - PADX * 2, C.grid);
  });

  p.y = top + total;
}

function paint(p: Painter, m: WaterIngressCardModel): void {
  brandStrip(p, true);
  header(p, m);
  hero(p, m);
  p.y += 22;
  tiles(p, m.tiles);
  notes(p, m.notes);
  p.y += 22;
  grid(p, m);
  p.y += 22;
  brandStrip(p, false);
}

export function renderWaterIngressCardPng(model: WaterIngressCardModel): Promise<Blob> {
  return renderCardPng((p) => paint(p, model), { geometry: GEOMETRY, frame: FRAME });
}

/** Re-exported so the pane imports one name for "the language of this card". */
export type { Bi };
