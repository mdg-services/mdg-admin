/**
 * The WhatsApp inbox's decisions, kept out of the components so they read as
 * plain rules. This app has no test runner, so the less logic a `.tsx` carries,
 * the less of it can go wrong unseen. Nothing here touches React, the DOM or
 * the network.
 *
 * Every date is shown in India time. The office works in it, a lead's "14:02"
 * means 14:02 in India, and a laptop set to another zone must not move it. India
 * has no daylight saving, so the zone is a fixed +05:30 and the arithmetic is
 * done by hand rather than through `Intl`, which keeps it identical in every
 * browser and in the native shell's WebView.
 */
import type { Intent } from '@/lib/statusIntent';
import {
  isWhatsAppLine,
  renderLinkTemplate,
  renderSimpleTemplate,
  templateRepeats,
  toLinkTarget,
  toTemplateParam,
  withoutTemplateRepeats,
  WHATSAPP_CHAT_FILTERS,
  WHATSAPP_DEFAULT_LINE,
  WHATSAPP_LINE_INFO,
  WHATSAPP_LINES,
  WHATSAPP_LINK_MESSAGE_MAX_LENGTH,
  WHATSAPP_LINK_TEMPLATE,
  WHATSAPP_SIMPLE_TEMPLATE,
  WHATSAPP_STAGES,
  type WhatsAppChatFilter,
  type WhatsAppChatLast,
  type WhatsAppChatList,
  type WhatsAppChatMessage,
  type WhatsAppChatOnLine,
  type WhatsAppChatSummary,
  type WhatsAppDelivery,
  type WhatsAppInboxConfig,
  type WhatsAppInboxSummary,
  type WhatsAppLine,
  type WhatsAppMessagePage,
  type WhatsAppQuickReply,
  type WhatsAppReplyRoute,
  type WhatsAppStage,
} from '@dk/shared';

// ─────────────────────────────────────────────────────────────────────────
// Dates and times, in India time
// ─────────────────────────────────────────────────────────────────────────

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface IstParts {
  year: number;
  /** 0 = January. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday. */
  weekday: number;
  /** Whole India days since 1 Jan 1970, so two instants on one calendar day share it. */
  dayIndex: number;
}

function istParts(ms: number): IstParts {
  const shifted = ms + IST_OFFSET_MS;
  const d = new Date(shifted);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
    dayIndex: Math.floor(shifted / DAY_MS),
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "14:02" in India time; empty for a date that does not parse. */
export function clockTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const p = istParts(ms);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/**
 * The time on the right of a chat row, the way WhatsApp words it: today the
 * clock, yesterday "Yesterday", the last six days the weekday, anything older
 * the date as 12/10/26.
 */
export function listTime(iso: string, now: number): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const t = istParts(ms);
  const diff = istParts(now).dayIndex - t.dayIndex;
  // A negative gap is a clock a little ahead of ours: still "today".
  if (diff <= 0) return `${pad2(t.hour)}:${pad2(t.minute)}`;
  if (diff === 1) return 'Yesterday';
  if (diff <= 6) return WEEKDAYS[t.weekday] ?? '';
  return `${pad2(t.day)}/${pad2(t.month + 1)}/${pad2(t.year % 100)}`;
}

/** The pill between days in a thread: "Today", "Yesterday", a weekday, or "12 October 2026". */
export function dayLabel(iso: string, now: number): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const t = istParts(ms);
  const diff = istParts(now).dayIndex - t.dayIndex;
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff <= 6) return WEEKDAYS[t.weekday] ?? '';
  return `${t.day} ${MONTHS[t.month] ?? ''} ${t.year}`;
}

/** "12 October 2026, 14:02" — for the details panel. */
export function fullDateTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const t = istParts(ms);
  return `${t.day} ${MONTHS[t.month] ?? ''} ${t.year}, ${pad2(t.hour)}:${pad2(t.minute)}`;
}

