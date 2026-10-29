import type { Message } from '@dk/shared';

/**
 * What the dealer's app shows, for the inbox thread that draws a conversation
 * the way the dealer sees it.
 *
 * The thread's words (bodies, captions) are the messages' own. The rest — the
 * buttons under a request, the login box, the setup cards, "Instant reply", the
 * day chips — is the app's own text, and the app shows it in the dealer's
 * language. These are the app's exact strings (`mdg-client/src/lib/i18n.ts`),
 * copied rather than shared because only the handful the thread draws are needed.
 */

export type DealerLang = 'hi' | 'en';

const WORDS = {
  today: { en: 'Today', hi: 'आज' },
  yesterday: { en: 'Yesterday', hi: 'कल' },
  senderMdg: { en: 'MDG', hi: 'MDG' },
  aiInstantReply: { en: 'Instant reply', hi: 'तुरंत जवाब' },
  cancel: { en: 'Cancel', hi: 'रद्द करें' },

  askSendPhoto: { en: 'Send photo', hi: 'फ़ोटो भेजें' },
  askChooseFile: { en: 'Choose file', hi: 'फ़ाइल चुनें' },
  askChooseGallery: { en: 'Choose from gallery', hi: 'गैलरी से चुनें' },
  askSent: { en: 'Sent — MDG is checking', hi: 'भेज दिया — MDG टीम देख रही है' },
  askReceived: { en: 'Received', hi: 'मिल गया' },
  askStateFailed: { en: "Couldn't check this just now", hi: 'अभी यह जाँच नहीं हो पाया' },
  transcript: { en: 'Transcript', hi: 'लिखा हुआ' },

  portalTitle: { en: '{portal} login', hi: '{portal} लॉगिन' },
  portalNeeded: { en: 'Needed', hi: 'बाकी' },
  portalNotNeeded: { en: 'Not needed', hi: 'ज़रूरत नहीं' },
  portalSaved: { en: 'Saved', hi: 'मिल गया' },
  portalRefused: { en: 'Old password not working', hi: 'पुराना पासवर्ड नहीं चल रहा' },
  portalSavedOn: { en: 'Saved · {date}', hi: 'मिल गया · {date}' },
  portalChange: { en: 'Change', hi: 'बदलें' },
  portalOwnerFills: { en: 'The owner fills this', hi: 'मालिक भरेंगे' },
  portalUserId: { en: 'User ID', hi: 'यूज़र आईडी' },
  portalPassword: { en: 'Password', hi: 'पासवर्ड' },
  portalSave: { en: 'Save', hi: 'सेव करें' },
  portalKeptSafe: {
    en: 'Kept safe — never shown in the chat',
    hi: 'सुरक्षित रखा जाएगा, चैट में नहीं दिखेगा',
  },

  ownerFills: { en: 'The owner fills this', hi: 'मालिक भरेंगे' },
  change: { en: 'Change', hi: 'बदलें' },
  filledByMdg: { en: "Filled in by MDG's team", hi: 'MDG की टीम ने भरा' },
  companyQuestion: {
    en: 'Which company is your petrol pump with?',
    hi: 'आपका पेट्रोल पंप किस कंपनी का है?',
  },
  companyFirst: {
    en: 'First tell us which company your pump is with, in the company card in this chat.',
    hi: 'पहले इस चैट के कंपनी वाले कार्ड में बताइए कि आपका पंप किस कंपनी का है।',
  },
  companyLocked: {
    en: 'Your services have started, so the company cannot be changed here any more.',
    hi: 'आपकी सेवाएँ शुरू हो चुकी हैं, इसलिए कंपनी अब यहाँ बदली नहीं जा सकती।',
  },
  billName: { en: 'Name on the bill', hi: 'बिल पर नाम' },
  billAddress: { en: 'Address (one line)', hi: 'पता (एक लाइन में)' },
  billState: { en: 'State', hi: 'राज्य' },
  billStatePick: { en: 'Choose your state', hi: 'अपना राज्य चुनिए' },
  billGstin: { en: 'GST number (only if you have one)', hi: 'GST नंबर (हो तो)' },
  billNoGst: { en: 'No GST number', hi: 'GST नंबर नहीं देना' },
  noGstGiven: { en: 'No GST number given', hi: 'GST नंबर नहीं दिया' },
  gstinHelp: {
    en: 'Only if you want GST credit. 15 letters and digits.',
    hi: 'GST क्रेडिट चाहिए तभी भरिए। 15 अक्षर और अंक।',
  },
  billSave: { en: 'Save', hi: 'सेव करें' },
  billSaved: { en: 'Bill details saved', hi: 'बिल की जानकारी सेव हो गई' },
  billLocked: {
    en: 'Payment has been received, so these details cannot be changed here any more.',
    hi: 'भुगतान मिल चुका है, इसलिए ये जानकारी अब यहाँ बदली नहीं जा सकती।',
  },
  payPreparing: {
    en: "MDG's team is getting your bill ready.",
    hi: 'MDG की टीम आपका बिल तैयार कर रही है।',
  },
  billLine: { en: 'Bill: {amount} · due {date}', hi: 'बिल: {amount} · आख़िरी तारीख़ {date}' },
  billLineNoDate: { en: 'Bill: {amount}', hi: 'बिल: {amount}' },
  payPaid: { en: 'Payment received', hi: 'भुगतान मिल गया' },
  payPaidOn: { en: 'Received on {date}', hi: '{date} को मिला' },
  billOverdue: { en: 'The due date has passed', hi: 'आख़िरी तारीख़ निकल चुकी है' },
  viewReceipt: { en: 'View receipt', hi: 'रसीद देखें' },
  started: { en: 'Your services have started', hi: 'आपकी सेवाएँ शुरू हो गई हैं' },
} as const satisfies Record<string, Record<DealerLang, string>>;

