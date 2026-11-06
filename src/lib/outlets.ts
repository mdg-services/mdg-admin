/**
 * One person, several outlets (onboarding v2, phase 9): the words and the small
 * decisions the Approve dialog and the Members tab use, kept out of the components
 * so they read as plain rules. This app has no test runner, so everything here is
 * pure and `scripts/outlets.check.ts` runs it (`npm run check:outlets`).
 *
 * TYPES ONLY from `@dk/shared`, as `lib/onboarding.ts` does: the check script runs
 * this file outside Vite, where `@dk/shared` resolves to its compiled `dist/`.
 *
 * The two shapes below are LOCAL because the shared contract for this wave is
 * frozen (`types/outletSetup.ts`): `GET /admin/registrations/:id/link-option`
 * and the extra `linkToUserId` on Approve's body. They move into shared with the
 * next contract change.
 */
import type { DealerMemberRow, JoinOutletOption, LinkOwner, SetupMessageLang } from '@dk/shared';

export type { JoinOutletOption, LinkOwner, RegistrationLinkOption } from '@dk/shared';
/** A dealer member as the Members tab gets it: the person's other outlets ride along for an admin. */
export type MemberWithOutlets = DealerMemberRow;

/** "16E", "15E and 16E", "9E, 15E and 16E". */
export function joinCodes(codes: readonly string[]): string {
  if (codes.length <= 1) return codes[0] ?? '';
  return `${codes.slice(0, -1).join(', ')} and ${codes[codes.length - 1]}`;
}

/** "Also runs 16E" — the note under a member who is one person with another outlet. Null when there is none. */
export function alsoRunsLine(codes: readonly string[] | undefined): string | null {
  return codes && codes.length > 0 ? `Also runs ${joinCodes(codes)}` : null;
}

/** The label on the tick that adds the registration to an existing owner. */
export function linkChoiceLabel(owner: LinkOwner): string {
  return `Add as another outlet of ${owner.name} (${joinCodes(owner.codes)})`;
}

/** The line the Approve dialog shows under the tick, saying what it will and will not do. */
export const LINK_CHOICE_HINT =
  'The new outlet gets this owner’s login: the same password, no temporary one. The password typed on the registration is dropped. The owner signs in as before and switches between outlets in the app.';

/** What a person typed into the registration is not used, and nobody has to pass a password on. */
export function linkedResultLine(owner: Pick<LinkOwner, 'name' | 'codes'>, newCode: string): string {
  return `${newCode} is now another outlet of ${owner.name} (also ${joinCodes(owner.codes)}). They sign in as before, with the same password.`;
}

/** The label on the tick that gives the person a login on the outlet we already serve. */
export function joinChoiceLabel(join: JoinOutletOption): string {
  return `Give them an owner login on ${join.code}`;
}

/** The line under that tick: what it opens up, and the call to make first. */
export function joinChoiceHint(join: JoinOutletOption): string {
  const others =
    join.owners === 0
      ? 'Nobody signs in to it yet.'
      : `It has ${join.owners} owner login${join.owners === 1 ? '' : 's'} already; this adds one more.`;
  return `${join.code} stays exactly as it is: no new outlet, no new bill, nothing asked again. ${others} They sign in with this mobile and the password they chose, and see ${join.code}'s reports. Call the outlet first to check this is really their pump.`;
}

/** The result screen's line after a join. */
export function joinedResultLine(code: string): string {
  return `They now have an owner login on ${code}. Nothing else about ${code} changed.`;
}

/**
 * The Approve request body: the code the person saw, the owner to link to when
 * ticked, the existing outlet to join when that is ticked instead, and the
 * language of the WhatsApp welcome (one language, as chosen on screen). A join
 * sends no code: the outlet keeps its own.
 */
export function approveBody(input: {
  code?: string | undefined;
  linkToUserId?: string | undefined;
  joinDealerId?: string | undefined;
  messageLang?: SetupMessageLang | undefined;
}): {
  code?: string;
  linkToUserId?: string;
  joinDealerId?: string;
  messageLang?: SetupMessageLang;
} {
  if (input.joinDealerId) {
    return {
      joinDealerId: input.joinDealerId,
      ...(input.messageLang ? { messageLang: input.messageLang } : {}),
    };
  }
  return {
    ...(input.code ? { code: input.code } : {}),
    ...(input.linkToUserId ? { linkToUserId: input.linkToUserId } : {}),
    ...(input.messageLang ? { messageLang: input.messageLang } : {}),
  };
}

/**
 * Whether Approve may go ahead. A registration that is "already a client" is
 * refused unless it is being added to the owner the server named, or given a
 * login on the outlet it matched (which needs no code); any other registration
 * needs only a good code.
 */
export function canApprove(input: {
  alreadyClient: boolean;
  linking: boolean;
  joining?: boolean;
  codeValid: boolean;
  pending: boolean;
}): boolean {
  if (input.pending) return false;
  if (input.alreadyClient && input.joining) return true;
  return input.codeValid && (!input.alreadyClient || input.linking);
}
