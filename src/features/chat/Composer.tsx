import { ChevronDown, Mic, Paperclip, Plus, RotateCcw, Send, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import * as React from 'react';


import { ShareAudienceNote } from '@/components/share/ShareMenu';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Menu, MenuItem } from '@/components/ui/Menu';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { usePublishBottomBar } from '@/hooks/usePublishBottomBar';
import { cn } from '@/lib/cn';
import { isNativeShell, requestNativeMicPermission } from '@/lib/nativeBridge';
import {
  formatDuration,
  isSendable,
  MAX_ATTACHMENT_BYTES,
  notSendableMessage,
  resolveFileType,
  UPLOAD_ACCEPT,
  uploadAttachment,
} from '@/lib/uploadAttachment';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';
import {
  SHARE_AUDIENCE_LABELS,
  SHARE_AUDIENCES,
  type Attachment,
  type ShareAudience,
} from '@dk/shared';

function extForMime(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

interface StagedFile {
  id: string;
  file: File;
  /** Object URL for an inline thumbnail; only set for images. */
  previewUrl?: string;
}

/** Display-ready summary of the message being replied to. */
export interface ComposerReplyPreview {
  senderLabel: string;
  snippet: string;
  imageUrl?: string;
}

/**
 * A request to drop text into the input from outside it — today, the AI first
 * line's "Put in composer" button.
 *
 * `id` is what makes it a REQUEST and not a value. The same sentence pressed
 * twice must arrive twice, and a `useEffect` keyed on the text alone would do
 * nothing the second time and look broken; keyed on a fresh id it always fires.
 * It is deliberately not a `value` prop either: this composer owns its draft,
 * and handing that ownership away would put every keystroke through the page.
 */
export interface ComposerInsert {
  text: string;
  id: string;
  /**
   * `'helper'`: a Reply helper draft. The box then wears the helper's tag until
   * the message is sent or the box is emptied, so a machine's words are never
   * sent without the admin having been told whose they are.
   */
  source?: 'helper' | 'ai';
}

interface ComposerProps {
  conversationId: string;
  onSend: (payload: {
    body?: string;
    attachments: Attachment[];
  }) => Promise<void>;
  disabled?: boolean;
  /** When set, a reply-quote strip shows above the input. */
  replyingTo?: ComposerReplyPreview | null;
  onCancelReply?: () => void;
  /** Text pushed in from outside. See {@link ComposerInsert}. */
  insert?: ComposerInsert | null;
  /**
   * Who the box sends to, for its placeholder ("Message Anurag Singh · Owner").
   * The box that sends must say so: the Reply helper has a box of its own, and
   * the two must never read as the same thing.
   */
  recipient?: string;
  /** The Reply helper's one tap: read the chat and draft the next reply. */
  onSuggest?: () => void;
  /** A suggestion is being written (spinner on the button). */
  suggesting?: boolean;
  /**
   * Other things to send from this chat, behind the "+" beside the box with
   * "Attach a file" — they all put something in front of the dealer.
   */
  moreActions?: Array<{ id: string; label: string; icon: React.ReactNode; onSelect: () => void }>;
  /**
   * Send to the whole outlet instead of this one chat — every owner, the
   * manager, or both. When set, a "Send to" choice sits above the box while
   * there is something to send; "This chat" is always the default and the
   * choice falls back to it after every send, so nothing goes to the whole
   * outlet by accident.
   */
  onShareToOutlet?: (payload: {
    body?: string;
    attachments: Attachment[];
    audience: ShareAudience;
  }) => Promise<void>;
}

/** Where the composer's message goes: this chat, or one of the outlet choices. */
type SendTarget = 'chat' | ShareAudience;

/** One line under each choice in the "Send to" list. */
const TARGET_HINT: Record<SendTarget, string> = {
  chat: 'Only the people in this chat',
  owners: 'Every owner, in their own chat',
  managers: 'The manager, in the group chat',
  both: 'Every owner and the manager',
};

const LINE_HEIGHT = 20;

/**
 * The name a phone's box has room for: "Anurag Singh · Owner" becomes "Anurag",
 * and a first name longer than twelve letters is cut. The full name stays in
 * the box's label and in the helper-draft note.
 */
function phoneName(recipient: string): string {
  const first = recipient.split(' · ')[0]?.split(' ')[0] ?? recipient;
  return first.length > 12 ? `${first.slice(0, 12)}…` : first;
}
/*
 * How far the box grows before it scrolls inside itself. Four rows below md,
 * not six: a thread on a 740px phone already spends its header, the AI strip
 * and this row on chrome, and a "Put in composer" paragraph grown to six rows
 * pushed Send under the bottom edge. Desktop keeps its six.
 */
const MAX_ROWS_MD = 6;
const MAX_ROWS_PHONE = 4;

export function Composer({
  conversationId,
  onSend,
  disabled,
  replyingTo,
  onCancelReply,
  insert,
  recipient,
  onSuggest,
  suggesting = false,
  moreActions,
  onShareToOutlet,
}: ComposerProps) {
  const [body, setBody] = React.useState('');
  // A helper draft is in the box: the tag shows until it is sent or emptied.
  const [fromHelper, setFromHelper] = React.useState(false);
  // The box's frame, for the one soft pulse when a draft lands in it.
  const fieldRef = React.useRef<HTMLDivElement>(null);
  const [target, setTarget] = React.useState<SendTarget>('chat');
  const [files, setFiles] = React.useState<StagedFile[]>([]);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  // This row is the bottom of the thread, so it publishes its height and a
  // toast ("Copied", a failed send) sits above it instead of on top of Send. It
  // grows with the draft, staged files and the reply quote, and the hook
  // re-measures as it does. At md too: the toast's corner is this row's
  // right-hand end, where Send is.
  const rootRef = React.useRef<HTMLDivElement>(null);
  usePublishBottomBar(rootRef, true, true);
  const recorder = useVoiceRecorder();
  const isRecording = recorder.status === 'recording';
  const isMd = useMediaQuery('(min-width: 768px)');
  // "Suggest" earns its word only where the box is wide enough to keep its own.
  const roomyRow = useMediaQuery('(min-width: 1440px)');

  // A resolved chat disables the composer; say why.
  const placeholder = disabled
    ? 'This chat is resolved — reopen to reply.'
    : recipient
      ? `Message ${isMd ? recipient : phoneName(recipient)}`
      : 'Type a message…';

  // The box grows with what is in it, the placeholder included: an empty box
  // is measured too, so a sentence-long placeholder is not cut to one line.
  const measure = React.useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const maxRows = isMd ? MAX_ROWS_MD : MAX_ROWS_PHONE;
    const next = Math.min(ta.scrollHeight, LINE_HEIGHT * maxRows + 16);
    ta.style.height = `${next}px`;
  }, [isMd]);
  React.useEffect(measure, [body, placeholder, measure]);
  // And again when the box narrows or widens with no change to its text: Send
  // appearing beside it, the side panel opening. Width only, or the observer
  // would wake on the height this very measure writes.
  React.useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || typeof ResizeObserver === 'undefined') return;
    let width = ta.clientWidth;
    const ro = new ResizeObserver(() => {
      if (ta.clientWidth === width) return;
      width = ta.clientWidth;
      measure();
    });
    ro.observe(ta);
    return () => ro.disconnect();
  }, [measure]);

  // Starting a reply drops focus straight into the input.
  React.useEffect(() => {
    if (replyingTo) textareaRef.current?.focus();
  }, [replyingTo]);

  /**
   * Text pushed in from outside: append it, focus, and put the caret at the end.
   *
   * APPEND AND NEVER REPLACE. The admin may already be halfway through typing
   * their own reply when they notice the machine had a usable sentence, and
   * overwriting a half-written message to save them a paste is a bad trade — the
   * draft is not recoverable and the sentence is.
   *
   * Keyed on `insert?.id`, not on the text, so the same sentence can be pushed
   * in twice; the effect deliberately does not depend on `body`, which it reads
   * through the setter instead, or every keystroke would re-run it.
   */
  React.useEffect(() => {
    if (!insert) return;
    const text = insert.text.trim();
    if (!text) return;
    setBody((curr) => (curr.trim() ? `${curr.replace(/\s+$/, '')}\n\n${text}` : text));
    if (insert.source === 'helper') setFromHelper(true);
    // Replay the pulse by restarting the class, not by re-keying the box: a new
    // key would remount the textarea and drop the focus given to it below.
    const field = fieldRef.current;
    if (field) {
      field.classList.remove('draft-landed');
      void field.offsetWidth;
      field.classList.add('draft-landed');
    }
    const ta = textareaRef.current;
    if (ta) {
      ta.focus();
      // After the state has painted, or the caret lands at the old end.
      window.setTimeout(() => {
        ta.selectionStart = ta.value.length;
        ta.selectionEnd = ta.value.length;
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insert?.id]);

  const hasContent = body.trim().length > 0 || files.length > 0;
  const busy = sending || disabled;
  // An emptied box holds no helper draft any more.
  React.useEffect(() => {
    if (!body.trim()) setFromHelper(false);
  }, [body]);

  function pickFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next: StagedFile[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list.item(i);
      if (!f) continue;
      if (f.size > MAX_ATTACHMENT_BYTES) {
        setError(`${f.name} exceeds 25 MB limit`);
        continue;
      }
      if (!isSendable(f)) {
        setError(notSendableMessage(f.name));
        continue;
      }
      next.push({
        id: `${Date.now()}-${i}-${f.name}`,
        file: f,
        // The same resolver the upload uses, so a camera photo whose picker
        // reported no type still gets its thumbnail rather than a file chip.
        previewUrl:
          resolveFileType(f).kind === 'image' ? URL.createObjectURL(f) : undefined,
      });
    }
    if (next.length > 0) {
      setFiles((curr) => [...curr, ...next]);
    }
  }

  function removeFile(id: string) {
    setFiles((curr) => {
      const removed = curr.find((s) => s.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return curr.filter((s) => s.id !== id);
    });
  }

  // Revoke any outstanding preview object URLs on unmount.
  React.useEffect(() => {
    return () => {
      files.forEach((s) => {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend() {
    if (!hasContent || busy) return;
    setSending(true);
    setError(null);
    try {
      const uploaded = await Promise.all(
        files.map((s) => uploadAttachment(s.file, conversationId)),
      );
      const payload = {
        body: body.trim() ? body.trim() : undefined,
        attachments: uploaded,
      };
      // A reply belongs to this chat: the quote names a message only it holds.
      if (target !== 'chat' && onShareToOutlet && !replyingTo) {
        await onShareToOutlet({ ...payload, audience: target });
      } else {
        await onSend(payload);
      }
      setTarget('chat');
      files.forEach((s) => {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      });
      setBody('');
      setFromHelper(false);
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSend();
    }
  }

  async function startRecording() {
    setError(null);
    if (!recorder.supported) {
      // The reason used to live only in `title`, which never fires on touch —
      // so on a phone the mic was a greyed-out button with no explanation
      // anywhere. Keep the control tappable and answer in visible text.
      setError('Voice notes are not supported in this browser.');
      return;
    }
    const ok = await recorder.start();
    if (!ok) {
      // Mic blocked (permission denied / unsupported). Inside the native shell
      // the WebView's getUserMedia can't trigger the Android runtime prompt on
      // its own — ask the shell to request it just-in-time. If the user grants
      // it, prompt them to try again; otherwise fall back to the settings hint.
      // In a plain browser requestNativeMicPermission resolves false, so this
      // goes straight to the hint.
      if (isNativeShell()) {
        const granted = await requestNativeMicPermission();
        if (granted) {
          setError('Microphone enabled. Tap the mic again to record.');
          return;
        }
      }
      setError('Microphone unavailable. Check browser permissions.');
    }
  }

  async function stopAndSendVoice() {
    const rec = await recorder.stop();
    if (!rec || rec.blob.size === 0) return;
    // Normalise to a clean base audio MIME (strip ";codecs=…", guarantee audio/*)
    // so the presign allowlist accepts it and the S3 PUT matches the signed type.
    let mime = ((rec.mimeType || rec.blob.type || 'audio/webm').split(';')[0] || 'audio/webm').trim();
    if (!mime.startsWith('audio/')) mime = 'audio/webm';
    const ext = extForMime(mime);
    const file = new File([rec.blob], `voice-${Date.now()}.${ext}`, {
      type: mime,
    });
    setSending(true);
    setError(null);
    try {
      const uploaded = await uploadAttachment(file, conversationId, rec.durationMs);
      await onSend({ attachments: [uploaded] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send voice message');
    } finally {
      setSending(false);
    }
  }

  return (
    /*
     * The bottom-most element on screen in a thread, and in a thread the mobile
     * tab bar — the one thing that carries `.safe-bottom` — is hidden. So this
     * row owns its own bottom inset or the mic and Send sit inside the iPhone
     * home-indicator strip. It looked safe until now only because the page was
     * rendering 32px shorter than the space it occupies (InboxPage's `h-full`
     * against `main`'s content box), an accident the height fix removes.
     */
    <div
      ref={rootRef}
      className="border-t border-border bg-surface px-3 py-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] md:pb-2"
    >
      {replyingTo ? (
        <div className="mb-2 flex items-center gap-2 rounded-md border-l-[3px] border-brand bg-surface-2 px-2.5 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-brand">
              {replyingTo.senderLabel}
            </p>
            <p className="truncate text-xs text-text-muted">
              {replyingTo.snippet}
            </p>
          </div>
          {replyingTo.imageUrl ? (
            <img
              src={replyingTo.imageUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-md object-cover"
            />
          ) : null}
          <IconButton
            aria-label="Cancel reply"
            // `xs`: this was a 22px `p-1` glyph inside a quote strip, and `sm`
            // would grow it to 32px on desktop for no mobile gain — below md
            // every size is the same 44px square.
            size="xs"
            onClick={onCancelReply}
            className="text-text-muted"
          >
            <X width={14} height={14} strokeWidth={1.75} />
          </IconButton>
        </div>
      ) : null}
      {files.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((s) =>
            s.previewUrl ? (
              <div
                key={s.id}
                className="group relative h-16 w-16 overflow-hidden rounded-lg border border-border bg-surface-2"
              >
                <img
                  src={s.previewUrl}
                  alt={s.file.name}
                  className="h-full w-full object-cover"
                />
                {/* The paint has to stay small — it sits on a 64px thumbnail —
                    so the hit area grows instead, the way `.tap-target` does it.
                    Not `.tap-target` itself: that utility sets
                    `position: relative` and is emitted after `.absolute`, so it
                    would unpin this X from the thumbnail's corner. */}
                <button
                  type="button"
                  onClick={() => removeFile(s.id)}
                  aria-label={`Remove ${s.file.name}`}
                  className="tap-halo absolute right-0.5 top-0.5 rounded-full bg-black/55 p-0.5 text-white hover:bg-black/75"
                >
                  <X width={12} height={12} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <span
                key={s.id}
                className="inline-flex min-h-11 max-w-xs items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-text md:min-h-0"
              >
                <Paperclip width={12} height={12} strokeWidth={1.75} />
                <span className="truncate">{s.file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(s.id)}
                  aria-label={`Remove ${s.file.name}`}
                  className="tap-target rounded-sm p-1 text-text-muted hover:text-text md:p-0"
                >
                  <X width={12} height={12} strokeWidth={1.75} />
                </button>
              </span>
            ),
          )}
        </div>
      ) : null}
      {error ? (
        <p className="mb-1 text-xs text-danger">{error}</p>
      ) : null}
      {onShareToOutlet && hasContent && !replyingTo && !isRecording ? (
        <div className="mb-2 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>Send to</span>
            <Menu
              label="Send to"
              title="Send to"
              align="start"
              triggerVariant="secondary"
              triggerSize="sm"
              triggerDisabled={busy}
              trigger={
                <>
                  <span>{target === 'chat' ? 'This chat' : SHARE_AUDIENCE_LABELS[target]}</span>
                  <ChevronDown width={14} height={14} strokeWidth={1.75} aria-hidden />
                </>
              }
            >
              {(['chat', ...SHARE_AUDIENCES] as SendTarget[]).map((t) => (
                <MenuItem key={t} onSelect={() => setTarget(t)}>
                  <span className="block font-medium text-text">
                    {t === 'chat' ? 'This chat' : SHARE_AUDIENCE_LABELS[t]}
                  </span>
                  <span className="block text-xs text-text-muted">{TARGET_HINT[t]}</span>
                </MenuItem>
              ))}
            </Menu>
          </div>
          {target !== 'chat' ? <ShareAudienceNote audience={target} /> : null}
        </div>
      ) : null}
      {isRecording ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => recorder.cancel()}
            aria-label="Cancel recording"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text md:h-9 md:w-9"
          >
            <Trash2 width={18} height={18} strokeWidth={1.75} />
          </button>
          <div className="flex flex-1 items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
            <span className="text-sm font-medium tabular-nums text-text">
              {formatDuration(recorder.elapsedMs)}
            </span>
            <span className="text-sm text-text-subtle">Recording…</span>
          </div>
          <Button
            type="button"
            onClick={stopAndSendVoice}
            loading={sending}
            leftIcon={sending ? null : <Send width={16} height={16} strokeWidth={1.75} />}
          >
            Send
          </Button>
        </div>
      ) : disabled && !isMd ? (
        /*
         * A resolved chat's only explanation used to be the placeholder, inside
         * a field about 180px wide at 360px — the admin read "This chat is
         * resol…" beside a mic that was simply grey. Below md the row is
         * replaced by the sentence itself, pointing at the Reopen button that
         * is already in the thread header.
         */
        <p className="px-1 py-2 text-sm text-text-muted">
          This chat is resolved. Tap{' '}
          {/* Below md the thread header draws Reopen as a bare glyph — its word
              lives in the kebab sheet — so naming it alone would send the admin
              hunting for a word that is not on screen. Show the glyph too. */}
          <RotateCcw
            width={14}
            height={14}
            strokeWidth={1.75}
            aria-hidden
            className="inline align-text-bottom text-text"
          />{' '}
          <span className="font-medium text-text">Reopen</span> at the top to
          reply.
        </p>
      ) : (
        <div className="grid gap-2">
          {/* Whose words these are, until they are sent or the box is emptied:
              a machine's draft never leaves without the admin being told. */}
          {fromHelper ? (
            <div className="flex items-center gap-2 rounded-md border border-assist-line bg-assist-soft px-2.5 py-1.5 text-xs text-assist-strong">
              <Sparkles width={13} height={13} strokeWidth={2} className="shrink-0 text-assist" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">Draft from the Reply helper.</span>{' '}
                {/* A short screen is a phone with its keyboard up: the safety
                    half alone, so the messages keep their room. */}
                <span className="[@media(max-height:640px)]:hidden">
                  Read and change it — it goes to {recipient ?? 'them'} only when you press Send.
                </span>
                <span className="hidden [@media(max-height:640px)]:inline">
                  Sent only when you press Send.
                </span>
              </span>
              <button
                type="button"
                onClick={() => setFromHelper(false)}
                aria-label="Hide this note"
                className="tap-target -my-1 shrink-0 rounded-sm p-1 text-assist-strong hover:bg-assist-line"
              >
                <X width={13} height={13} strokeWidth={2} />
              </button>
            </div>
          ) : null}
          <div className="flex items-end gap-1.5 md:gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={UPLOAD_ACCEPT}
              multiple
              hidden
              onChange={(e) => pickFiles(e.target.files)}
            />
            {moreActions && moreActions.length > 0 ? (
              <Menu
                label="Attach or send"
                title="Send to this chat"
                align="start"
                triggerDisabled={busy}
                trigger={<Plus width={20} height={20} strokeWidth={1.75} />}
              >
                <MenuItem
                  icon={<Paperclip width={15} height={15} strokeWidth={1.75} />}
                  onSelect={() => fileInputRef.current?.click()}
                >
                  Attach a file
                </MenuItem>
                {moreActions.map((a) => (
                  <MenuItem key={a.id} icon={a.icon} onSelect={a.onSelect}>
                    {a.label}
                  </MenuItem>
                ))}
              </Menu>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                aria-label="Attach files"
                className={cn(
                  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted md:h-9 md:w-9',
                  'hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                <Paperclip width={18} height={18} strokeWidth={1.75} />
              </button>
            )}
            <div
              ref={fieldRef}
              className={cn('min-w-0 flex-1 rounded-md', fromHelper && 'ring-1 ring-assist-line')}
            >
              <Textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={placeholder}
                aria-label={recipient ? `Message to ${recipient}` : 'Message'}
                aria-keyshortcuts="Control+Enter Meta+Enter"
                disabled={busy}
                // The auto-grow effect above writes an inline `height` off
                // `scrollHeight`, which for one row of `text-base` comes out at
                // 40px — four short of the floor, in the one row where the attach
                // and mic buttons beside it are already 44px squares. `min-height`
                // beats an inline `height`, so the floor holds without fighting the
                // effect. `md:` restores the 36px the desktop row has always drawn.
                // `block`, or the field sits on a text baseline and its frame is
                // 6px taller than it, which drops it below the buttons beside it.
                // The placeholder keeps to one line: a long name wrapped it to
                // four, and the box grew to hold them.
                className={cn(
                  'block min-h-11 min-w-0 resize-none md:min-h-[36px]',
                  !disabled &&
                    'placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap',
                )}
              />
            </div>
            {/* The Reply helper's one tap, in the helper's violet: it never sends,
                it writes a draft in the helper's tab for the admin to read. */}
            {onSuggest ? (
              roomyRow ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  tone="assist"
                  onClick={onSuggest}
                  loading={suggesting}
                  disabled={disabled}
                  title="The helper drafts a reply; nothing is sent"
                  leftIcon={<Wand2 width={16} height={16} strokeWidth={1.75} />}
                  className="shrink-0"
                >
                  Suggest
                </Button>
              ) : (
                <button
                  type="button"
                  onClick={onSuggest}
                  disabled={disabled || suggesting}
                  aria-label="Suggest reply — the helper drafts one, nothing is sent"
                  title="Suggest reply — the helper drafts one; nothing is sent"
                  className={cn(
                    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-assist-line bg-assist-soft text-assist transition-colors duration-150 md:h-9 md:w-9',
                    'hover:bg-assist-line disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                >
                  {suggesting ? <Spinner size={16} /> : <Wand2 width={17} height={17} strokeWidth={1.75} />}
                </button>
              )
            ) : null}
            {hasContent ? (
              // The word "Send" costs ~84px of a 360px row. Below md the glyph
              // alone says it, at the same 44px target; the labelled button is
              // still what a desktop gets.
              isMd ? (
                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={!hasContent || busy}
                  loading={sending}
                  title="Send (Ctrl+Enter)"
                  leftIcon={sending ? null : <Send width={16} height={16} strokeWidth={1.75} />}
                >
                  Send
                </Button>
              ) : (
                <IconButton
                  aria-label="Send"
                  variant="primary"
                  onClick={handleSend}
                  disabled={!hasContent || busy}
                  loading={sending}
                >
                  <Send width={18} height={18} strokeWidth={1.75} />
                </IconButton>
              )
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={busy}
                aria-label="Record voice message"
                className={cn(
                  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted md:h-9 md:w-9',
                  'hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                <Mic width={18} height={18} strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