/** Same India calendar day: a key for grouping a thread into days. */
export function dayKey(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? String(istParts(ms).dayIndex) : 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────
// Who a chat is
// ─────────────────────────────────────────────────────────────────────────

/** "+91 98000 00001" from 919800000001; anything else is shown as it came. */
export function phoneLabel(phone: string | null): string {
  if (!phone) return 'Number not shared';
  const m = /^91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : `+${phone}`;
}

/** What the phone's dialler opens. */
export function dialHref(phone: string): string {
  return `tel:+${phone}`;
}

export function hasName(chat: Pick<WhatsAppChatSummary, 'name'>): boolean {
  return Boolean(chat.name && chat.name.trim());
}

/** The name on the row, else the number as WhatsApp would show it. */
export function chatTitle(chat: Pick<WhatsAppChatSummary, 'name' | 'phone'>): string {
  return chat.name?.trim() || phoneLabel(chat.phone);
}

/**
 * The label the server gives a name a person at MDG saved in the inbox, in
 * `knownAs` (mdg-backend `whatsapp/inbox/names.ts`, `SOURCE_LABEL.saved`). It is
 * the only way to tell that name from the one shown as the chat's title, which
 * is whichever of the saved name, a campaign list, a registration or the
 * WhatsApp profile comes first.
 */
export const SAVED_NAME_SOURCE = 'Saved in the inbox';

/** The name saved in the inbox for this chat; null when nobody saved one, whatever the title shows. */
export function savedNameOf(
  detail: { knownAs: ReadonlyArray<{ name: string; source: string }> } | undefined,
): string | null {
  return detail?.knownAs.find((k) => k.source === SAVED_NAME_SOURCE)?.name ?? null;
}

/**
 * One or two capital letters from a name, or null when the name does not start
 * with a letter (a bare number, a plus sign) — those get the neutral person
 * glyph, as WhatsApp gives a contact it has no name for.
 */
export function initialsOf(name: string | null): string | null {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const first = words[0] ? Array.from(words[0])[0] : undefined;
  if (!first || !/\p{L}/u.test(first)) return null;
  const second = words[1] ? Array.from(words[1])[0] : undefined;
  const letters = second && /\p{L}/u.test(second) ? first + second : first;
  return letters.toLocaleUpperCase('en-IN');
}

/**
 * Deep enough that white lettering stays readable (all measure above 4.5:1),
 * and varied enough that two neighbours in the list rarely match.
 */
const AVATAR_COLOURS = [
  '#c2410c',
  '#b45309',
  '#4d7c0f',
  '#047857',
  '#0f766e',
  '#0e7490',
  '#1d4ed8',
  '#6d28d9',
  '#a21caf',
  '#be185d',
  '#b91c1c',
  '#475569',
];

/** The same person always gets the same colour: it is derived from who they are, never stored. */
export function avatarColour(person: string): string {
  let h = 5381;
  for (let i = 0; i < person.length; i++) {
    h = ((h << 5) + h + person.charCodeAt(i)) | 0;
  }
  return AVATAR_COLOURS[Math.abs(h) % AVATAR_COLOURS.length] ?? '#475569';
}

// ─────────────────────────────────────────────────────────────────────────
// Which number you are in
// ─────────────────────────────────────────────────────────────────────────

/** Where the browser remembers the inbox the admin was last in. */
export const LINE_STORAGE_KEY = 'dk.whatsapp.line';

/** A `?line=` value, or null when it is missing or not one of our numbers. */
export function parseLine(raw: string | null | undefined): WhatsAppLine | null {
  return isWhatsAppLine(raw) ? raw : null;
}

/** What the browser remembered, read as it was stored; the default inbox when it is empty or garbage. */
export function rememberedLineOf(raw: string | null | undefined): WhatsAppLine {
  return parseLine(raw) ?? WHATSAPP_DEFAULT_LINE;
}

/**
 * Which inbox a link that names only a person should open: the one where they
 * have the most unread, else the one they wrote to or were written to most
 * recently, else `fallback` (the remembered inbox) when they have no chat at
 * all. A tie on unread goes to the newer chat.
 */
export function pickLine(
  chats: readonly Pick<WhatsAppChatOnLine, 'line' | 'unread' | 'lastAt'>[],
  fallback: WhatsAppLine,
): WhatsAppLine {
  let best: Pick<WhatsAppChatOnLine, 'line' | 'unread' | 'lastAt'> | null = null;
  let bestAt = 0;
  for (const c of chats) {
    if (!isWhatsAppLine(c.line)) continue;
    const at = Date.parse(c.lastAt);
    const ms = Number.isFinite(at) ? at : 0;
    if (best === null || c.unread > best.unread || (c.unread === best.unread && ms > bestAt)) {
      best = c;
      bestAt = ms;
    }
  }
  return best?.line ?? fallback;
}

/** The other inbox. There are two. */
export function otherLine(line: WhatsAppLine): WhatsAppLine {
  return WHATSAPP_LINES.find((l) => l !== line) ?? line;
}

/** The name WhatsApp shows people for this number: "Dealer's Kavach". */
export function lineName(line: WhatsAppLine): string {
  return WHATSAPP_LINE_INFO[line].name;
}

/** "MDG Services (Marketing)" — the name and the job, for a sentence. */
export function lineNameAndJob(line: WhatsAppLine): string {
  const info = WHATSAPP_LINE_INFO[line];
  return `${info.name} (${info.purpose})`;
}

/** The strip above the box: "From Dealer's Kavach · +91 94702 93427". */
export function fromStripText(line: WhatsAppLine): string {
  const info = WHATSAPP_LINE_INFO[line];
  return `From ${info.name} · ${info.phone}`;
}

export const composerPlaceholder = (line: WhatsAppLine): string => `Message from ${lineName(line)}`;
export const sendButtonLabel = (line: WhatsAppLine): string => `Send from ${lineName(line)}`;
export const newChatTitle = (line: WhatsAppLine): string => `New chat from ${lineName(line)}`;
/** Said once in the contact panel: what is about the person is not per number. */
export const SHARED_BY_BOTH_WORDS = 'Name, stage and note are shared by both numbers.';
export const NEW_CHAT_WRONG_NUMBER = 'Wrong number? Close this and switch at the top of the list.';

/** The browser tab's title while an inbox is open, so a tab at the back still says which number it is. */
export function inboxTitle(line: WhatsAppLine): string {
  return `WhatsApp · ${lineName(line)}`;
}

/** What the right-hand pane says while no chat is open. */
export function emptyPaneWords(line: WhatsAppLine): { title: string; use: string } {
  const info = WHATSAPP_LINE_INFO[line];
  return { title: `Chats on ${info.name} · ${info.phone}`, use: info.use };
}

/** The unread chats an inbox has, from the summary; zero until it has loaded (or from an older server). */
export function unreadOnLine(summary: Pick<WhatsAppInboxSummary, 'lines'> | undefined, line: WhatsAppLine): number {
  return summary?.lines?.[line]?.unreadChats ?? 0;
}

/** What a screen reader hears for one segment of the inbox switch. */
export function lineSwitchLabel(line: WhatsAppLine, unread: number): string {
  const info = WHATSAPP_LINE_INFO[line];
  const base = `${info.name}, ${info.purpose}`;
  if (unread <= 0) return base;
  return `${base}, ${unread} ${unread === 1 ? 'chat' : 'chats'} unread`;
}

/**
 * The note that this person also has a chat on the other number, or null when
 * they have none there. `elsewhere` is already only the other inboxes; the
 * guard on `line` keeps a same-inbox row from ever being offered as "the other".
 */
export function elsewhereNotice(
  elsewhere: readonly WhatsAppChatOnLine[] | undefined,
  line: WhatsAppLine,
): { line: WhatsAppLine; words: string; unreadWords: string | null } | null {
  const other = (elsewhere ?? []).find((c) => c.line !== line && isWhatsAppLine(c.line));
  if (!other) return null;
  const extra = [
    ...(other.unread > 0 ? [`${other.unread} unread`] : []),
    // The other number's window is open: an ordinary message can go from there, not from here.
    ...(other.windowOpen === true ? ['you can reply normally there'] : []),
  ];
  return {
    line: other.line,
    words: `They also have a chat on ${lineNameAndJob(other.line)}`,
    unreadWords: extra.length > 0 ? extra.join(' · ') : null,
  };
}

/**
 * May a message go from this inbox? Only when the server has said it sends from
 * it (`config.lines`) and the chat it described is this inbox's on every count.
 * A server from before the two inboxes says neither — and would pick the number
 * itself — so against one the box stays closed rather than promise a number.
 */
export function serverSendsFrom(config: Pick<WhatsAppInboxConfig, 'lines'> | undefined, line: WhatsAppLine): boolean {
  return Array.isArray(config?.lines) && config.lines.includes(line);
}

export function detailIsOnLine(
  detail: { line?: unknown; chat?: { line?: unknown } | null; reply?: { line?: unknown } | null } | undefined,
  line: WhatsAppLine,
): boolean {
  return !!detail && detail.line === line && detail.chat?.line === line && detail.reply?.line === line;
}

/** Said wherever the box is closed because the server is older than this page. */
export const OUT_OF_DATE_WORDS = 'This page and the server do not match yet, so sending is off. Reload the page in a minute.';

/** The key a draft or a waiting message is kept under: one per inbox AND person, never one for the person alone. */
export function chatKeyOf(line: WhatsAppLine, person: string): string {
  return `${line}:${person}`;
}

/** Where a toast or a desktop notification takes the admin. No `line=` for a number that is not one of ours: the page works it out. */
export function incomingHref(person: string, line: WhatsAppLine | null): string {
  const chat = `chat=${encodeURIComponent(person)}`;
  return line ? `/whatsapp?line=${line}&${chat}` : `/whatsapp?${chat}`;
}

/**
 * Is the admin looking at the very chat the message was written in? Only then is
 * the message already on screen and being read, so no toast and no sound. The
 * same person's chat on the OTHER number does not count, and neither does a
 * message from a number that is not one of ours (`eventLine` null).
 */
export function chatIsOpenOnLine(o: {
  visible: boolean;
  openPerson: string | null;
  openLine: WhatsAppLine | null;
  eventPerson: string;
  eventLine: WhatsAppLine | null;
}): boolean {
  return o.visible && o.eventLine !== null && o.openLine === o.eventLine && o.openPerson === o.eventPerson;
}

/**
 * Should a toast go up? Everywhere but the inbox, yes. On the inbox the list on
 * screen moves by itself, but only the list of the number the admin is in: a
 * message to the other number gets a toast, because nothing on screen shows it
 * but a badge on the switch.
 */
export function wantsIncomingToast(o: { onInbox: boolean; viewedLine: WhatsAppLine | null; eventLine: WhatsAppLine | null }): boolean {
  if (!o.onInbox) return true;
  return o.eventLine === null || o.viewedLine === null || o.eventLine !== o.viewedLine;
}

// ─────────────────────────────────────────────────────────────────────────
// The list: filters, stages, and its rows
// ─────────────────────────────────────────────────────────────────────────

/** The `stage` value that means "nobody has set one". */
export const NO_STAGE = 'none';
export type StageFilter = WhatsAppStage | typeof NO_STAGE;

export function parseFilter(raw: string | null): WhatsAppChatFilter {
  return (WHATSAPP_CHAT_FILTERS as readonly string[]).includes(raw ?? '')
    ? (raw as WhatsAppChatFilter)
    : 'all';
}

export function parseStage(raw: string | null): StageFilter | null {
  if (raw === NO_STAGE) return NO_STAGE;
  return (WHATSAPP_STAGES as readonly string[]).includes(raw ?? '') ? (raw as WhatsAppStage) : null;
}

export function parseSearch(raw: string | null): string {
  return (raw ?? '').slice(0, 100);
}

/** How a stage is tinted, using the app's own intents. */
export function stageIntent(stage: WhatsAppStage): Intent {
  switch (stage) {
    case 'new':
      return 'info';
    case 'talking':
      return 'warning';
    case 'interested':
      return 'success';
    case 'converted':
      return 'success';
    default:
      return 'neutral';
  }
}

/**
 * Pages are fetched one after another while the list underneath keeps moving:
 * a chat that gets a message rises, so it can sit at the end of page 1 in one
 * read and the start of page 2 in the next. Keep the first sighting.
 */
export function flattenChats(pages: readonly WhatsAppChatList[] | undefined): WhatsAppChatSummary[] {
  const seen = new Set<string>();
  const out: WhatsAppChatSummary[] = [];
  for (const page of pages ?? []) {
    for (const chat of page.items) {
      if (seen.has(chat.person)) continue;
      seen.add(chat.person);
      out.push(chat);
    }
  }
  return out;
}

export function hasUnread(chat: Pick<WhatsAppChatSummary, 'unread' | 'markedUnread'>): boolean {
  return chat.unread > 0 || chat.markedUnread;
}

const SYSTEM_PREVIEW = /^(Sent an? |Asked us to stop|Reacted |Shared )/;

/** Media and notices read in italics, as in WhatsApp; the words themselves do not. */
export function isSystemPreview(last: WhatsAppChatLast): boolean {
  if (last.kind && !['text', 'template', 'button', 'interactive'].includes(last.kind)) return true;
  return SYSTEM_PREVIEW.test(last.preview);
}

/** What the empty list says, per list. `narrowed` is a stage or a search on top of the list. */
export function emptyListWords(
  filter: WhatsAppChatFilter,
  narrowed: boolean,
  line: WhatsAppLine = WHATSAPP_DEFAULT_LINE,
): { title: string; description: string } {
  if (narrowed) {
    return {
      title: 'No chats match',
      description: 'Nothing fits that search or stage. Clear them to see the whole list.',
    };
  }
  switch (filter) {
    case 'replied':
      return {
        title: 'Nobody has written back yet',
        description: 'Chats where they have answered us, or written to us first, appear here.',
      };
    case 'unread':
      return { title: 'Nothing unread', description: 'You have read everything. A new message will appear here.' };
    case 'needs_reply':
      return { title: 'Nobody is waiting on you', description: 'Every chat that wrote to us has had an answer.' };
    case 'waiting':
      return {
        title: 'Nobody is waiting on a reply',
        description: 'Chats where we wrote last and they have not answered yet appear here.',
      };
    case 'stopped':
      return { title: 'Nobody is on the stop list', description: 'People who ask us to stop promotions appear here.' };
    default:
      return {
        title: 'No chats yet',
        description: `Everyone we message from ${lineName(line)}, and everyone who writes to it, gets a chat here.`,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Reply window and the way a message will go
// ─────────────────────────────────────────────────────────────────────────

/** Milliseconds left in the 24-hour window; 0 when it is closed or was never open. */
export function windowLeftMs(closesAt: string | null, now: number): number {
  if (!closesAt) return 0;
  const ms = Date.parse(closesAt);
  return Number.isFinite(ms) ? Math.max(0, ms - now) : 0;
}

/** "18 h left", "45 min left". Hours are rounded down: the margin is for the person typing. */
export function windowLeftLabel(ms: number): string {
  const mins = Math.ceil(ms / 60_000);
  if (mins >= 60) return `${Math.floor(mins / 60)} h left`;
  if (mins >= 2) return `${mins} min left`;
  return 'under a minute left';
}

export type StatusTone = 'open' | 'closed' | 'stopped';

/** Has the window this chat was opened with closed since the server last said so? */
export function windowJustClosed(closesAt: string | null, now: number): boolean {
  if (!closesAt) return false;
  const ms = Date.parse(closesAt);
  return Number.isFinite(ms) && ms <= now;
}

/**
 * How the next message goes, as the server said — except that a window which
 * has run out since the server answered goes as the template. The server's
 * `windowClosesAt` is only ever set while the window was open, so a closing time
 * that has now passed is proof the window has closed, and the words on screen
 * must not keep promising a free reply for the minute until the chat is asked
 * again. (The server still decides at the moment of sending.)
 */
export function effectiveMode(
  chat: Pick<WhatsAppChatSummary, 'windowClosesAt'>,
  route: Pick<WhatsAppReplyRoute, 'mode'>,
  now: number,
): 'text' | 'template' {
  if (route.mode !== 'text') return route.mode;
  return windowJustClosed(chat.windowClosesAt, now) ? 'template' : 'text';
}

/** Milliseconds until the window closes, for a timer; null when there is no open window to wait for. */
export function msUntilWindowCloses(closesAt: string | null, now: number): number | null {
  if (!closesAt) return null;
  const ms = Date.parse(closesAt);
  return Number.isFinite(ms) ? Math.max(0, ms - now) : null;
}

/**
 * The words under the name in a chat's header. Null until the server has said
 * how a message would go: guessing "can reply freely" from the list row would
 * be wrong whenever the server is set to use the template for everything.
 */
export function headerStatus(
  chat: Pick<WhatsAppChatSummary, 'windowClosesAt' | 'optedOut'>,
  route: Pick<WhatsAppReplyRoute, 'mode' | 'blocked'> | null,
  now: number,
): { text: string; tone: StatusTone } | null {
  if (!route) return null;
  if (route.blocked) {
    return chat.optedOut
      ? { text: 'On the stop list', tone: 'stopped' }
      : { text: route.blocked, tone: 'closed' };
  }
  const left = windowLeftMs(chat.windowClosesAt, now);
  if (effectiveMode(chat, route, now) === 'text') {
    return {
      text: left > 0 ? `Can reply freely · ${windowLeftLabel(left)}` : 'Can reply freely',
      tone: 'open',
    };
  }
  return {
    text: left > 0 ? 'Replies go in the template' : 'Window closed · replies go in the template',
    tone: 'closed',
  };
}

/** The slim line above the box: which way the next message will go, and why. */
export function composerRouteLine(
  chat: Pick<WhatsAppChatSummary, 'windowClosesAt'>,
  route: Pick<WhatsAppReplyRoute, 'mode'>,
  now: number,
): string {
  const left = windowLeftMs(chat.windowClosesAt, now);
  const mode = effectiveMode(chat, route, now);
  if (mode === 'text') {
    return left > 0
      ? `Ordinary message · free reply window open, ${windowLeftLabel(left)}`
      : 'Ordinary message · free reply window open';
  }
  // The server said "ordinary", but its window has run out since: say so now,
  // rather than leave the old promise up until the chat is asked again.
  if (route.mode === 'text') return 'Window just closed · this goes in the greeting template';
  return left > 0
    ? 'Goes in the greeting template — this number always uses it'
    : 'Goes in the greeting template — window closed';
}

/**
 * The same slim line when a link has been added. In an open window the link
 * goes as an ordinary message with its button, lines kept; otherwise in its
 * own template.
 */
export function linkRouteLine(mode: 'text' | 'template'): string {
  return mode === 'text'
    ? 'With a link · ordinary message with an Open link button, line breaks kept, and we count each tap'
    : 'With a link · goes in the greeting template with a button, and we count each tap';
}

/**
 * What the link box holds, read the way the server will read it: nothing
 * typed (no link), an address (where the button will go), or something that
 * is not one (say so, and do not send).
 */
export type LinkInput = { state: 'none' } | { state: 'ok'; target: string } | { state: 'bad' };

export function readLink(typed: string): LinkInput {
  if (!typed.trim()) return { state: 'none' };
  const target = toLinkTarget(typed);
  return target ? { state: 'ok', target } : { state: 'bad' };
}

/** "mdgservices.in/film" — an address short enough for a line under a button. */
export function linkLabel(target: string): string {
  try {
    const url = new URL(target);
    const rest = `${url.pathname === '/' ? '' : url.pathname}${url.search}`;
    const host = url.hostname.replace(/^www\./, '');
    return rest.length > 40 ? `${host}${rest.slice(0, 39)}…` : `${host}${rest}`;
  } catch {
    return target;
  }
}

export interface SendPlan {
  /** How much of the limit the typed words take. */
  used: number;
  limit: number;
  tooLong: boolean;
  /** Worth drawing: near the limit, so nobody is surprised by a refusal. */
  showCounter: boolean;
  /**
   * Template only: the typed words had line breaks, which the template turns
   * into one paragraph. Meta refuses a line break in a template's words; an
   * ordinary message (with a link or without) keeps them.
   */
  joinsLines: boolean;
  /** Template only: exactly what the person will receive. */
  preview: string | null;
}

/**
 * What one typed message will cost against its limit, and — for the template —
 * what it will look like. Text is measured as typed; the template is measured
 * after its lines are joined, because that is what Meta counts.
 */
export function planSend(
  text: string,
  mode: 'text' | 'template',
  config: Pick<WhatsAppInboxConfig, 'textMaxLength' | 'template'>,
  /**
   * It goes with a link: as an ordinary message with a link button, whose words
   * Meta caps lower, or in the link template, measured as the simple one.
   */
  linked = false,
): SendPlan {
  const typed = text.trim();
  if (mode === 'text') {
    const used = typed.length;
    const limit = linked ? WHATSAPP_LINK_MESSAGE_MAX_LENGTH : config.textMaxLength;
    return {
      used,
      limit,
      tooLong: used > limit,
      showCounter: used >= limit * 0.8,
      joinsLines: false,
      preview: null,
    };
  }
  const used = toTemplateParam(typed).length;
  const limit = linked ? WHATSAPP_LINK_TEMPLATE.maxLength : config.template.maxLength;
  return {
    used,
    limit,
    tooLong: used > limit,
    showCounter: used >= limit * 0.8,
    joinsLines: typed.includes('\n'),
    preview: typed ? (linked ? renderLinkTemplate(typed) : renderSimpleTemplate(typed)) : null,
  };
}

/**
 * The warning over the box when words that go in the template open with a
 * greeting or close with a sign-off of their own. The template already has
 * both, so the person would get two: on 29 Oct 2026 a lead got "Namaste,"
 * twice and "Thank you, Team MDG Services" twice. Null for an ordinary
 * message, and for words without either.
 */
export interface RepeatWarning {
  text: string;
  /** The words of the button that takes them out. */
  removeLabel: string;
  /** The words without them; null when nothing would be left ("Namaste ji 🙏"). */
  fixed: string | null;
}

/** A greeting or sign-off as the warning quotes it: no trailing comma, and short. */
function quoteTyped(words: string): string {
  const bare = words.replace(/[\s,.!?।:;~&\-–—]+$/u, '');
  return bare.length > 40 ? `${bare.slice(0, 39)}…` : bare;
}

export function repeatWarning(text: string, mode: 'text' | 'template'): RepeatWarning | null {
  const typed = text.trim();
  if (mode !== 'template' || !typed) return null;
  const { greeting, closing } = templateRepeats(typed);
  if (!greeting && !closing) return null;
  // Both templates share these words; the simple one's are the ones to quote.
  const theirs = {
    greeting: `“${WHATSAPP_SIMPLE_TEMPLATE.greeting}”`,
    closing: `“${WHATSAPP_SIMPLE_TEMPLATE.closing.replace(/\s*\n\s*/g, ' ')}”`,
  };
  const fixed = withoutTemplateRepeats(typed) || null;
  if (greeting && closing) {
    return {
      text: `Your message starts with “${quoteTyped(greeting)}” and ends with “${quoteTyped(closing)}”. The template already adds ${theirs.greeting} and ${theirs.closing}, so they would get both twice.`,
      removeLabel: 'Remove both',
      fixed,
    };
  }
  if (greeting) {
    return {
      text: `Your message starts with “${quoteTyped(greeting)}”. The template already starts with ${theirs.greeting}, so they would be greeted twice.`,
      removeLabel: `Remove “${quoteTyped(greeting)}”`,
      fixed,
    };
  }
  return {
    text: `Your message ends with “${quoteTyped(closing!)}”. The template already ends with ${theirs.closing}, so they would get two sign-offs.`,
    removeLabel: 'Remove the sign-off',
    fixed,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Ticks, failures and what a send says when it goes wrong
// ─────────────────────────────────────────────────────────────────────────

export type TickKind = 'clock' | 'sent' | 'delivered' | 'read' | 'failed' | 'unknown';

/** Which tick an outbound message wears. A row that predates delivery reports reads as sent. */
export function tickFor(delivery: WhatsAppDelivery | null): TickKind {
  switch (delivery) {
    case 'accepted':
      return 'clock';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
      return 'failed';
    case 'unknown':
      return 'unknown';
    default:
      return 'sent';
  }
}

export const TICK_LABELS: Record<TickKind, string> = {
  clock: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Not delivered',
  unknown: 'Not sure this went',
};

/** The line under a bubble whose send gave no clear answer. */
export const UNKNOWN_OUTCOME_NOTE = 'Not sure this went — check in a minute before sending again';

interface ErrorLike {
  status?: unknown;
  code?: unknown;
  message?: unknown;
}

const ERROR_WORDS: Record<string, string> = {
  WHATSAPP_NOT_CONFIGURED: 'Sending is switched off on the server. Messages can be read here but not sent.',
  WHATSAPP_OPTED_OUT: 'They asked us to stop promotions, so a template message cannot go to them.',
  WHATSAPP_NO_NUMBER: 'WhatsApp never told us this person’s number, so nothing can be sent.',
  WHATSAPP_INVALID_NUMBER: 'That is not an Indian mobile number.',
  WHATSAPP_TOO_LONG: 'That message is too long.',
  WHATSAPP_DUPLICATE: 'This message was already sent, or is still being sent.',
  WHATSAPP_REFUSED: 'WhatsApp refused this message.',
  WHATSAPP_SHORTCUT_TAKEN: 'Another quick reply already uses that shortcut.',
};

/**
 * The page and the server disagree about which number a message belongs to: a
 * tab opened before the two inboxes existed, or a message that was sent from
 * the other one. Whatever sentence the server gave, the cure is the same.
 */
export const LINE_OUT_OF_DATE_WORDS = 'This page is out of date. Reload it.';
const LINE_ERROR_CODES = new Set(['WHATSAPP_LINE_REQUIRED', 'WHATSAPP_LINE_MISMATCH']);

export interface SendFailure {
  /** `unknown`: may or may not have gone, never retried for the person. */
  kind: 'failed' | 'unknown';
  code: string | null;
  /** The plain words to show. The server's own sentence wins; these are the fallback. */
  text: string;
  /**
   * Nothing definite came back — no answer, a gateway's error page, or a
   * server that may have acted before it fell over. The message may have left,
   * so a second try must reuse the same id: the server sends an id once and
   * replays its answer to a repeat. `false` means the server gave a final
   * answer and the id is spent, so the next try needs a new one.
   */
  networkLost: boolean;
}

/** Why a composer id cannot be sent again — what became of its first send. */
export type DuplicateKind = 'busy' | 'sent' | 'unknown' | 'failed' | 'elsewhere';

/**
 * The server gives all five "this id was used" refusals one code
 * (`WHATSAPP_DUPLICATE`, 409) and tells them apart only by their words, so they
 * are told apart here by a phrase from each. The phrases are the ones in
 * mdg-backend `whatsapp/inbox/errors.ts`; if the server's words ever change,
 * the answer falls to `unknown`, the cautious one: never a fresh id, never a
 * blind resend.
 */
export function duplicateKindOf(code: string | null, message: string): DuplicateKind | null {
  if (code !== 'WHATSAPP_DUPLICATE') return null;
  const m = message.toLowerCase();
  if (m.includes('already being sent')) return 'busy';
  if (m.includes('went, but its record')) return 'sent';
  if (m.includes('may or may not have gone')) return 'unknown';
  if (m.includes('did not go through')) return 'failed';
  if (m.includes('different chat')) return 'elsewhere';
  return 'unknown';
}

/**
 * Final answers the server gives with a 5xx status. Nothing was sent for any of
 * them, so the id is spent. Every other 5xx — a gateway's error page, a crash —
 * is silence about whether the message left.
 */
const FINAL_SERVER_REFUSALS = new Set(['WHATSAPP_REFUSED', 'WHATSAPP_NOT_CONFIGURED']);

/** Words for a request that failed on the way and may or may not have been acted on. */
const LOST_ANSWER_WORDS =
  'The server did not answer properly, so we cannot tell whether this went. Try again — it will not be sent twice.';

/**
 * Turn whatever a request threw into what the bubble says.
 *
 * The server writes its refusals in words an admin can read, so they are shown
 * as they came. Only a missing or generic message is replaced.
 *
 * What matters most is whether a second try may reuse the id (`networkLost`):
 * reusing it after a final refusal is refused again as "already used", and a
 * fresh id after a lost answer sends the message twice.
 */
export function describeSendError(err: unknown): SendFailure {
  const e: ErrorLike = typeof err === 'object' && err !== null ? (err as ErrorLike) : {};
  const code = typeof e.code === 'string' ? e.code : null;
  const status = typeof e.status === 'number' ? e.status : null;
  const message = typeof e.message === 'string' ? e.message.trim() : '';
  const generic = !message || message === 'Request failed';
  const fallback = (code && ERROR_WORDS[code]) || 'That did not go through.';
  const words = generic ? fallback : message;

  // Nothing was sent for either, and a second press cannot fix it: the id is spent.
  if (code && LINE_ERROR_CODES.has(code)) {
    return { kind: 'failed', code, text: LINE_OUT_OF_DATE_WORDS, networkLost: false };
  }
  if (code === 'WHATSAPP_UNKNOWN_OUTCOME') {
    return { kind: 'unknown', code, text: UNKNOWN_OUTCOME_NOTE, networkLost: true };
  }
  const duplicate = duplicateKindOf(code, message);
  // It may have gone, or did and its row is not in the chat yet: never a
  // retry, only a look at the chat.
  if (duplicate === 'sent' || duplicate === 'unknown') {
    return { kind: 'unknown', code, text: words, networkLost: true };
  }
  // Still being sent by an earlier press: the same id is how to ask again.
  if (duplicate === 'busy') return { kind: 'failed', code, text: words, networkLost: true };

  if (status === 0 || code === 'NETWORK_ERROR' || code === 'TIMEOUT') {
    return {
      kind: 'failed',
      code,
      text: 'Could not reach the server. Check the connection, then try again.',
      networkLost: true,
    };
  }
  const silent = status !== null && (status === 408 || status >= 500);
  if (silent && !(code && FINAL_SERVER_REFUSALS.has(code))) {
    return { kind: 'failed', code, text: LOST_ANSWER_WORDS, networkLost: true };
  }
  return { kind: 'failed', code, text: words, networkLost: false };
}

/** A line shown in a form, for an error from any request. */
export function errorWords(err: unknown): string {
  const f = describeSendError(err);
  // The send's own sentence promises "it will not be sent twice", which means
  // nothing to a rename or a stage.
  return f.text === LOST_ANSWER_WORDS ? 'The server did not answer properly. Try again in a moment.' : f.text;
}

// ─────────────────────────────────────────────────────────────────────────
// Messages: what is on screen, and in what groups
// ─────────────────────────────────────────────────────────────────────────

/** A message the admin typed that the server has not confirmed yet, or could not send. */
export interface PendingMessage {
  clientId: string;
  /** The inbox it was typed in, which is the number it leaves from. */
  line: WhatsAppLine;
  person: string;
  /** The words as typed. */
  text: string;
  /** How the server said it would go when this was sent. Decides what the bubble shows. */
  mode: 'text' | 'template';
  /**
   * The link it carries, as typed; null without one. With one it goes as an
   * ordinary message with a link button (`mode` text) or in the link template.
   */
  link: string | null;
  /** The admin was warned about the words' own greeting or sign-off and chose to send them as typed. */
  keepRepeats?: boolean;
  at: string;
  status: 'sending' | 'failed' | 'unknown';
  /** Plain reason, once it failed. */
  error: string | null;
  code: string | null;
  /** No answer came back, so a retry may safely reuse the same id: the server sends once. */
  networkLost: boolean;
  replyTo: { id: string; direction: 'in' | 'out' | null; text: string | null; kind: string | null } | null;
}

/** One line of a thread: the server's message, or the admin's own pending one. */
export interface ThreadEntry {
  /** Stable across a pending message becoming the server's, so the bubble does not remount. */
  key: string;
  message: WhatsAppChatMessage;
  pending: PendingMessage | null;
}

export function entryKey(m: WhatsAppChatMessage): string {
  return m.direction === 'out' && m.clientId ? m.clientId : m.id;
}

/** The server's pages are newest-first; the screen reads oldest-first. */
export function flattenMessages(pages: readonly WhatsAppMessagePage[] | undefined): WhatsAppChatMessage[] {
  const seen = new Set<string>();
  const out: WhatsAppChatMessage[] = [];
  for (let i = (pages?.length ?? 0) - 1; i >= 0; i--) {
    for (const m of pages?.[i]?.items ?? []) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}

/** A pending message drawn like a stored one, so the bubble has one shape to handle. */
export function pendingAsMessage(
  p: PendingMessage,
  me: { id: string; name: string } | null,
): WhatsAppChatMessage {
  const template = p.mode === 'template';
  const linked = p.link !== null;
  return {
    id: `pending:${p.clientId}`,
    direction: 'out',
    at: p.at,
    kind: template ? 'template' : linked ? 'interactive' : 'text',
    text: !template ? p.text : linked ? renderLinkTemplate(p.text) : renderSimpleTemplate(p.text),
    via: template ? 'template' : 'text',
    template: !template ? null : linked ? WHATSAPP_LINK_TEMPLATE.name : WHATSAPP_SIMPLE_TEMPLATE.name,
    buttons: linked
      ? [WHATSAPP_LINK_TEMPLATE.button]
      : template && WHATSAPP_SIMPLE_TEMPLATE.button
        ? [WHATSAPP_SIMPLE_TEMPLATE.button]
        : [],
    sentBy: me,
    delivery: p.status === 'sending' ? 'accepted' : p.status === 'failed' ? 'failed' : 'unknown',
    error: p.status === 'failed' ? { code: null, reason: p.error ?? 'That did not go through.' } : null,
    media: null,
    location: null,
    reaction: null,
    replyTo: p.replyTo,
    stop: false,
    stopRecorded: false,
    seenAt: null,
    phoneNumberId: WHATSAPP_LINE_INFO[p.line].numberId,
    clientId: p.clientId,
  };
}

/**
 * What the thread shows: everything the server holds, then whatever the admin
 * has sent that the server has not yet confirmed. A pending message whose id
 * already appears in what the server holds is dropped, so the moment a refetch
 * wins the race against the send's own reply nothing shows twice.
 */
export function mergeThread(
  server: readonly WhatsAppChatMessage[],
  pending: readonly PendingMessage[],
  me: { id: string; name: string } | null,
): ThreadEntry[] {
  const confirmed = new Set<string>();
  for (const m of server) if (m.clientId) confirmed.add(m.clientId);
  const out: ThreadEntry[] = server.map((m) => ({ key: entryKey(m), message: m, pending: null }));
  for (const p of pending) {
    if (confirmed.has(p.clientId)) continue;
    out.push({ key: p.clientId, message: pendingAsMessage(p, me), pending: p });
  }
  return out;
}

/** A message from them that nobody at MDG has read. A recorded stop and a reaction are not counted. */
export function isUnreadInbound(m: WhatsAppChatMessage): boolean {
  return m.direction === 'in' && m.seenAt === null && !(m.stop && m.stopRecorded);
}

export interface FrozenUnread {
  /** The first message nobody had read when the chat was opened; null when there was none. */
  firstId: string | null;
  count: number;
}

/**
 * Where "N unread messages" goes. Worked out once, when a chat is opened, and
 * kept for that visit: reading the messages marks them read, and a divider that
 * moved or vanished the moment they were seen would take the reader's place
 * with it.
 *
 * `unreadAtOpen` is the chat's own count. It can be larger than what is loaded
 * (only the newest page is), in which case the divider goes at the top of what
 * is loaded and says the full number.
 */
export function freezeUnread(
  messages: readonly WhatsAppChatMessage[],
  unreadAtOpen: number,
): FrozenUnread {
  let firstId: string | null = null;
  let counted = 0;
  for (const m of messages) {
    if (!isUnreadInbound(m)) continue;
    firstId ??= m.id;
    counted += 1;
  }
  if (firstId === null) {
    // The list says something is unread but nothing loaded is: the unread ones
    // are older than the page, so the divider goes above everything on screen.
    const top = messages[0];
    return top && unreadAtOpen > 0 ? { firstId: top.id, count: unreadAtOpen } : { firstId: null, count: 0 };
  }
  return { firstId, count: Math.max(counted, unreadAtOpen) };
}

/**
 * May the divider and the count be worked out from what a query holds?
 *
 * A chat opened again inside the cache window starts with whatever was cached,
 * and anything that arrived since is not in it. Placing the divider from that
 * copy would leave those messages with no divider, and the placing happens only
 * once. So wait for data fetched after this chat was opened — unless the cache
 * was still believed current when it opened (nothing to fetch), the fetch
 * failed (the held copy is all there will be), or it is paused offline (it
 * would wait for ever).
 */
export function openDataSettled(q: {
  currentAtOpen: boolean;
  fetchedAfterOpen: boolean;
  failed: boolean;
  paused: boolean;
}): boolean {
  return q.currentAtOpen || q.fetchedAfterOpen || q.failed || q.paused;
}

export interface ThreadMessageRow {
  type: 'message';
  key: string;
  entry: ThreadEntry;
  /** First bubble of a run from one side: it carries the tail and the sender's name. */
  startsRun: boolean;
  /** Last of the run: the gap to the next side is wider. */
  endsRun: boolean;
}

export interface ThreadNoticeRow {
  type: 'notice';
  key: string;
  entry: ThreadEntry;
}

export interface ThreadUnreadRow {
  type: 'unread';
  key: string;
  count: number;
}

export type ThreadRow = ThreadMessageRow | ThreadNoticeRow | ThreadUnreadRow;

export interface ThreadDay {
  key: string;
  label: string;
  rows: ThreadRow[];
}

/** A stop is drawn as a centred notice, not a bubble. */
export function isNotice(m: WhatsAppChatMessage): boolean {
  return m.direction === 'in' && m.stop;
}

function runKeyOf(m: WhatsAppChatMessage): string {
  return m.direction === 'out' ? `out:${m.sentBy?.id ?? ''}` : 'in';
}

/**
 * Group a thread into days, and each day into runs of bubbles from one side.
 *
 * A run breaks on a change of side, of sender (two admins answering in turn),
 * on a notice, on the unread divider and on a new day — each of which is
 * something the eye should be able to rest on.
 */
export function buildThread(
  entries: readonly ThreadEntry[],
  opts: { now: number; unread: FrozenUnread | null },
): ThreadDay[] {
  const days: ThreadDay[] = [];
  let day: ThreadDay | null = null;
  let prevRun: string | null = null;

  for (const entry of entries) {
    const m = entry.message;
    const key = dayKey(m.at);
    if (!day || day.key !== key) {
      day = { key, label: dayLabel(m.at, opts.now), rows: [] };
      days.push(day);
      prevRun = null;
    }
    if (opts.unread?.firstId && m.id === opts.unread.firstId) {
      day.rows.push({ type: 'unread', key: 'unread-divider', count: opts.unread.count });
      prevRun = null;
    }
    if (isNotice(m)) {
      day.rows.push({ type: 'notice', key: entry.key, entry });
      prevRun = null;
      continue;
    }
    const run = runKeyOf(m);
    day.rows.push({ type: 'message', key: entry.key, entry, startsRun: run !== prevRun, endsRun: true });
    prevRun = run;
  }

  for (const d of days) {
    for (let i = 0; i < d.rows.length - 1; i++) {
      const row = d.rows[i];
      const next = d.rows[i + 1];
      if (row?.type === 'message' && next?.type === 'message' && !next.startsRun) row.endsRun = false;
    }
  }
  return days;
}

// ─────────────────────────────────────────────────────────────────────────
// Reading what a message carries
// ─────────────────────────────────────────────────────────────────────────

export type MediaKind = 'image' | 'sticker' | 'audio' | 'video' | 'document' | 'location' | 'contacts' | 'other';

const PLAIN_KINDS = new Set(['text', 'template', 'button', 'interactive', 'reaction']);

/** What a message holds besides words: null for a plain one. */
export function mediaKindOf(m: WhatsAppChatMessage): MediaKind | null {
  switch (m.kind) {
    case 'image':
    case 'sticker':
    case 'audio':
    case 'video':
    case 'document':
    case 'contacts':
      return m.kind;
    case 'location':
      return m.location ? 'location' : 'other';
    default:
      return !m.kind || PLAIN_KINDS.has(m.kind) ? null : 'other';
  }
}

const KIND_WORDS: Record<string, string> = {
  image: 'a photo',
  sticker: 'a sticker',
  audio: 'a voice note',
  video: 'a video',
  document: 'a document',
  location: 'a location',
  contacts: 'a contact',
};

/** "Sent a photo (not shown here)" — for a kind this screen cannot draw. */
export function unshownWords(kind: string | null): string {
  const word = kind ? KIND_WORDS[kind] : undefined;
  return word ? `Sent ${word} (not shown here)` : 'Sent a message this inbox cannot show';
}

/** Shown in place of a file Meta no longer holds. */
export const MEDIA_GONE_WORDS = 'No longer available (WhatsApp keeps media for about 30 days)';

/** Said in the native app, where a file from WhatsApp cannot be opened: the app's browser view drops it. */
export const FILE_OPENS_ON_COMPUTER_WORDS =
  'This file opens from the admin in a computer’s browser. It cannot be opened inside the app.';

const QUOTE_KIND_WORDS: Record<string, string> = {
  image: 'Photo',
  sticker: 'Sticker',
  audio: 'Voice note',
  video: 'Video',
  document: 'Document',
  location: 'Location',
  contacts: 'Contact',
};

/** The line a quote carries: the words, or what kind of thing it was. */
export function quoteWords(q: { text: string | null; kind: string | null }): string {
  const text = q.text?.trim();
  if (text) return text;
  return (q.kind && QUOTE_KIND_WORDS[q.kind]) || 'Message';
}

/**
 * The note on a stop, or null for an ordinary message. The unrecorded case is
 * the one that needs a person: we could not tell whose number it is, so
 * nothing stops the next promotion reaching them.
 */
export function stopNote(m: Pick<WhatsAppChatMessage, 'stop' | 'stopRecorded'>): { text: string; urgent: boolean } | null {
  if (!m.stop) return null;
  return m.stopRecorded
    ? { text: 'Asked us to stop promotions. No promotion will go to this number again.', urgent: false }
    : {
        text: 'Asked us to stop, but WhatsApp did not share the number. Find them on the list and leave them off the next send.',
        urgent: true,
      };
}

/**
 * The words the admin typed behind a message we sent, so a failed one can be
 * sent again. A template message is stored as the whole greeting-and-closing
 * text; sending that back in would wrap the greeting a second time, so it is
 * taken apart first. Null when it cannot be taken apart cleanly — better no
 * retry button than a garbled message to a lead.
 */
export function typedTextOf(m: WhatsAppChatMessage): string | null {
  if (!m.text) return null;
  if (m.via !== 'template') return m.text;
  const head = `${WHATSAPP_SIMPLE_TEMPLATE.greeting}\n\n`;
  const tail = `\n\n${WHATSAPP_SIMPLE_TEMPLATE.closing}`;
  if (m.text.startsWith(head) && m.text.endsWith(tail) && m.text.length > head.length + tail.length) {
    return m.text.slice(head.length, m.text.length - tail.length);
  }
  return null;
}

/**
 * Its button opens a page: the link template's, or the one an ordinary
 * message with a link carries (`interactive`, the only kind of ours that is).
 */
export function opensLink(m: Pick<WhatsAppChatMessage, 'template' | 'kind'>): boolean {
  return m.template === WHATSAPP_LINK_TEMPLATE.name || m.kind === 'interactive';
}

/**
 * A failed message of ours the admin can send again: one that came from this
 * inbox. Not one that carried a link — the chat does not hold the address, and
 * sending the words again without it would be a different message.
 */
export function canRetry(m: WhatsAppChatMessage): boolean {
  return (
    m.direction === 'out' &&
    m.delivery === 'failed' &&
    m.clientId !== null &&
    !opensLink(m) &&
    typedTextOf(m) !== null
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Quick replies
// ─────────────────────────────────────────────────────────────────────────

export const SHORTCUT_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** What follows a leading "/", when the box holds nothing but a slash and a shortcut being typed. */
export function pickerQuery(text: string): string | null {
  const m = /^\/([^\s/]*)$/.exec(text);
  return m ? (m[1] ?? '') : null;
}

/** Exact shortcut first, then shortcuts that start with it, then ones that contain it, then the text. */
export function filterQuickReplies(
  list: readonly WhatsAppQuickReply[],
  query: string,
  max = 8,
): WhatsAppQuickReply[] {
  const q = query.trim().toLowerCase().replace(/^\//, '');
  if (!q) return list.slice(0, max);
  const scored: Array<{ reply: WhatsAppQuickReply; score: number }> = [];
  for (const reply of list) {
    const s = reply.shortcut.toLowerCase();
    let score = -1;
    if (s === q) score = 0;
    else if (s.startsWith(q)) score = 1;
    else if (s.includes(q)) score = 2;
    else if (reply.text.toLowerCase().includes(q)) score = 3;
    if (score >= 0) scored.push({ reply, score });
  }
  scored.sort((a, b) => a.score - b.score || a.reply.shortcut.localeCompare(b.reply.shortcut));
  return scored.slice(0, max).map((s) => s.reply);
}

// ─────────────────────────────────────────────────────────────────────────
// A number typed by a person
// ─────────────────────────────────────────────────────────────────────────

/**
 * An Indian mobile number in any shape a person types one ("98000 00001",
 * "+91-98000-00001", "09800000001"), as 91 plus ten digits — or null when it
 * cannot be one. This is only a courtesy check before the request: the server
 * is the authority, and says so in words if it disagrees.
 */
export function indianMobile(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `91${digits}` : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Small things the chrome needs
// ─────────────────────────────────────────────────────────────────────────

/**
 * A key that belongs to an input method (Hindi, Chinese, Japanese, an Android
 * keyboard's word suggestions), not to the box: the Enter that picks a
 * candidate must not send the message. `isComposing` is true for most of them,
 * but Safari ends the composition just BEFORE the Enter that commits it, so
 * that one is only recognised by its key code, 229.
 */
export function isImeKeystroke(isComposing: boolean, keyCode: number): boolean {
  return isComposing || keyCode === 229;
}

/** "99+" past two digits: the badge is a nudge, not a ledger. */
export function badgeCount(n: number): string {
  return n > 99 ? '99+' : String(n);
}

/** One line for the desktop notification and the toast: "Ramesh · to Dealer's Kavach". */
export function incomingHeadline(name: string | null, phone: string | null, line: WhatsAppLine | null = null): string {
  const who = name?.trim() || phoneLabel(phone);
  return line ? `${who} · to ${lineName(line)}` : who;
}

/** The first name of whoever at MDG sent a message: "Aryan" from "Aryan Sharma". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
