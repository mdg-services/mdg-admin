/**
 * The Water Ingress Testing card, drawn.
 *
 * Layout only — the strings live in `waterIngressCard.ts` and the surface in
 * `cardCanvas.ts`. Nothing here is bespoke: a band, a stat strip, up to three
 * notes and the twelve-window table are all shared primitives, which is the
 * point of having extracted them.
 */
import { C, renderCardPng, type Painter } from './cardCanvas';
import type { WaterIngressCardModel } from './waterIngressCard';

function paint(p: Painter, m: WaterIngressCardModel): void {
  p.band({
    eyebrow: 'WATER INGRESS TESTING',
    headline: m.outlet,
    sub: m.date,
    rightTop: `Prepared ${m.prepared}`,
    rightBottom: 'MDG Services',
  });

  p.section('The day', "As the portal shows it");
  p.stats(m.stats);

  // Order matters: the finding first, then the reason the count may move, then
  // the caveat about how fresh the grid is.
  if (m.missedNote) p.strip(m.missedNote, C.redSoft, C.redLine, C.redInk);
  if (m.goodNote) p.strip(m.goodNote, C.goodSoft, C.goodLine, C.good);
  if (m.todayNote) p.strip(m.todayNote, C.soft, C.line, C.muted);
  if (m.failureNote) p.strip(m.failureNote, C.amberSoft, C.amberLine, C.amberInk);
  p.y += 28;

  p.section('Every observation window', 'Two hours each');
  p.table(m.slots.columns, [0.26, 0.14, 0.16, 0.24, 0.2], m.slots.rows);
  p.y += 28;

  p.footer(m.footer);
}

export function renderWaterIngressCardPng(model: WaterIngressCardModel): Promise<Blob> {
  return renderCardPng((p) => paint(p, model));
}
