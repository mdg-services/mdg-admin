/**
 * Checks for the inbox's column widths (`src/lib/columnLayout.ts`): what a
 * dragged width turns into on the screen it is drawn on, and that the chat
 * always keeps its floor.
 *
 * This app has no test runner, so these are plain `node:test` checks over the
 * pure module, run through the `tsx` the repo root already carries:
 *
 *   cd mdg-admin && npm run check:column-layout
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CHAT_MIN,
  LIST_DEFAULT,
  LIST_MAX,
  LIST_MIN,
  PANEL_MAX,
  PANEL_MIN,
  columnWidths,
} from '../src/lib/columnLayout';

const both = { listShown: true, panelShown: true, is2xl: false };
const none = { list: null, panel: null };
// The inbox's own width on a 1280px laptop: the screen less the app's sidebar.
const LAPTOP = 1072;

describe('columnWidths', () => {
  it('draws the widths that shipped before anything could be dragged', () => {
    const w = columnWidths(LAPTOP, none, both);
    assert.equal(w.list, LIST_DEFAULT);
    assert.equal(w.panel, 320);
    assert.equal(LAPTOP - w.list - w.panel, 432);
    assert.equal(columnWidths(1800, none, { ...both, is2xl: true }).panel, 360);
  });

  it('keeps a dragged width that fits', () => {
    const w = columnWidths(1800, { list: 400, panel: 500 }, both);
    assert.deepEqual([w.list, w.panel], [400, 500]);
  });

  it('never goes past the narrowest or widest a column may be', () => {
    const w = columnWidths(4000, { list: 9000, panel: 9000 }, both);
    assert.deepEqual([w.list, w.panel], [LIST_MAX, PANEL_MAX]);
    const n = columnWidths(4000, { list: 10, panel: 10 }, both);
    assert.deepEqual([n.list, n.panel], [LIST_MIN, PANEL_MIN]);
  });

  it('gives the chat its floor when a wide-monitor width meets a laptop', () => {
    const w = columnWidths(LAPTOP, { list: 480, panel: 560 }, both);
    assert.ok(LAPTOP - w.list - w.panel >= CHAT_MIN);
  });

  it('gives a folded list nothing, and the chat its room', () => {
    const w = columnWidths(LAPTOP, { list: 400, panel: null }, { ...both, listShown: false });
    assert.equal(w.list, 0);
    assert.equal(w.panelMax, PANEL_MAX);
  });

  it('lets the list take the panel\'s room while the panel is shut', () => {
    const shut = columnWidths(800, { list: 480, panel: null }, { ...both, panelShown: false });
    assert.equal(shut.panel, 0);
    assert.equal(shut.list, 800 - CHAT_MIN);
  });

  it('holds every floor at once even when they cannot all fit', () => {
    const w = columnWidths(600, none, both);
    assert.equal(w.list, LIST_MIN);
    assert.equal(w.panel, PANEL_MIN);
  });
});
