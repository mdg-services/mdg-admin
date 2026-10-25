/**
 * Checks for the sidebar's saved order (`src/components/layout/navOrder.ts`):
 * reading what the browser stored, laying the items out in that order, and
 * where a page the saved list has never seen ends up.
 *
 * This app has no test runner, so these are plain `node:test` checks over the
 * pure module, run through the `tsx` the repo root already carries:
 *
 *   cd mdg-admin && npm run check:nav-order
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isDefaultOrder,
  moveItem,
  orderNavItems,
  parseNavOrder,
} from '../src/components/layout/navOrder';

const items = ['/leads', '/films', '/whatsapp', '/inbox', '/alerts'].map((to) => ({ to }));
const routes = (list: { to: string }[]) => list.map((i) => i.to);

describe('parseNavOrder', () => {
  it('reads a stored list of routes', () => {
    assert.deepEqual(parseNavOrder('["/inbox","/leads"]'), ['/inbox', '/leads']);
  });
  it('treats nothing, an empty list or garbage as no saved order', () => {
    for (const raw of [null, undefined, '', '[]', 'not json', '{"a":1}', '[1,2]']) {
      assert.equal(parseNavOrder(raw), null, String(raw));
    }
  });
});

describe('orderNavItems', () => {
  it('keeps the default order when nothing is saved', () => {
    assert.deepEqual(routes(orderNavItems(items, null)), routes(items));
  });
  it('lays the items out in the saved order', () => {
    const saved = ['/alerts', '/inbox', '/whatsapp', '/films', '/leads'];
    assert.deepEqual(routes(orderNavItems(items, saved)), saved);
  });
  it('drops a saved route that no longer exists, and a repeated one', () => {
    const saved = ['/alerts', '/gone', '/alerts', '/inbox', '/whatsapp', '/films', '/leads'];
    assert.deepEqual(routes(orderNavItems(items, saved)), [
      '/alerts',
      '/inbox',
      '/whatsapp',
      '/films',
      '/leads',
    ]);
  });
  it('puts a page added since the save straight after the one it follows by default', () => {
    // `/whatsapp` is new; by default it follows `/films`, wherever that was dragged.
    const saved = ['/films', '/alerts', '/leads', '/inbox'];
    assert.deepEqual(routes(orderNavItems(items, saved)), [
      '/films',
      '/whatsapp',
      '/alerts',
      '/leads',
      '/inbox',
    ]);
  });
  it('puts new pages at the top, in their own order, when nothing comes before them', () => {
    const saved = ['/alerts', '/inbox', '/whatsapp'];
    assert.deepEqual(routes(orderNavItems(items, saved)), [
      '/leads',
      '/films',
      '/alerts',
      '/inbox',
      '/whatsapp',
    ]);
  });
});

describe('moveItem', () => {
  it('moves an entry down and up', () => {
    assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
    assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
  });
  it('leaves the list alone for a move to the same place or from nowhere', () => {
    assert.deepEqual(moveItem(['a', 'b'], 1, 1), ['a', 'b']);
    assert.deepEqual(moveItem(['a', 'b'], -1, 0), ['a', 'b']);
  });
});

describe('isDefaultOrder', () => {
  it('is true only for the same routes in the same order', () => {
    assert.equal(isDefaultOrder(['a', 'b'], ['a', 'b']), true);
    assert.equal(isDefaultOrder(['b', 'a'], ['a', 'b']), false);
    assert.equal(isDefaultOrder(['a'], ['a', 'b']), false);
  });
});
