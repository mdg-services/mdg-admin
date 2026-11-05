import { Upload } from 'lucide-react';
import * as React from 'react';

import { Button, useToast } from '@/components/ui';
import { useUploadDuOtpPaper } from '@/hooks/api/useDuOtp';
import { resolveFileType } from '@/lib/uploadAttachment';
import {
  DOCUMENT_ASK_MAX_BYTES,
  DOCUMENT_ASK_MIME_TYPES,
  type DuOtpFileSlot,
} from '@dk/shared/schemas';

import { PAPER_ACCEPT, PAPER_LABEL } from './format';

/**
 * One button that picks a file and gives it to a group's slot.
 *
 * The file is checked the moment it is picked — size and kind — because a 12 MB
 * scan over a slow line is a long wait ending in a refusal. The hidden input is
 * cleared straight after every pick, so choosing the same file twice (what
 * somebody does after a failed try) still fires. A failure is a toast; nothing is
 * half-filed, because the group only learns of the file after it is stored.
 */
export function UploadPaperButton({
  dealerId,
  group,
  slot,
  label,
  variant = 'primary',
  disabled,
}: {
  dealerId: string;
  group: string;
  slot: DuOtpFileSlot;
  label: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const toast = useToast();
  const upload = useUploadDuOtpPaper(dealerId);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function onPick(list: FileList | null) {
    const file = list?.item(0) ?? null;
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    const contentType = resolveFileType(file, { assumeImage: false }).contentType;
    if (file.size <= 0) {
      toast.error(`${file.name} is empty.`);
      return;
    }
    if (file.size > DOCUMENT_ASK_MAX_BYTES) {
      toast.error(`${file.name} is larger than 10 MB. Send a smaller scan or photo.`);
      return;
    }
    if (!(DOCUMENT_ASK_MIME_TYPES as readonly string[]).includes(contentType)) {
      toast.error('Send the paper as a PDF, or as a JPEG, PNG or WebP photo.');
      return;
    }
    upload.mutate(
      { group, slot, file },
      {
        onSuccess: () => toast.success(`${PAPER_LABEL[slot]} saved.`),
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
        accept={PAPER_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-label={`Choose the ${PAPER_LABEL[slot].toLowerCase()}`}
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
