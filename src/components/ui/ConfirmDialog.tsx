import * as React from 'react';

import { Button } from './Button';
import { Dialog } from './Dialog';

/**
 * "Are you sure?" as a real overlay.
 *
 * Two destructive actions in this app are gated on `window.confirm()` — the
 * portal-credential and SDMS-credential delete buttons. Inside the Expo WebView
 * that is not a dialog we own: it is an OS alert with no theme, no safe-area
 * handling, and — the part that matters — a button that may never be answered
 * at all. Android only shows it if the host's `WebChromeClient` implements
 * `onJsConfirm`; when it does not, `confirm()` returns false and the delete
 * silently does nothing, which reads as a dead button.
 *
 * Meanwhile three other screens hand-rolled this exact Dialog shape, and they
 * had already drifted on button order and on whether the destructive action was
 * red. Going through `Dialog` means all of them inherit the bottom sheet, the
 * internal scroll, the footer that stays above the keyboard and the safe area,
 * and the Escape/backdrop dismissal, for free.
 *
 * `onCancel` is also what the backdrop and Escape call, so a confirm is never
 * a trap: the only way to reach `onConfirm` is the confirm button itself.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  /**
   * Panel width at md+, passed to `Dialog`. `'sm'` is right for a one-sentence
   * "are you sure?"; pass `'md'` when you are replacing a hand-rolled confirm
   * that was already `max-w-lg`, so the migration is a no-op at ≥ md — three
   * dialogs in this app narrowed by adopting the primitive before this existed.
   */
  size?: 'sm' | 'md' | 'lg';
  /** Spinner on the confirm button; both buttons go inert while it is true. */
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  size = 'sm',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      // While the action is in flight, a backdrop tap or Escape would close the
      // dialog over a request that is still going to land. Ignore both until it
      // settles; the caller closes it from its own success/failure handler.
      onClose={loading ? () => {} : onCancel}
      title={title}
      size={size}
      footer={
        // Dialog's own footer stacks these full-width below md and lays them
        // out as the right-aligned row it has always been at md, so there is
        // nothing to arrange here beyond the order. Cancel first in the DOM,
        // which flex-col-reverse puts second on a phone — the destructive
        // action is not the one under a thumb reaching up from the bottom.
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description != null ? (
        <div className="text-sm leading-relaxed text-text-muted">
          {description}
        </div>
      ) : null}
    </Dialog>
  );
}
