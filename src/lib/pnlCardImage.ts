/**
 * The Fuel P&L card, drawn.
 *
 * Layout only — the strings are decided in `pnlCard.ts` and the drawing surface
 * is `cardCanvas.ts`. The one thing here that is not a generic primitive is the
 * pair of scenario boxes, because the whole point of this card is that the two
 * answers are the same size, side by side, with neither presented as the true
 * one.
 */
import {
  C,
  CARD_INNER,
  CARD_PAD,
  renderCardPng,
  type Painter,
} from './cardCanvas';
import type { CardScenario, PnlCardModel } from './pnlCard';

const GAP = 16;
const COL_W = (CARD_INNER - GAP) / 2;
const BODY_W = COL_W - 36;

/** How tall a scenario box needs to be, before either is drawn. */
function scenarioH(p: Painter, s: CardScenario): number {
  return (
    18 +
    p.paraH(s.heading, BODY_W - 70, { weight: 700, size: 15, lh: 20 }) +
    p.paraH(s.subheading, BODY_W, { weight: 500, size: 12, lh: 16 }) +
    14 +
    14 +
    38 +
    10 +
    s.rows.length * 22 +
    18 +
    16 +
    s.variation.length * 19 +
    18
  );
}

function drawScenario(p: Painter, s: CardScenario, x: number, top: number, h: number): void {
  p.box(x, top, COL_W, h, s.selected ? C.brandSoft : C.soft, s.selected ? C.brandLine : C.line);
  let cy = top + 18;
  const cx = x + 18;

  if (s.selected) {
    p.para('SHOWN ON SCREEN', x + 18, cy + 3, COL_W - 36, {
      weight: 700,
      size: 10,
      color: C.brand,
      lh: 13,
      right: true,
    });
  }
  cy += p.para(s.heading, cx, cy, BODY_W - 70, { weight: 700, size: 15, color: C.ink, lh: 20 });
  cy += p.para(s.subheading, cx, cy, BODY_W, { weight: 500, size: 12, color: C.muted, lh: 16 });
  cy += 14;

  p.para('FUEL PROFIT', cx, cy, BODY_W, { weight: 700, size: 10, color: C.subtle, lh: 13 });
  cy += 14;
  p.para(s.profit, cx, cy, BODY_W, {
    weight: 700,
    size: 30,
    color: s.profitBad ? C.danger : C.ink,
    lh: 38,
  });
  cy += 38 + 10;

  for (const r of s.rows) {
    p.para(r.hint ? `${r.label} (${r.hint})` : r.label, cx, cy + 2, BODY_W - 90, {
      weight: 500,
      size: 12,
      color: C.muted,
      lh: 16,
    });
    p.para(r.value, cx, cy + 1, BODY_W, {
      weight: 600,
      size: 13,
      color: r.bad ? C.danger : C.ink,
      lh: 17,
      right: true,
    });
    cy += 22;
  }

  cy += 8;
  p.hline(cx, cy, BODY_W, s.selected ? C.brandLine : C.line);
  cy += 10;
  p.para('STOCK VARIATION', cx, cy, BODY_W, { weight: 700, size: 10, color: C.subtle, lh: 13 });
  cy += 16;
  for (const v of s.variation) {
    p.para(v.label, cx, cy, BODY_W - 80, { weight: 500, size: 12, color: C.muted, lh: 16 });
    p.para(v.value, cx, cy, BODY_W, {
      weight: 600,
      size: 12,
      color: v.bad ? C.danger : C.ink,
      lh: 16,
      right: true,
    });
    cy += 19;
  }
}

function paintPnl(p: Painter, m: PnlCardModel): void {
  p.band({
    eyebrow: 'FUEL PROFIT & LOSS',
    headline: m.outlet,
    sub: m.period,
    rightTop: `Prepared ${m.prepared}`,
    rightBottom: 'MDG Services',
  });

  p.section('The answer — both of them', 'Nobody knows which');
  const boxH = Math.max(...m.scenarios.map((s) => scenarioH(p, s)));
  m.scenarios.forEach((s, i) => drawScenario(p, s, CARD_PAD + i * (COL_W + GAP), p.y, boxH));
  p.y += boxH;

  // The caveats that must never be separated from the figures above them.
  if (m.swing) p.strip(m.swing, C.amberSoft, C.amberLine, C.amberInk);
  if (m.caution) p.strip(m.caution, C.redSoft, C.redLine, C.redInk);
  if (m.unpriced) p.strip(m.unpriced, C.soft, C.line, C.muted);
  p.y += 28;

  p.section('What was measured', 'Counted from the day book');
  p.stats(m.measured);
  p.y += 28;

  p.section('What was assumed — the prices', m.priced ? undefined : 'None entered yet');
  p.table(m.rates.columns, [0.4, 0.2, 0.2, 0.2], m.rates.rows);
  p.y += 12;
  p.y += p.para(m.rateSource, CARD_PAD, p.y, CARD_INNER, {
    weight: 500,
    size: 11.5,
    color: C.muted,
    lh: 16,
  });
  if (m.rateWarning) {
    p.y += 6;
    p.y += p.para(m.rateWarning, CARD_PAD, p.y, CARD_INNER, {
      weight: 600,
      size: 11.5,
      color: C.amberInk,
      lh: 16,
    });
  }
  p.y += 28;

  p.section("What was assumed — the report's own settings", 'Not editable here');
  p.kvGrid(m.engine, 2);
  p.y += 12;

  p.section('Grade by grade', 'Both answers, per fuel');
  p.table(m.grades.columns, [0.28, 0.15, 0.2, 0.18, 0.19], m.grades.rows);
  p.y += 28;

  p.footer(m.footer);
}

export function renderPnlCardPng(model: PnlCardModel): Promise<Blob> {
  return renderCardPng((p) => paintPnl(p, model));
}
