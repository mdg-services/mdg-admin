import { Check } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { FieldError, Label } from '@/components/ui/Label';
import { cn } from '@/lib/cn';
import { WHATSAPP_STAGE_LABELS, WHATSAPP_STAGES, type WhatsAppStage } from '@dk/shared';

import { errorWords } from './format';

export interface RenameDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * The name SAVED in the inbox, if any — not the name the chat is shown under,
   * which may be a campaign list's, a registration's or WhatsApp's own.
   */
  current: string | null;
  /** Save it; an empty name clears it, so the automatic name is used again. Rejects with the server's words. */
  onSave: (name: string | null) => Promise<unknown>;
}

/**
 * What the chat is called in the list and the header. Leaving it empty drops
 * the saved name, and the chat goes back to the name we work out ourselves.
 */
export function RenameDialog({ open, onClose, current, onSave }: RenameDialogProps) {
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();

  // Each time it opens it starts from what is saved, not from what was typed last time.
  React.useEffect(() => {
    if (open) {
      setName(current ?? '');
      setError(null);
    }
  }, [open, current]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next = name.trim() === '' ? null : name.trim();
    // Nothing changed — or nothing was saved and nothing was typed: no request.
    if (next === current) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
      onClose();
    } catch (err) {
      setError(errorWords(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Edit name"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={(e) => void submit(e)}>
        <Label htmlFor={`${id}-name`} hint="Leave empty to go back to the automatic name">
          Name
        </Label>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={100}
          autoFocus
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
        <FieldError message={error ?? undefined} />
      </form>
    </Dialog>
  );
}

export interface StageDialogProps {
  open: boolean;
  onClose: () => void;
  current: WhatsAppStage | null;
  /** Save it; null clears the stage. Rejects with the server's words. */
  onSave: (stage: WhatsAppStage | null) => Promise<unknown>;
}

/** Where this lead stands. One tap picks it and closes. */
export function StageDialog({ open, onClose, current, onSave }: StageDialogProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) setError(null);
  }, [open]);

  async function choose(stage: WhatsAppStage | null) {
    if (busy) return;
    if (stage === current) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(stage);
      onClose();
    } catch (err) {
      setError(errorWords(err));
    } finally {
      setBusy(false);
    }
  }

  const options: Array<{ value: WhatsAppStage | null; label: string }> = [
    ...WHATSAPP_STAGES.map((s) => ({ value: s, label: WHATSAPP_STAGE_LABELS[s] })),
    { value: null, label: 'No stage' },
  ];

  return (
    <Dialog open={open} onClose={busy ? () => undefined : onClose} title="Set stage" size="sm" bodyPadding="none">
      <ul>
        {options.map((o) => {
          const selected = o.value === current;
          return (
            <li key={o.value ?? 'none'}>
              <button
                type="button"
                disabled={busy}
                aria-pressed={selected}
                onClick={() => void choose(o.value)}
                className={cn(
                  'flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm hover:bg-surface-2 disabled:opacity-60',
                  'focus-visible:bg-surface-2 focus-visible:outline-none',
                  selected ? 'font-semibold text-brand' : 'text-text',
                )}
              >
                <span className="min-w-0 flex-1">{o.label}</span>
                {selected ? <Check width={16} height={16} strokeWidth={2} aria-hidden /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {error ? (
        <div className="px-4 pb-3">
          <FieldError message={error} />
        </div>
      ) : null}
    </Dialog>
  );
}
