import { PencilRuler } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui';
import { istTodayYmd } from '@/lib/format';

/**
 * "Correct shift data" — the replacement for the old Receipts button.
 *
 * A receipt used to be the only DSR figure anybody could correct, so it had its
 * own modal. Now every collected IRAS field is correctable in one place, so this
 * is a link to that day in the shift data editor rather than a dialog. Same
 * props and the same four call sites, so a DSR screen still offers the fix
 * exactly where it always did: beside the date picker, and in the empty state of
 * a dealer with no report yet.
 *
 * Without a date (the empty state) it opens today, which is what the receipts
 * dialog defaulted to.
 */
export function EditShiftDataButton({
  dealerId,
  businessDate,
  className,
}: {
  dealerId: string;
  /** The day to open. Defaults to today (IST), as the old dialog did. */
  businessDate?: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const date = businessDate ?? istTodayYmd();
  return (
    <Button
      variant="secondary"
      size="sm"
      className={className}
      leftIcon={<PencilRuler width={14} height={14} strokeWidth={1.75} />}
      onClick={(e) => {
        // These sit inside clickable rows in two of the four call sites.
        e.stopPropagation();
        navigate(`/data-vault/dealers/${dealerId}/days/${date}`);
      }}
    >
      Correct shift data
    </Button>
  );
}
