import { SERVICE_LABELS } from '@dk/shared';

/**
 * Human names for the service plugins. The raw plugin slug is an internal
 * identifier — super-admins work with it directly, but a plain admin should see
 * the product name of the service, not the folder it lives in.
 *
 * The names themselves now live in `shared/src/lib/serviceLabel.ts`, because the
 * dealer app needs the very same seven names (in Hindi as well) and two copies
 * of a name is how one service ends up called two things in one conversation.
 * This module keeps only what is admin-specific: the English column, and the
 * fallback below.
 */

/**
 * Friendly name for a service plugin slug. Unknown slugs are humanised
 * (`some-new-plugin` -> `Some new plugin`) rather than shown verbatim.
 *
 * That humanising is deliberately NOT in shared: the dealer app degrades an
 * unknown id to the id itself, because a half-tidied slug on a dealer's screen
 * still reads as a slug and pretending otherwise helps nobody. Here it is worth
 * it — an operator recognises a plugin from its folder name.
 */
export function serviceLabel(serviceId: string): string {
  const known = SERVICE_LABELS[serviceId];
  if (known) return known.en;
  const words = serviceId.replace(/[-_]+/g, ' ').trim();
  if (words.length === 0) return serviceId;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
