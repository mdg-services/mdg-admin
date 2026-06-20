/**
 * Generate a strong, human-shareable random password. Avoids ambiguous
 * characters (0/O, 1/l/I) so it can be read out or copied without confusion.
 */
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function randInt(max: number): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! % max;
  }
  return Math.floor(Math.random() * max);
}

function pick(set: string): string {
  return set.charAt(randInt(set.length));
}

export function generatePassword(length = 14): string {
  // Guarantee at least one of each class for strength.
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: Math.max(length, 8) - required.length }, () =>
    pick(ALL),
  );
  const chars = [...required, ...rest];
  // Fisher-Yates shuffle so the required chars aren't always up front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
