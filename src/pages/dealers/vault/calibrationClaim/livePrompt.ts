import type { LiveCaptchaPrompt } from '@dk/shared';

/**
 * Words and choices for a picture code waiting on an admin, read by the app
 * shell on every screen (`components/layout/LiveCaptchaPrompts.tsx`). Its own
 * small module, importing nothing heavy, so the shell does not pull the claim
 * pane's code into every page.
 */

/**
 * Which waiting picture code pops up on this admin's screen, and which only show
 * as a banner. A code put to this admin, or to nobody in particular, pops up
 * unless they pressed "Later" on it; every other one is a banner, so a code whose
 * admin is away is still answered by whoever is in the app. One pop-up at a time,
 * the newest first; the rest wait in the banner.
 */
export function livePromptPlan(
  prompts: readonly LiveCaptchaPrompt[],
  meId: string | null,
  later: ReadonlySet<string>,
  nowMs: number,
): { popUp: LiveCaptchaPrompt | null; banners: LiveCaptchaPrompt[] } {
  const live = prompts.filter((p) => Date.parse(p.expiresAt) > nowMs);
  const popUp =
    live.find((p) => (!p.askedOf || p.askedOf.id === meId) && !later.has(p.sessionId)) ?? null;
  return { popUp, banners: live.filter((p) => p !== popUp) };
}

/** "2:41" left before the site stops waiting; "0:00" once it has. */
export function timeLeftWords(expiresAt: string, nowMs: number): string {
  const left = Math.max(0, Math.floor((Date.parse(expiresAt) - nowMs) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

/** The outlet's code or, with no code on record, "this outlet". */
function outletWords(p: Pick<LiveCaptchaPrompt, 'dealerCode'>): string {
  return p.dealerCode ?? 'this outlet';
}

/** The pop-up's title, subtitle and one-line reason. */
export function livePromptWords(
  p: LiveCaptchaPrompt,
  meId: string | null,
): { title: string; subtitle: string; why: string; whose: string } {
  const year = p.financialYear ? ` · FY ${p.financialYear}` : '';
  return {
    title: `Type the picture code for ${outletWords(p)}`,
    subtitle: `Calibration claim${year} · eMaaptaul sign-in`,
    why:
      'The robot is signing in to eMaaptaul (the Bihar weights and measures site) for this outlet and ' +
      'could not read the picture code. Type the letters and numbers you see, exactly as shown.',
    whose:
      p.askedOf && p.askedOf.id === meId
        ? 'It came to you because you were the last to act on this claim.'
        : p.askedOf
          ? `It was put to ${p.askedOf.name} first; anyone at MDG can type it.`
          : 'Anyone at MDG can type it.',
  };
}

/** The banner line for a code that is not popped up on this screen. */
export function liveBannerWords(p: LiveCaptchaPrompt, meId: string | null, nowMs: number): string {
  const year = p.financialYear ? `, FY ${p.financialYear}` : '';
  const whose = p.askedOf && p.askedOf.id !== meId ? ` Put to ${p.askedOf.name} first.` : '';
  return `${outletWords(p)} needs a picture code typed for its calibration claim${year}. ${timeLeftWords(p.expiresAt, nowMs)} left.${whose}`;
}

/** Where the claim's own pane is. */
export function claimPaneHref(dealerId: string): string {
  return `/dealers/${dealerId}?tab=data-vault&vault=calibration-claim`;
}
