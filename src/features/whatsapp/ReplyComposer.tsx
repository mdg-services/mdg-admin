import { AlertTriangle, ChevronDown, ChevronUp, FileText, Link2, MessageCircle, SendHorizontal, X } from 'lucide-react';
import * as React from 'react';

import { IconButton } from '@/components/ui/IconButton';
import { useWhatsAppQuickReplies } from '@/hooks/api/useWhatsAppInbox';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { appendToBox } from '@/lib/replyHelper';
import {
  renderSimpleTemplate,
  type WhatsAppChatDetail,
  type WhatsAppChatMessage,
  type WhatsAppInboxConfig,
  type WhatsAppLine,
  type WhatsAppQuickReply,
} from '@dk/shared';

import { currentInsertSeq, useComposerInsert, useComposerPresence } from './composerInsert';
import { getDraft, setDraft } from './drafts';
import {
  composerPlaceholder,
  composerRouteLine,
  effectiveMode,
  filterQuickReplies,
  isImeKeystroke,
  linkRouteLine,
  linkLabel,
  pickerQuery,
  planSend,
  quoteWords,
  readLink,
  repeatWarning,
  sendButtonLabel,
} from './format';
import { FromStrip } from './LineMark';

/** Lines the box grows to before it scrolls inside itself: six at a desk, four on a phone with a keyboard up. */
const MAX_ROWS_MD = 6;
const MAX_ROWS_PHONE = 4;
const LINE_HEIGHT = 20;
const BOX_PADDING = 20;

export interface ReplyComposerProps {
  /** The inbox this box is in, and so the number what is typed in it leaves from. */
  line: WhatsAppLine;
  person: string;
  config: WhatsAppInboxConfig;
  detail: WhatsAppChatDetail;
  /** The message being answered, to quote it. Honoured only while the message goes as an ordinary one. */
  replyTo: WhatsAppChatMessage | null;
  contactName: string;
  onCancelReply: () => void;
  /**
   * `link` is the checked address for the button, or null for a message
   * without one. `keepRepeats`: the admin was warned that the words have their
   * own greeting or sign-off and chose "Send anyway".
   */
  onSend: (text: string, link: string | null, keepRepeats: boolean) => void;
  now: number;
}

/**
 * The box at the bottom of a chat, in WhatsApp's footer dress.
 *
 * It is always typed into FROM one number, and says so three ways at the moment
 * of typing: a strip above it, "From Dealer's Kavach · +91 94702 93427", in that
 * number's colours; the placeholder, "Message from Dealer's Kavach"; and the
 * round Send button, which is that number's colour rather than WhatsApp green
 * and is named for it. The server is told the number with every send.
 *
 * Under the strip, one slim line says which way the message will go — an
 * ordinary message while the 24-hour window is open, the greeting template
 * once it is not — and, for the template, a preview of exactly what the person
 * will be sent, so nobody is surprised that their words arrive between a
 * greeting and a sign-off. The server decides the route; this only says so.
 *
 * Keyed on the chat by its parent, and the draft is kept per chat AND number
 * (`drafts.ts`): the half-written answer to one lead cannot be sent to
 * another, nor to the same lead from the other number, and is still there when
 * the admin comes back.
 *
 * A link can be added (once the server says its template is approved): the
 * message then goes in the link template whatever the window says, with a
 * button that opens the link through our own address, so each tap is counted
 * on the Message results page. The link is not part of the draft — it is
 * cleared when the message goes or the chat changes.
 *
 * Words that go in a template and open with their own greeting ("Namaste,") or
 * close with their own sign-off ("Thank you, Team MDG Services") stop Send: a
 * warning over the box says the person would get them twice, with one button
 * that takes them out and one that sends anyway. Collapsed under Preview, the
 * doubled message went unseen.
 */