export type DealerWord = keyof typeof WORDS;

/** One of the app's strings, in the dealer's language, with `{name}` filled in. */
export function dealerWord(
  lang: DealerLang,
  key: DealerWord,
  vars?: Record<string, string>,
): string {
  let out: string = WORDS[key][lang];
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, v);
  return out;
}

const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN = /[A-Za-z]/;
/**
 * The one notice written in English whatever the reader's language: the line an
 * admin's "Resolve" posts (`Resolved — <service>`, routes/v1/conversations.ts).
 * It says nothing about the app's language, so it never decides it.
 */
const RESOLVED_NOTICE = /^Resolved — /;

/**
 * Which language the dealer's app is in, as far as the thread shows it.
 *
 * The inbox is not told the app's language. MDG's automatic notices are written
 * in it, though (the server picks the reader's language), so the newest notice
 * with words in it decides: any Hindi letter means Hindi. The English-only
 * "Resolved — …" line is skipped. With no notice to go by, Hindi — the app's
 * own default (ADR 0008), and what most dealers use.
 */
export function guessDealerLang(messages: readonly Message[]): DealerLang {
  let newest: Message | null = null;
  for (const m of messages) {
    if (!m.system || !m.body || RESOLVED_NOTICE.test(m.body)) continue;
    if (!(DEVANAGARI.test(m.body) || LATIN.test(m.body))) continue;
    if (!newest || m.createdAt > newest.createdAt) newest = m;
  }
  if (!newest) return 'hi';
  return DEVANAGARI.test(newest.body!) ? 'hi' : 'en';
}

const LOCALES: Record<DealerLang, string> = { hi: 'hi-IN', en: 'en-IN' };
const TIME_FORMATS = new Map<DealerLang, Intl.DateTimeFormat>();

/** "12:35 pm" — the clock inside a bubble, as the dealer's app writes it. */
export function bubbleTime(iso: string, lang: DealerLang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let fmt = TIME_FORMATS.get(lang);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(LOCALES[lang], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    TIME_FORMATS.set(lang, fmt);
  }
  return fmt.format(d);
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * The day chip, as the app writes it: "Today", "Yesterday", the weekday inside
 * the last week, else the full date. Calendar days apart, not 24-hour blocks.
 */
export function dayChipLabel(iso: string, lang: DealerLang, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const apart = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (apart <= 0) return dealerWord(lang, 'today');
  if (apart === 1) return dealerWord(lang, 'yesterday');
  if (apart < 7) return d.toLocaleDateString(LOCALES[lang], { weekday: 'long' });
  return d.toLocaleDateString(LOCALES[lang], { day: 'numeric', month: 'long', year: 'numeric' });
}

/** "28 Oct" / "28 अक्टू" — when a login was saved, as the login box writes it. */
export function shortDay(iso: string, lang: DealerLang, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d
    .toLocaleDateString(LOCALES[lang], {
      day: 'numeric',
      month: 'short',
      ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' as const }),
    })
    .replace(/॰/g, '');
}

/** "2 November" from a `YYYY-MM-DD` day, built from its parts so it never slips a day. */
export function longDay(ymd: string | null | undefined, lang: DealerLang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? '');
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(LOCALES[lang], { day: 'numeric', month: 'long' }).replace(/॰/g, '');
}

/** "₹3,540" — whole rupees, Indian grouping, paise only when there are some. */
export function rupees(paise: number): string {
  const r = paise / 100;
  return `₹${r.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(r) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Today in India as `YYYY-MM-DD`, whatever the computer's own zone is. */
export function istToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Each GST state's name in Hindi, for the saved bill details (the app's own list). */
export const GST_STATE_HI: Readonly<Record<string, string>> = {
  '01': 'जम्मू और कश्मीर',
  '02': 'हिमाचल प्रदेश',
  '03': 'पंजाब',
  '04': 'चंडीगढ़',
  '05': 'उत्तराखंड',
  '06': 'हरियाणा',
  '07': 'दिल्ली',
  '08': 'राजस्थान',
  '09': 'उत्तर प्रदेश',
  '10': 'बिहार',
  '11': 'सिक्किम',
  '12': 'अरुणाचल प्रदेश',
  '13': 'नागालैंड',
  '14': 'मणिपुर',
  '15': 'मिज़ोरम',
  '16': 'त्रिपुरा',
  '17': 'मेघालय',
  '18': 'असम',
  '19': 'पश्चिम बंगाल',
  '20': 'झारखंड',
  '21': 'ओडिशा',
  '22': 'छत्तीसगढ़',
  '23': 'मध्य प्रदेश',
  '24': 'गुजरात',
  '25': 'दमन और दीव',
  '26': 'दादरा और नगर हवेली और दमन और दीव',
  '27': 'महाराष्ट्र',
  '28': 'आंध्र प्रदेश (पुराना)',
  '29': 'कर्नाटक',
  '30': 'गोवा',
  '31': 'लक्षद्वीप',
  '32': 'केरल',
  '33': 'तमिल नाडु',
  '34': 'पुदुचेरी',
  '35': 'अंडमान और निकोबार द्वीप समूह',
  '36': 'तेलंगाना',
  '37': 'आंध्र प्रदेश',
  '38': 'लद्दाख',
  '97': 'अन्य क्षेत्र',
  '99': 'केंद्र अधिकार क्षेत्र',
};
