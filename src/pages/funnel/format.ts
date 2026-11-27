/**
 * The "Website → app" page's small decisions (ADR 0059 §3), kept out of the component
 * so they can be tested: what a website tag (`pump:dealership-documents`, `home`, …)
 * is called on screen, and which live page it links to.
 *
 * A guide page's tag carries its id, not its address (the address is the guide's own
 * business and can change, and most addresses are not the id: `dealership-eligibility`
 * lives at /petrol-pump/dealership/who-can-apply/), so a guide page gets a readable title
 * made from the id and no link; the tools are the same (`tools:dip-chart` lives at
 * /tools/dip-chart-calculator/). The three guide front pages (`<collection>:hub`) have
 * fixed addresses and get a link. A page whose address is fixed gets both. A tag this file does not know is shown as it is,
 * so a new kind of page is never hidden.
 */
import type { FunnelRow } from '@dk/shared';

export const SITE = 'https://mdgservices.in';

/** The guide collections and the other tag families, by the prefix before the colon. */
const FAMILIES: Record<string, string> = {
  pump: 'Petrol-pump guide',
  mdg: 'MDG guide',
  kk: 'Khata Kavach guide',
  qa: 'New pump question',
  tools: 'Tool',
};

/** Pages named by a single word, with their fixed address (null: not one page). */
const PAGES: Record<string, { label: string; path: string | null }> = {
  home: { label: 'Home page', path: '/' },
  pricing: { label: 'Pricing', path: '/pricing' },
  about: { label: 'About', path: '/about' },
  contact: { label: 'Contact', path: '/contact' },
  'new-pump': { label: 'Kavach Shuruaat page', path: '/new-pump' },
  'new-pump-questions': { label: 'New pump questions', path: '/new-pump/questions' },
  'khata-kavach': { label: 'Khata Kavach page', path: '/khata-kavach' },
  // the guides' front pages send `<collection>:hub` (the website's guideSource)
  'pump:hub': { label: 'Petrol-pump guide home', path: '/petrol-pump/' },
  'mdg:hub': { label: 'MDG guides home', path: '/guides/' },
  'kk:hub': { label: 'Khata Kavach guides home', path: '/khata-kavach/guides/' },
  videos: { label: 'Videos', path: '/videos' },
  chat: { label: 'Website assistant (chat)', path: null },
  footer: { label: 'Footer (every page)', path: null },
};

/** "dealership-documents" → "Dealership documents". */
export function readableId(id: string): string {
  const words = id.replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : id;
}

export interface SourceView {
  /** What the row is called. */
  title: string;
  /** The family it belongs to, shown under the title ("Petrol-pump guide"); null for a named page. */
  family: string | null;
  /** The live page, or null when there is no one page to open. */
  href: string | null;
  /** The tag itself, for anyone who needs to search for it. */
  raw: string | null;
}

/** How one tag is shown. `null` is the row of sign-ups that came with no tag. */
export function sourceView(source: string | null): SourceView {
  if (source === null) {
    return { title: 'No source', family: null, href: null, raw: null };
  }
  const page = PAGES[source];
  if (page) return { title: page.label, family: null, href: page.path ? SITE + page.path : null, raw: source };
  const at = source.indexOf(':');
  if (at > 0) {
    const family = FAMILIES[source.slice(0, at)];
    const id = source.slice(at + 1);
    if (family && id) return { title: readableId(id), family, href: null, raw: source };
  }
  return { title: source, family: null, href: null, raw: source };
}

/** "3 of 12 (25%)" for a column that is a share of another; "0" when there is nothing to share. */
export function shareOf(part: number, whole: number): string {
  if (whole <= 0) return String(part);
  return `${part} of ${whole} (${Math.round((part / whole) * 100)}%)`;
}

/** True when the window has nothing in it at all, so the page can say so instead of a table of zeros. */
export function isEmptyReport(rows: readonly FunnelRow[], noSource: FunnelRow): boolean {
  return rows.length === 0 && noSource.taps.total === 0 && noSource.signUps === 0;
}
