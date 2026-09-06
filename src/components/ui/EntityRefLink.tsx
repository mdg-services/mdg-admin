import { Link } from 'react-router-dom';

import { cn } from '@/lib/cn';
import { describeAuditTarget } from '@dk/shared';

/**
 * What an audit row points at, in words, linked to the screen that opens it.
 *
 * The Activity screen used to print `entity` and then a raw 24-character hex
 * string — "DealerService · 68b3f2a19c4d1e0a7b3c9f41". That names nothing a
 * person recognises and goes nowhere.
 *
 * All the judgement lives in `describeAuditTarget` in @dk/shared, which is
 * shared with the server so the two ends cannot disagree about what an entity
 * is called or where it lives, and because @dk/shared is the only side of this
 * pair with a test runner at all.
 *
 * IT WILL NOT INVENT A LINK. `entityId` is not always the entity's own id — the
 * Kavach catalog files global edits as `entity: 'Dealer', entityId: 'GLOBAL'`,
 * a sign-in row stores the typed email, the ledger sweep stores the literal
 * `'sweep'`, and an upload whose key fails to parse stores the whole S3 key. The
 * shared table validates the shape before offering a route, so anything it
 * cannot place renders exactly as it does today: as text.
 */
export function EntityRefLink({
  entity,
  entityId,
  name,
  dealerId,
  className,
}: {
  entity: string;
  entityId: string;
  /** What the server resolved — a dealer code, a person's name. */
  name?: string | null;
  /** The dealer this row is about, when the id is not itself a dealer's. */
  dealerId?: string | null;
  className?: string;
}) {
  const target = describeAuditTarget({ entity, entityId, name, dealerId });

  const body = (
    <>
      {target.text}
      {/* Nothing resolved it, so the id is all there is. Shown, because a row
          that hides its only identifier is harder to chase than an ugly one —
          but set in a monospace face so it stops pretending to be prose. */}
      {target.isRawId ? (
        <span className="ml-1 font-mono text-xs text-text-subtle">{entityId}</span>
      ) : null}
    </>
  );

  if (!target.href) {
    return <span className={cn('text-text-muted', className)}>{body}</span>;
  }
  return (
    <Link
      to={target.href}
      className={cn('text-brand hover:underline', className)}
      title={entityId}
    >
      {body}
    </Link>
  );
}
