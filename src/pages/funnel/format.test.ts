import { describe, expect, it } from 'vitest';

import type { FunnelRow } from '@dk/shared';

import { isEmptyReport, readableId, shareOf, sourceView } from './format';

const row = (over: Partial<FunnelRow> = {}): FunnelRow => ({
  source: null,
  taps: { android: 0, ios: 0, other: 0, total: 0 },
  signUps: 0,
  paid: 0,
  ...over,
});

describe('sourceView', () => {
  it('names a guide page by its id, says which guide, and gives no link (the tag has no address)', () => {
    expect(sourceView('pump:dealership-documents')).toEqual({
      title: 'Dealership documents',
      family: 'Petrol-pump guide',
      href: null,
      raw: 'pump:dealership-documents',
    });
    expect(sourceView('mdg:qrc-team-visit').family).toBe('MDG guide');
    expect(sourceView('kk:join-pump').family).toBe('Khata Kavach guide');
    expect(sourceView('qa:who-can-apply').title).toBe('Who can apply');
    expect(sourceView('tools:dip_chart')).toMatchObject({ title: 'Dip chart', family: 'Tool' });
  });

  it('links a page whose address is fixed to the live site', () => {
    expect(sourceView('home')).toEqual({ title: 'Home page', family: null, href: 'https://mdgservices.in/', raw: 'home' });
    expect(sourceView('new-pump').href).toBe('https://mdgservices.in/new-pump');
    expect(sourceView('new-pump-questions').href).toBe('https://mdgservices.in/new-pump/questions');
    expect(sourceView('pricing').href).toBe('https://mdgservices.in/pricing');
    expect(sourceView('khata-kavach').href).toBe('https://mdgservices.in/khata-kavach');
  });

  it('links the guides\' front pages, which send <collection>:hub', () => {
    expect(sourceView('pump:hub')).toEqual({ title: 'Petrol-pump guide home', family: null, href: 'https://mdgservices.in/petrol-pump/', raw: 'pump:hub' });
    expect(sourceView('mdg:hub').href).toBe('https://mdgservices.in/guides/');
    expect(sourceView('kk:hub').href).toBe('https://mdgservices.in/khata-kavach/guides/');
    // no page sends these single words, so they are not names the report knows
    expect(sourceView('petrol-pump')).toMatchObject({ title: 'petrol-pump', href: null });
    expect(sourceView('guides')).toMatchObject({ title: 'guides', href: null });
  });

  it('names the chat and the footer without a link: they are on many pages', () => {
    expect(sourceView('chat')).toMatchObject({ title: 'Website assistant (chat)', href: null });
    expect(sourceView('footer')).toMatchObject({ title: 'Footer (every page)', href: null });
  });

  it('shows a tag it does not know as it is, never hiding it', () => {
    expect(sourceView('blog:monsoon-tips')).toEqual({ title: 'blog:monsoon-tips', family: null, href: null, raw: 'blog:monsoon-tips' });
    expect(sourceView('pump:')).toMatchObject({ title: 'pump:', family: null });
    expect(sourceView('newsletter')).toMatchObject({ title: 'newsletter', href: null });
  });

  it('calls the untagged row "No source"', () => {
    expect(sourceView(null)).toEqual({ title: 'No source', family: null, href: null, raw: null });
  });
});

describe('readableId', () => {
  it('turns an id into words with a capital first letter', () => {
    expect(readableId('dealership-documents')).toBe('Dealership documents');
    expect(readableId('land__lease')).toBe('Land lease');
    expect(readableId('---')).toBe('---');
  });
});

describe('shareOf', () => {
  it('says how many of the sign-ups paid, with the percentage', () => {
    expect(shareOf(1, 4)).toBe('1 of 4 (25%)');
    expect(shareOf(2, 3)).toBe('2 of 3 (67%)');
    expect(shareOf(0, 0)).toBe('0');
  });
});

describe('isEmptyReport', () => {
  it('is empty only when there are no page rows and the untagged row has nothing either', () => {
    expect(isEmptyReport([], row())).toBe(true);
    expect(isEmptyReport([], row({ signUps: 1 }))).toBe(false);
    expect(isEmptyReport([], row({ taps: { android: 0, ios: 0, other: 1, total: 1 } }))).toBe(false);
    expect(isEmptyReport([row({ source: 'home' })], row())).toBe(false);
  });
});
