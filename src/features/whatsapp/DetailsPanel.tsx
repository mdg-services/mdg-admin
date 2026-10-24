import { Check, Copy, Pencil, Phone, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { LeadLookupLine } from '@/features/leads/LeadLookupLine';
import { usePatchWhatsAppChat } from '@/hooks/api/useWhatsAppInbox';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import {
  WHATSAPP_STAGE_LABELS,
  WHATSAPP_STAGES,
  type WhatsAppChatDetail,
  type WhatsAppChatPatch,
  type WhatsAppStage,
} from '@dk/shared';

import { ChatAvatar } from './ChatAvatar';
import { chatTitle, dialHref, errorWords, fullDateTime, hasName, headerStatus, phoneLabel } from './format';

/** What the note and the name are capped at here; the server is the authority and says so if it disagrees. */
const NOTE_MAX = 2000;
const NAME_MAX = 100;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-4 py-3">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-subtle">{title}</h3>
      {children}
    </section>
  );
}

export interface DetailsContentProps {
  person: string;
  detail: WhatsAppChatDetail;
  now: number;
}

/**
 * Everything about one person that does not fit in a chat: what we call them,
 * where they stand with us, a private note for the team, and the plain facts
 * about the stop list and about which of our numbers answers them.
 *
 * Every edit goes to the server as it is made — the name when it is confirmed,
 * the stage when it is picked, the note when the box loses focus or Ctrl/Cmd+Enter
 * is pressed — and each says in words when it did not take.
 */
