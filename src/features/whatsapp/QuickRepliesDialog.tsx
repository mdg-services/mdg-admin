import { Pencil, Plus, Trash2, Zap } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { FieldError, Label } from '@/components/ui/Label';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import {
  useCreateQuickReply,
  useDeleteQuickReply,
  useUpdateQuickReply,
  useWhatsAppQuickReplies,
} from '@/hooks/api/useWhatsAppInbox';
import { WHATSAPP_TEXT_MAX_LENGTH, type WhatsAppQuickReply } from '@dk/shared';

import { errorWords, SHORTCUT_PATTERN } from './format';

const SHORTCUT_RULE = 'Lowercase letters, numbers and dashes, up to 32 characters. Start with a letter or number.';

interface Draft {
  /** Null while adding a new one. */
  id: string | null;
  shortcut: string;
  text: string;
}

/** A shortcut as a person types it: no slash, no capitals. */
function cleanShortcut(raw: string): string {
  return raw.trim().replace(/^\/+/, '').toLowerCase();
}

export interface QuickRepliesDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The saved answers an admin drops into a chat by typing "/" and a shortcut.
 * Shared by the whole team: one person's "/price" is everyone's.
 */
export function QuickRepliesDialog({ open, onClose }: QuickRepliesDialogProps) {
  const toast = useToast();
  const list = useWhatsAppQuickReplies();
  const create = useCreateQuickReply();
  const update = useUpdateQuickReply();
  const remove = useDeleteQuickReply();
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [toDelete, setToDelete] = React.useState<WhatsAppQuickReply | null>(null);
  const id = React.useId();
  const busy = create.isPending || update.isPending;

  React.useEffect(() => {
    if (!open) {
      setDraft(null);
      setError(null);
      setToDelete(null);
    }
  }, [open]);

  const shortcut = draft ? cleanShortcut(draft.shortcut) : '';
  const shortcutBad = draft !== null && draft.shortcut.trim() !== '' && !SHORTCUT_PATTERN.test(shortcut);
  const textTooLong = draft !== null && draft.text.length > WHATSAPP_TEXT_MAX_LENGTH;
  const canSave = draft !== null && SHORTCUT_PATTERN.test(shortcut) && draft.text.trim() !== '' && !textTooLong;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !canSave || busy) return;
    setError(null);
    try {
      const body = { shortcut, text: draft.text.trim() };
      if (draft.id) await update.mutateAsync({ id: draft.id, ...body });
      else await create.mutateAsync(body);
      toast.success(draft.id ? 'Quick reply saved.' : 'Quick reply added.');
      setDraft(null);
    } catch (err) {
      setError(errorWords(err));
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id);
      toast.success('Quick reply deleted.');
      setToDelete(null);
    } catch (err) {
      toast.error(errorWords(err));
      setToDelete(null);
    }
  }

  const items = list.data ?? [];

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Quick replies"
        description="Type / in a chat, then the shortcut, to drop the answer in. Everyone on the team shares these."
        size="lg"
        footer={
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        }
      >
        {draft ? (
          <form id={`${id}-form`} onSubmit={(e) => void save(e)} className="mb-4 space-y-3 rounded-md border border-border p-3">
            <div>
              <Label htmlFor={`${id}-shortcut`} hint={SHORTCUT_RULE}>
                Shortcut
              </Label>
              <div className="flex items-center gap-1">
                <span aria-hidden className="text-base font-semibold text-text-muted">
                  /
                </span>
                <Input
                  id={`${id}-shortcut`}
                  value={draft.shortcut}
                  maxLength={33}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="price"
                  invalid={shortcutBad}
                  onChange={(e) => setDraft({ ...draft, shortcut: e.target.value })}
                />
              </div>
              <FieldError message={shortcutBad ? SHORTCUT_RULE : undefined} />
            </div>
            <div>
              <Label htmlFor={`${id}-text`}>Answer</Label>
              <Textarea
                id={`${id}-text`}
                rows={4}
                value={draft.text}
                invalid={textTooLong}
                placeholder="The words that will be dropped into the box"
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              />
              <FieldError
                message={textTooLong ? `Too long: a message can be ${WHATSAPP_TEXT_MAX_LENGTH.toLocaleString('en-IN')} characters at most.` : undefined}
              />
            </div>
            <FieldError message={error ?? undefined} />
            <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
              <Button variant="secondary" onClick={() => setDraft(null)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave} loading={busy}>
                {draft.id ? 'Save changes' : 'Add quick reply'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="mb-3">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Plus width={14} height={14} strokeWidth={2} />}
              onClick={() => {
                setError(null);
                setDraft({ id: null, shortcut: '', text: '' });
              }}
            >
              Add quick reply
            </Button>
          </div>
        )}

        {list.isLoading ? (
          <div aria-hidden className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : list.isError ? (
          <EmptyState
            title="Could not load the quick replies"
            description="This does not mean there are none. Check the connection and try again."
            cta={
              <Button size="sm" variant="secondary" onClick={() => void list.refetch()}>
                Try again
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Zap width={28} height={28} strokeWidth={1.5} />}
            title="No quick replies yet"
            description="Add the answers you give again and again — prices, timings, how to register."
          />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {items.map((r) => (
              <li key={r.id} className="flex items-start gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text">/{r.shortcut}</p>
                  <p className="line-clamp-2 text-sm text-text-muted [overflow-wrap:anywhere]">{r.text}</p>
                </div>
                <IconButton
                  aria-label={`Edit /${r.shortcut}`}
                  size="sm"
                  onClick={() => {
                    setError(null);
                    setDraft({ id: r.id, shortcut: r.shortcut, text: r.text });
                  }}
                >
                  <Pencil width={15} height={15} strokeWidth={1.75} />
                </IconButton>
                <IconButton aria-label={`Delete /${r.shortcut}`} size="sm" onClick={() => setToDelete(r)}>
                  <Trash2 width={15} height={15} strokeWidth={1.75} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
        title={`Delete /${toDelete?.shortcut ?? ''}?`}
        description="It disappears for the whole team. Messages already sent are not touched."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={remove.isPending}
      />
    </>
  );
}
