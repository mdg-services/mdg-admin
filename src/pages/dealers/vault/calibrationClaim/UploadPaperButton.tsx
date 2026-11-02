import { Upload } from 'lucide-react';
import * as React from 'react';

import { Button, useToast } from '@/components/ui';
import { useUploadClaimPaper } from '@/hooks/api/useCalibrationClaim';
import { resolveFileType } from '@/lib/uploadAttachment';
import type { ClaimUploadSlot } from '@dk/shared';
import { DOCUMENT_ASK_MIME_TYPES } from '@dk/shared/schemas';

import { SLOT_LABEL, claimUploadProblem } from './format';

/** The same files a document ask takes: a PDF, or a JPEG, PNG or WebP photo. */
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';

/**
 * One button that picks a file and files it into a slot of the claim.
 *
 * The file is checked the moment it is picked — size and kind — because a 12 MB
 * scan over a slow line is a long wait ending in a refusal. The hidden input is
 * cleared straight after every pick, so choosing the same file twice (what
 * somebody does after a failed try) still fires. A failure is a toast; nothing is
 * half-filed, because the claim only learns of the file after it is stored.
 */
export function UploadPaperButton({
  dealerId,
  claimId,
  slot,
  label,
  variant = 'secondary',
  disabled,
  onDone,
}: {
  dealerId: string;
  claimId: string;
  slot: ClaimUploadSlot;
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  onDone?: () => void;
}) {
  const toast = useToast();
  const upload = useUploadClaimPaper(dealerId);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function onPick(list: FileList | null) {
    const file = list?.item(0) ?? null;
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    const contentType = resolveFileType(file, { assumeImage: false }).contentType;
    const problem = claimUploadProblem(
      { name: file.name, size: file.size, contentType },
      DOCUMENT_ASK_MIME_TYPES,
    );
    if (problem) {
      toast.error(problem);
      return;
    }
    upload.mutate(
      { claimId, slot, file },
      {
        onSuccess: () => {
          toast.success(`${SLOT_LABEL[slot]} saved.`);
          onDone?.();
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : 'Could not upload the paper.'),
      },
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-label={`Choose the ${SLOT_LABEL[slot].toLowerCase()}`}
        onChange={(e) => onPick(e.target.files)}
      />
      <Button
        variant={variant}
        size="sm"
        loading={upload.isPending}
        disabled={disabled}
        leftIcon={<Upload width={14} height={14} strokeWidth={1.75} />}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </Button>
    </>
  );
}