export function DetailsContent({ person, detail, now }: DetailsContentProps) {
  const toast = useToast();
  const patch = usePatchWhatsAppChat();
  const { chat } = detail;
  const named = hasName(chat);

  function save(body: WhatsAppChatPatch, done?: () => void) {
    patch.mutate(
      { person, patch: body },
      {
        onSuccess: done,
        onError: (e) => toast.error(errorWords(e)),
      },
    );
  }

  // ── the name ──
  const [editing, setEditing] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState('');
  function startEdit() {
    setNameDraft(chat.name ?? '');
    setEditing(true);
  }
  function commitName() {
    const next = nameDraft.trim();
    if (next === (chat.name ?? '')) {
      setEditing(false);
      return;
    }
    save({ name: next === '' ? null : next }, () => setEditing(false));
  }

  // ── the private note ──
  const [note, setNote] = React.useState(detail.note ?? '');
  const [noteState, setNoteState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const noteFocused = React.useRef(false);
  const savedNote = detail.note ?? '';
  React.useEffect(() => {
    // Changed on another screen: follow it, unless this one is being typed in.
    if (!noteFocused.current) setNote(savedNote);
  }, [savedNote]);
  React.useEffect(() => {
    if (noteState !== 'saved') return;
    const t = window.setTimeout(() => setNoteState('idle'), 2000);
    return () => window.clearTimeout(t);
  }, [noteState]);
  function saveNote() {
    if (note === savedNote) return;
    setNoteState('saving');
    patch.mutate(
      { person, patch: { note: note.trim() === '' ? null : note } },
      {
        onSuccess: () => setNoteState('saved'),
        onError: (e) => {
          setNoteState('error');
          toast.error(errorWords(e));
        },
      },
    );
  }

  const status = headerStatus(chat, detail.reply, now);

  return (
    <div className="pb-4">
      <div className="flex flex-col items-center px-4 pb-4 pt-2 text-center">
        <ChatAvatar person={person} name={named ? chat.name : null} size={96} />

        {editing ? (
          <form
            className="mt-3 flex w-full items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              commitName();
            }}
          >
            <Input
              value={nameDraft}
              maxLength={NAME_MAX}
              autoFocus
              aria-label="Name"
              placeholder="Name"
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditing(false);
                }
              }}
            />
            <IconButton type="submit" aria-label="Save name" variant="primary" loading={patch.isPending}>
              <Check width={16} height={16} strokeWidth={2} />
            </IconButton>
            <IconButton aria-label="Cancel" onClick={() => setEditing(false)}>
              <X width={16} height={16} strokeWidth={2} />
            </IconButton>
          </form>
        ) : (
          <div className="mt-3 flex max-w-full items-center gap-1">
            <h3 className={cn('min-w-0 text-xl font-medium text-text [overflow-wrap:anywhere]', !named && 'tabular-nums')}>
              {chatTitle(chat)}
            </h3>
            <IconButton aria-label="Edit name" size="sm" onClick={startEdit}>
              <Pencil width={15} height={15} strokeWidth={1.75} />
            </IconButton>
          </div>
        )}

        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-1 text-sm text-text-muted">
          {chat.phone ? (
            <>
              <a
                href={dialHref(chat.phone)}
                className="inline-flex min-h-11 select-text items-center gap-1.5 rounded-sm tabular-nums text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
              >
                <Phone width={13} height={13} strokeWidth={1.75} aria-hidden />
                {phoneLabel(chat.phone)}
              </a>
              <IconButton
                aria-label="Copy number"
                size="sm"
                onClick={async () => {
                  if (chat.phone && (await copyText(`+${chat.phone}`))) toast.success('Number copied');
                  else toast.error('Could not copy');
                }}
              >
                <Copy width={14} height={14} strokeWidth={1.75} />
              </IconButton>
            </>
          ) : (
            <span>{phoneLabel(null)}</span>
          )}
        </div>
        {chat.profileName && chat.profileName !== chat.name ? (
          <p className="mt-0.5 text-sm text-text-muted [overflow-wrap:anywhere]">“{chat.profileName}” on WhatsApp</p>
        ) : null}
        {chat.source ? <p className="mt-0.5 text-xs text-text-subtle">{chat.source}</p> : null}
      </div>

      {/* A line only when this chat is on the Leads page; nothing otherwise. */}
      <LeadLookupLine person={person} />

      <Section title="Stage">
        <Select
          aria-label="Stage"
          value={chat.stage ?? ''}
          disabled={patch.isPending}
          onChange={(e) => save({ stage: e.target.value === '' ? null : (e.target.value as WhatsAppStage) })}
        >
          <option value="">No stage</option>
          {WHATSAPP_STAGES.map((s) => (
            <option key={s} value={s}>
              {WHATSAPP_STAGE_LABELS[s]}
            </option>
          ))}
        </Select>
      </Section>

      <Section title="Private note">
        <Textarea
          rows={4}
          value={note}
          maxLength={NOTE_MAX}
          aria-label="Private note for the team"
          placeholder="Only your team sees this. They are never sent it."
          onChange={(e) => {
            setNote(e.target.value);
            if (noteState !== 'idle') setNoteState('idle');
          }}
          onFocus={() => {
            noteFocused.current = true;
          }}
          onBlur={() => {
            noteFocused.current = false;
            saveNote();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              saveNote();
            }
          }}
        />
        <p
          aria-live="polite"
          className={cn('mt-1 h-4 text-xs', noteState === 'error' ? 'text-danger-strong' : 'text-text-subtle')}
        >
          {noteState === 'saving'
            ? 'Saving…'
            : noteState === 'saved'
              ? 'Saved'
              : noteState === 'error'
                ? 'Not saved. Try again.'
                : 'Saves when you click away, or press Ctrl/Cmd+Enter.'}
        </p>
      </Section>

      <Section title="Messaging">
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs text-text-subtle">Stop list</dt>
            <dd className="text-text">
              {chat.optedOut
                ? 'On the stop list. They asked us to stop promotions, so no template message can go to them. They can still be answered while their 24-hour window is open.'
                : chat.unplacedStop
                  ? 'They asked us to stop, but WhatsApp did not share their number, so nothing is on the stop list for them. Leave them off the next send by hand.'
                  : 'Not on the stop list.'}
            </dd>
          </div>
          {status ? (
            <div>
              <dt className="text-xs text-text-subtle">Reply window</dt>
              <dd className="text-text">{status.text}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-text-subtle">Replies go from</dt>
            <dd className="text-text">{detail.reply.numberLabel}</dd>
          </div>
          {detail.firstAt ? (
            <div>
              <dt className="text-xs text-text-subtle">First contact</dt>
              <dd className="text-text">{fullDateTime(detail.firstAt)}</dd>
            </div>
          ) : null}
        </dl>
      </Section>

      <Section title="Known as">
        {detail.knownAs.length === 0 ? (
          <p className="text-sm text-text-muted">No other names on file.</p>
        ) : (
          <ul className="space-y-1.5">
            {detail.knownAs.map((k) => (
              <li key={`${k.name}|${k.source}`} className="text-sm [overflow-wrap:anywhere]">
                <span className="text-text">{k.name}</span>
                <span className="text-text-subtle"> · {k.source}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** The panel's heading row, for the inline column; the drawer brings its own. */
export function DetailsHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <IconButton aria-label="Close contact info" onClick={onClose}>
        <X width={18} height={18} strokeWidth={1.75} />
      </IconButton>
      <h2 className="text-base font-semibold text-text">Contact info</h2>
    </div>
  );
}

/** The panel's "retry" when its chat could not be loaded. */
export function DetailsUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-4 py-6 text-center">
      <p className="text-sm text-text-muted">Could not load this person’s details.</p>
      <Button size="sm" variant="secondary" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
