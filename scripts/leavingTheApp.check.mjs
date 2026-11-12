/**
 * Nothing of ours opens outside the app — checked on every build.
 *
 * WHY THIS EXISTS
 * ---------------
 * Inside the admin phone app, the shell hands every address that is not the
 * admin's own to the phone's browser (that is how a WhatsApp or Razorpay link
 * opens, and it is right for those). But photos and papers live at a storage
 * address, so an `<a href={photo.url} target="_blank">` or a bare
 * `window.open(viewUrl)` throws the admin out of the app to look at a picture.
 * The dealer app shipped exactly that on the Mock Drill photo (12 Nov 2026).
 *
 * So every way of leaving the page — a new tab, `window.open`, a link built from
 * a URL variable, `location.assign` — is allowed only where it is on purpose,
 * and each allowed place is counted. A new one fails the build. Use instead:
 *
 *  - a photo:        `ImageLightbox` (`@/components/ui`)
 *  - a PDF:          `PdfViewer` (`@/components/ui`), or `useOpenPaper` for a
 *                    stored paper with a view link and a download link
 *  - any other file: `downloadFile` (`@/lib/downloadFile`)
 *  - a page of another site: add it to ALLOWED below, with why
 *
 * Plain Node, no packages, so it can run before the build anywhere:
 *
 *   cd mdg-admin && npm run check:leaving-the-app
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

/** The places that leave the page on purpose, how many times each, and why. */
const ALLOWED = {
  'src/lib/downloadFile.ts': {
    count: 1,
    why: 'the file road itself: the last fallback for a browser or an old phone app',
  },
  'src/lib/downloadAttachment.ts': { count: 1, why: 'the same fallback for a chat attachment' },
  'src/lib/linkify.tsx': { count: 2, why: 'a web link someone typed in chat opens in the browser' },
  'src/features/chat/MediaGalleryCard.tsx': { count: 2, why: 'the Links tab: those same typed links' },
  'src/components/ui/HowThisWorks.tsx': { count: 1, why: 'a guide page on mdgservices.in' },
  'src/features/films/ShareLinksCard.tsx': { count: 2, why: 'WhatsApp share links: open WhatsApp' },
  'src/features/onboarding/AutopayPanel.tsx': { count: 1, why: 'a WhatsApp link: opens WhatsApp' },
  'src/features/onboarding/BillingDialogs.tsx': { count: 1, why: 'a WhatsApp link: opens WhatsApp' },
  'src/features/onboarding/WelcomeWords.tsx': { count: 1, why: 'a WhatsApp link: opens WhatsApp' },
  'src/features/payments/PaymentDrawer.tsx': {
    count: 2,
    why: "a WhatsApp link, and a payment on Razorpay's own dashboard",
  },
  'src/features/replyHelper/SuggestedVideos.tsx': { count: 1, why: 'a video page on mdgservices.in' },
  'src/features/videos/VideoDetailDialog.tsx': { count: 2, why: 'a video page on mdgservices.in' },
  'src/pages/FilmsPage.tsx': { count: 2, why: 'a film page on mdgservices.in' },
  'src/pages/whatsapp/WhatsAppResultsPage.tsx': {
    count: 1,
    why: 'the page a sent message pointed at, on another site',
  },
  'src/features/whatsapp/MessageMedia.tsx': { count: 1, why: 'a shared location opens Google Maps' },
  'src/features/leads/LeadActions.tsx': { count: 1, why: 'a tel: link: opens the dialler' },
  'src/pages/dealers/SummonMenu.tsx': {
    count: 1,
    why: 'the Chrome extension install page; never shown inside the phone app',
  },
  'src/hooks/api/useWhatsAppMedia.ts': {
    count: 1,
    why: 'a WhatsApp document in a laptop browser; the phone app is told to use a laptop',
  },
  'src/pages/dsr/DsrReportPanel.tsx': {
    count: 2,
    why: 'the full DSR report in a laptop tab; hidden inside the phone app',
  },
  'src/hooks/useOpenPaper.tsx': {
    count: 2,
    why: "the vault papers' one road: a laptop browser gets a tab; in the app a PDF opens in PdfViewer",
  },
};

/** Comments explain the rule and quote the bad pattern; only code counts. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** How many times a file leaves the page. A `target="_blank"` with its `'_blank'` counts once. */
export function exits(text) {
  const c = code(text);
  const count = (re) => c.match(re)?.length ?? 0;
  const target = count(/\btarget\s*[=:]\s*\{?\s*["'`]_blank/g);
  const blank = count(/['"`]_blank['"`]/g);
  const open = count(/\bwindow\.open\s*\(/g);
  const assign = count(/\blocation\.(assign|replace)\s*\(/g);
  // A link built from a URL variable: `href={photo.url}`, `href={report.htmlUrl}`.
  const urlHref = count(/\bhref=\{[^}]*url/gi);
  return target + open + assign + urlHref + Math.max(0, blank - target - open);
}

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe('nothing of ours opens outside the admin app', () => {
  const files = sources(SRC);

  it("is actually looking at the admin's source", () => {
    assert.ok(files.length > 100, `only ${files.length} files found under ${SRC}`);
    const seen = new Set(files.map((f) => relative(ROOT, f)));
    for (const path of Object.keys(ALLOWED)) assert.ok(seen.has(path), `${path} is gone: drop it from ALLOWED`);
  });

  it('leaves the page only in the places listed, as many times as listed', () => {
    const found = {};
    for (const f of files) {
      const n = exits(readFileSync(f, 'utf8'));
      if (n > 0) found[relative(ROOT, f)] = n;
    }
    const expected = Object.fromEntries(Object.entries(ALLOWED).map(([p, a]) => [p, a.count]));
    // A file here that is not in ALLOWED opens something outside the app. A photo
    // belongs in ImageLightbox, a file in downloadFile — see the top of this file.
    assert.deepEqual(found, expected);
  });

  it('counts the patterns it is meant to catch', () => {
    assert.equal(exits('<a href={photo.url} target="_blank" rel="noopener">x</a>'), 2);
    assert.equal(exits("window.open(file.url, '_blank', 'noopener');"), 1);
    assert.equal(exits("a.target = '_blank';"), 1);
    assert.equal(exits('window.location.assign(url);'), 1);
    assert.equal(exits('<a href={`tel:${n}`}>call</a>'), 0);
    assert.equal(exits('// <a href={photo.url} target="_blank">\n/* window.open(x) */'), 0);
  });
});