export function ReplyComposer({
  line,
  person,
  config,
  detail,
  replyTo,
  contactName,
  onCancelReply,
  onSend,
  now,
}: ReplyComposerProps) {
  const [value, setValue] = React.useState(() => getDraft(line, person));
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [pickerIndex, setPickerIndex] = React.useState(0);
  // Escape closes the picker; it stays closed until the box no longer starts with a slash.
  const [pickerDismissed, setPickerDismissed] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkValue, setLinkValue] = React.useState('');
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const linkRef = React.useRef<HTMLInputElement>(null);
  const coarse = useMediaQuery('(pointer: coarse)');
  const isMd = useMediaQuery('(min-width: 768px)');
  const quickReplies = useWhatsAppQuickReplies();
  const ids = React.useId();
  const listId = `${ids}-quick`;
  const previewId = `${ids}-preview`;
  const linkHelpId = `${ids}-link-help`;

  // The server's word on how it goes, unless the window has run out since it
  // gave it: then the words, the preview and the length limit are the template's.
  // A link goes the same way: in an open window as an ordinary message with
  // its button (lines kept), otherwise in its own template.
  const linkTemplate = config.linkTemplate;
  const link = linkOpen && linkTemplate ? readLink(linkValue) : ({ state: 'none' } as const);
  const linked = link.state === 'ok';
  const mode = effectiveMode(detail.chat, detail.reply, now);
  const plan = planSend(value, mode, config, linked);
  const typed = value.trim();
  // On the stop list, a template cannot go. In an open window the words and the link go as an ordinary answer.
  const linkStopped = linked && mode === 'template' && detail.chat.optedOut;
  const ready = typed.length > 0 && !plan.tooLong && link.state !== 'bad' && !linkStopped;
  const repeat = repeatWarning(value, mode);
  const canSend = ready && repeat === null;

  // ── words pushed in from outside: the Reply helper's "Use this" ──
  // Registered as open, so the helper can say truthfully that its draft went
  // into a box the admin can see. The sequence number starts from where the chat
  // already is: an insert made while this box was not mounted is in the saved
  // draft it started from, and applying it again would put it in twice.
  useComposerPresence(line, person);
  const insertRequest = useComposerInsert(line, person);
  const appliedInsert = React.useRef(currentInsertSeq(line, person));
  React.useEffect(() => {
    if (insertRequest.seq <= appliedInsert.current) return;
    appliedInsert.current = insertRequest.seq;
    // APPEND, never replace: the admin may be halfway through their own reply.
    // Through `change`, so it is saved as a draft like anything typed here.
    change(appendToBox(value, insertRequest.text));
    const ta = taRef.current;
    if (ta) {
      ta.focus();
      // After the value has painted, or the caret lands at the old end.
      window.setTimeout(() => {
        ta.selectionStart = ta.value.length;
        ta.selectionEnd = ta.value.length;
      }, 0);
    }
    // Only a new request runs this; `value` is read as of that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertRequest.seq]);

  // ── the box grows with what is typed, up to a few lines ──
  React.useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const maxRows = isMd ? MAX_ROWS_MD : MAX_ROWS_PHONE;
    ta.style.height = `${Math.min(ta.scrollHeight, LINE_HEIGHT * maxRows + BOX_PADDING)}px`;
  }, [value, isMd]);

  // Straight into the box on a desk. Not on a phone: the keyboard would cover the chat that was just opened.
  React.useEffect(() => {
    if (!coarse) taRef.current?.focus({ preventScroll: true });
    // Once, when the chat opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Choosing a message to answer puts the caret back in the box.
  React.useEffect(() => {
    if (replyTo && !coarse) taRef.current?.focus({ preventScroll: true });
  }, [replyTo, coarse]);

  // ── quick replies: "/" at the very start ──
  const query = pickerQuery(value);
  const pickerOpen = query !== null && !pickerDismissed;
  const matches = pickerOpen ? filterQuickReplies(quickReplies.data ?? [], query) : [];
  const activeIndex = Math.min(pickerIndex, Math.max(0, matches.length - 1));

  function change(next: string) {
    setValue(next);
    setDraft(line, person, next);
    setPickerIndex(0);
    if (pickerQuery(next) === null) setPickerDismissed(false);
  }

  function pick(reply: WhatsAppQuickReply) {
    change(reply.text);
    setPickerDismissed(true);
    const ta = taRef.current;
    if (ta) {
      ta.focus();
      // After the value has painted, or the caret lands at the old end.
      window.setTimeout(() => {
        ta.selectionStart = ta.value.length;
        ta.selectionEnd = ta.value.length;
      }, 0);
    }
  }

  /** `keepRepeats` only from "Send anyway": past the warning, on purpose. */
  function submit(keepRepeats = false) {
    if (!ready || (repeat !== null && !keepRepeats)) return;
    onSend(typed, link.state === 'ok' ? link.target : null, keepRepeats);
    setValue('');
    setDraft(line, person, '');
    setPreviewOpen(false);
    setPickerDismissed(false);
    setLinkOpen(false);
    setLinkValue('');
  }

  function removeRepeats() {
    if (!repeat?.fixed) return;
    change(repeat.fixed);
    taRef.current?.focus({ preventScroll: true });
  }

  function toggleLink() {
    if (linkOpen) {
      setLinkOpen(false);
      setLinkValue('');
      taRef.current?.focus({ preventScroll: true });
      return;
    }
    setLinkOpen(true);
    // After the box has painted.
    window.setTimeout(() => linkRef.current?.focus({ preventScroll: true }), 0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // First of all, before the picker's keys as well: while a word is being
    // composed, Enter, Tab and the arrows belong to the input method's own
    // candidate list. Safari ends the composition just before the Enter that
    // commits it, so `isComposing` alone lets that Enter send the message.
    if (isImeKeystroke(e.nativeEvent.isComposing, e.keyCode)) return;
    if (pickerOpen && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPickerIndex((activeIndex + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPickerIndex((activeIndex - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const chosen = matches[activeIndex];
        if (chosen) pick(chosen);
        return;
      }
    }
    if (pickerOpen && e.key === 'Escape') {
      e.preventDefault();
      setPickerDismissed(true);
      return;
    }
    if (e.key !== 'Enter' || e.shiftKey) return;
    // At a desk, Enter sends and Shift+Enter starts a line. On a touch screen
    // Enter starts a line — the green button sends — unless a hardware keyboard
    // adds Ctrl or Cmd.
    if (coarse && !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    submit();
  }

  // A message with a link button never quotes: the server sends it without one.
  const quoting = mode === 'text' && !linked && replyTo !== null;
  const templateButton = linked ? (linkTemplate?.button ?? null) : config.template.button;
  const quoteOurs = replyTo?.direction === 'out';

  return (
    <div>
      <div className="px-2 pt-1.5 md:px-3">
        <FromStrip line={line} />
      </div>
      <div className="flex items-start gap-2 px-3 pt-1.5 text-xs text-[var(--wa-meta)]">
        {mode === 'text' ? (
          <MessageCircle width={14} height={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--wa-green-strong)]" aria-hidden />
        ) : (
          <FileText width={14} height={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning-strong" aria-hidden />
        )}
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]" title={linked ? undefined : detail.reply.reason}>
          {linked ? linkRouteLine(mode) : composerRouteLine(detail.chat, detail.reply, now)}
        </span>
        {mode === 'template' ? (
          <button
            type="button"
            aria-expanded={previewOpen}
            aria-controls={previewId}
            onClick={() => setPreviewOpen((o) => !o)}
            className="-my-1.5 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 font-semibold text-[var(--wa-link)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-8"
          >
            Preview
            {previewOpen ? (
              <ChevronDown width={14} height={14} strokeWidth={2} aria-hidden />
            ) : (
              <ChevronUp width={14} height={14} strokeWidth={2} aria-hidden />
            )}
          </button>
        ) : null}
      </div>

      {mode === 'template' && previewOpen ? (
        <div id={previewId} className="mx-3 mt-1 rounded-lg bg-black/[0.04] p-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--wa-meta)]">
            What they will receive
          </p>
          <div className="rounded-lg bg-[var(--wa-out)] px-2.5 py-1.5 text-[14.2px] leading-[19px] text-[var(--wa-text)] shadow-sm">
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{plan.preview ?? renderSimpleTemplate('…')}</p>
          </div>
          {templateButton ? (
            <div className="mt-0.5 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--wa-out)] py-2 text-sm font-medium text-[var(--wa-link)] shadow-sm">
              {linked ? <Link2 width={14} height={14} strokeWidth={2} aria-hidden /> : null}
              {templateButton}
            </div>
          ) : null}
          {link.state === 'ok' ? (
            <p className="mt-1.5 text-xs text-[var(--wa-meta)] [overflow-wrap:anywhere]">
              The button opens {linkLabel(link.target)}, through our own address so each tap is counted.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Out in the open, not under Preview: on 30 Oct 2026 a message typed
          line by line reached a lead as one block, and the note saying it
          would sat in the collapsed preview. */}
      {plan.joinsLines && typed.length > 0 ? (
        <p role="status" className="mx-3 mt-1 flex items-start gap-1.5 text-xs text-warning-strong">
          <AlertTriangle width={14} height={14} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            Your line breaks will become one paragraph: this goes as a template message, and WhatsApp does not
            allow line breaks in one. Once they write to us, messages go as typed.
          </span>
        </p>
      ) : null}

      {quoting && replyTo ? (
        <div
          className={cn(
            'mx-2 mt-2 flex items-start gap-2 rounded-lg border-l-4 bg-black/[0.05] py-1 pl-2 pr-1 md:mx-3',
            quoteOurs ? 'border-[var(--wa-quote-out)]' : 'border-[var(--wa-quote-in)]',
          )}
        >
          <div className="min-w-0 flex-1 py-0.5">
            <p
              className={cn(
                'truncate text-xs font-semibold',
                quoteOurs ? 'text-[var(--wa-green-strong)]' : 'text-[var(--wa-link)]',
              )}
            >
              {quoteOurs ? 'MDG' : contactName}
            </p>
            <p className="line-clamp-2 text-[13px] text-[var(--wa-meta)] [overflow-wrap:anywhere]">
              {quoteWords(replyTo)}
            </p>
          </div>
          <IconButton aria-label="Stop replying to this message" size="xs" onClick={onCancelReply}>
            <X width={16} height={16} strokeWidth={2} />
          </IconButton>
        </div>
      ) : null}

      {pickerOpen ? (
        <div className="mx-2 mt-2 md:mx-3">
          <ul
            id={listId}
            role="listbox"
            aria-label="Quick replies"
            className="max-h-56 overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface py-1 shadow-md"
          >
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-sm text-text-muted">
                {(quickReplies.data?.length ?? 0) === 0
                  ? 'No quick replies yet. Add some with the lightning bolt at the top of the chat list.'
                  : 'No quick reply matches that.'}
              </li>
            ) : (
              matches.map((reply, i) => (
                <li
                  key={reply.id}
                  id={`${ids}-opt-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  // The box keeps focus: a press on the list must not take it.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setPickerIndex(i)}
                  onClick={() => pick(reply)}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-baseline gap-2 px-3 py-2 text-sm md:min-h-9',
                    i === activeIndex && 'bg-surface-2',
                  )}
                >
                  <span className="shrink-0 font-semibold text-[var(--wa-green-strong)]">/{reply.shortcut}</span>
                  <span className="min-w-0 truncate text-text-muted">{reply.text}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {linkOpen && linkTemplate ? (
        <div className="mx-2 mt-2 md:mx-3">
          <div className="flex items-center gap-2 rounded-lg bg-[var(--wa-field)] pl-3 pr-1">
            <Link2 width={16} height={16} strokeWidth={2} className="shrink-0 text-[var(--wa-meta)]" aria-hidden />
            <input
              ref={linkRef}
              // Text, not "url": the browser's own check would refuse an
              // address typed without https://, which is how people type them.
              type="text"
              inputMode="url"
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  toggleLink();
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  taRef.current?.focus();
                }
              }}
              placeholder="Paste the link, e.g. mdgservices.in/film"
              aria-label="Link"
              aria-invalid={link.state === 'bad' || linkStopped}
              aria-describedby={linkHelpId}
              autoComplete="off"
              spellCheck={false}
              className="min-h-11 w-full min-w-0 bg-transparent py-2 text-base text-[var(--wa-text)] placeholder:text-[var(--wa-meta)] focus-visible:outline-none md:min-h-9 md:text-[15px]"
            />
            <IconButton aria-label="Remove the link" size="xs" onClick={toggleLink}>
              <X width={16} height={16} strokeWidth={2} />
            </IconButton>
          </div>
          <p
            id={linkHelpId}
            role={link.state === 'bad' || linkStopped ? 'alert' : undefined}
            className={cn(
              'mt-1 px-1 text-xs [overflow-wrap:anywhere]',
              link.state === 'bad' || linkStopped ? 'font-medium text-danger-strong' : 'text-[var(--wa-meta)]',
            )}
          >
            {link.state === 'bad'
              ? 'That is not a web address. Paste the whole link, like https://mdgservices.in/film.'
              : linkStopped
                ? 'They asked us to stop promotions, and this would go as a template message, which cannot go to them. Wait for them to write to us.'
                : link.state === 'ok'
                  ? `Opens ${linkLabel(link.target)} · we count each tap, and who comes back to it`
                  : 'They get a button that opens it. We count each tap on the Message results page.'}
          </p>
        </div>
      ) : null}

      {repeat ? (
        <div role="alert" className="mx-2 mt-2 rounded-lg border border-warning bg-warning-soft px-3 py-2 md:mx-3">
          <p className="flex items-start gap-1.5 text-xs text-warning-strong">
            <AlertTriangle width={14} height={14} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden />
            <span className="min-w-0 [overflow-wrap:anywhere]">{repeat.text}</span>
          </p>
          <div className="-mb-1 mt-0.5 flex flex-wrap items-center gap-x-1 pl-4">
            {repeat.fixed !== null ? (
              <button
                type="button"
                // The box keeps focus, and a phone keeps its keyboard up.
                onMouseDown={(e) => e.preventDefault()}
                onClick={removeRepeats}
                className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-[var(--wa-link)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-8"
              >
                {repeat.removeLabel}
              </button>
            ) : null}
            <button
              type="button"
              disabled={!ready}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => submit(true)}
              className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-[var(--wa-meta)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-45 md:min-h-8"
            >
              Send anyway
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-end gap-2 px-2 pb-2 pt-1.5 md:px-3">
        {linkTemplate ? (
          <button
            type="button"
            aria-label={linkOpen ? 'Remove the link' : 'Add a link'}
            aria-pressed={linkOpen}
            title={linkOpen ? 'Remove the link' : 'Add a link we can count'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleLink}
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              linkOpen
                ? 'bg-[var(--wa-green-strong)] text-white'
                : 'text-[var(--wa-meta)] hover:bg-black/[0.06]',
            )}
          >
            <Link2 width={20} height={20} strokeWidth={2} aria-hidden />
          </button>
        ) : null}
        <textarea
          ref={taRef}
          value={value}
          rows={1}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={composerPlaceholder(line)}
          aria-label="Message"
          aria-controls={pickerOpen ? listId : undefined}
          aria-activedescendant={pickerOpen && matches[activeIndex] ? `${ids}-opt-${activeIndex}` : undefined}
          enterKeyHint={coarse ? 'enter' : 'send'}
          autoComplete="off"
          // 16px at every width: below that an iPhone zooms in on focus and
          // nothing zooms back out. `select-text` because the app switches
          // selection off outside fields.
          className={cn(
            'block max-h-[160px] min-h-11 w-full min-w-0 resize-none rounded-lg border-0 bg-[var(--wa-field)] px-3 py-2.5 text-base leading-5',
            'text-[var(--wa-text)] placeholder:text-[var(--wa-meta)] md:text-[15px]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--line)]',
          )}
        />
        <button
          type="button"
          aria-label={sendButtonLabel(line)}
          title={sendButtonLabel(line)}
          disabled={!canSend}
          // Keeps the keyboard up on a phone: a press on the button must not take focus from the box.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => submit()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--line)] text-white transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-45"
        >
          <SendHorizontal width={20} height={20} strokeWidth={2} aria-hidden />
        </button>
      </div>

      {plan.showCounter ? (
        <p
          role={plan.tooLong ? 'alert' : undefined}
          className={cn(
            'px-3 pb-2 text-right text-xs tabular-nums',
            plan.tooLong ? 'font-medium text-danger-strong' : 'text-[var(--wa-meta)]',
          )}
        >
          {plan.tooLong
            ? `${(plan.used - plan.limit).toLocaleString('en-IN')} characters too many · `
            : null}
          {plan.used.toLocaleString('en-IN')} / {plan.limit.toLocaleString('en-IN')}
        </p>
      ) : null}
    </div>
  );
}
