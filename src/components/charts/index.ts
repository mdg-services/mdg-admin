/**
 * Hand-rolled chart primitives. Deliberately no charting dependency: the admin
 * needs three forms (columns over time, ranked bars, a meter), all of which are
 * a div with a width, and the smallest React chart libraries cost more gzipped
 * than this whole folder — on a portal that is regularly opened over 2G.
 *
 * House rules, so a fourth chart does not drift from these three:
 *  - ONE hue (`brand`) for the data. Grey (`border-strong`) is de-emphasis, not
 *    a second series. A genuine second series needs a validated palette first.
 *  - Marks are thin: bars ≤ 24px, 4px rounding on the data end only, square at
 *    the baseline, 2px of surface between neighbours.
 *  - Grid and axis rules are SOLID hairlines. Dashed is reserved for a
 *    threshold line, so dashing always means "target".
 *  - Text wears text tokens, never the series colour.
 *  - Every value the hover readout shows is also reachable without hovering.
 */
export * from './ColumnChart';
export * from './RankedBars';
export * from './StatTile';
export * from './StatTileGrid';
