import * as React from 'react';
import { Link } from 'react-router-dom';

import {
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  type ButtonSize,
  type ButtonVariant,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { leadName, type ContactPrefill } from '@/lib/leads';
import type { LeadRow } from '@dk/shared';

/** What to tell a person when a request did not go through. */
export function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'That did not go through.';
}

/** What a lead's row can ask for: the forms that open over the page. */
export type LeadAction = 'contact' | 'followUp' | 'assign' | 'note' | 'close' | 'reopen' | 'phone';

/**
 * What opens a form. The third argument is for "Log this call" on a call
 * recording's summary, which opens Log contact already filled in.
 */
export type LeadActionHandler = (
  action: LeadAction,
  lead: LeadRow,
  contactPrefill?: ContactPrefill,
) => void;

/** Which form is open and for whom. `null` is none. */
export interface LeadDialogState {
  action: LeadAction;
  lead: LeadRow;
  /** Only for the Log contact form, opened from a call summary. */
  contactPrefill?: ContactPrefill;
}

/**
 * Who a form is about, at its top: so a form opened from a list of forty leads
 * says which one before the person types anything.
 */
export function LeadBox({ lead }: { lead: Pick<LeadRow, 'name' | 'phone' | 'ref'> }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 text-sm [overflow-wrap:anywhere]">
      <span className="font-medium text-text">{leadName(lead)}</span>
      <span className="text-text-muted"> · {lead.ref}</span>
    </div>
  );
}

const LINK_BASE =
  'inline-flex items-center justify-center whitespace-nowrap rounded-md font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

interface LinkTarget {
  /** An address inside the app. */
  to?: string;
  /** Anything else, such as `tel:`. */
  href?: string;
}

/** One element for both kinds of target: a router `Link` inside the app, so nothing reloads, and a plain anchor for `tel:`. */
function Anchor({
  to,
  href,
  className,
  children,
  ...rest
}: LinkTarget & {
  className: string;
  children: React.ReactNode;
  'aria-label'?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  return to ? (
    <Link to={to} className={className} {...rest}>
      {children}
    </Link>
  ) : (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  );
}

/**
 * A link that looks like a `Button`: "Call" and "WhatsApp" go somewhere (the
 * dialler, the inbox) rather than do something, so they are links, and the
 * browser's own open-in-a-new-tab and long-press-to-copy keep working on them.
 * The paint and the 44px floor are the primitive's own, shared by import.
 */
export function ActionLink({
  to,
  href,
  icon,
  children,
  variant = 'secondary',
  size = 'sm',
}: LinkTarget & {
  icon?: React.ReactNode;
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <Anchor
      to={to}
      href={href}
      className={cn(LINK_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size])}
    >
      {icon}
      <span>{children}</span>
    </Anchor>
  );
}

/**
 * The same, icon only, for a desktop row where a labelled button would not fit.
 * `label` is its only name. `onClick` is for a link inside a clickable row, to
 * keep its click from reaching the row.
 */
export function IconLink({
  to,
  href,
  label,
  onClick,
  children,
}: LinkTarget & {
  label: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  children: React.ReactNode;
}) {
  return (
    <Anchor
      to={to}
      href={href}
      aria-label={label}
      onClick={onClick}
      className={cn(LINK_BASE, BUTTON_VARIANTS.ghost, 'h-11 w-11 md:h-8 md:w-8')}
    >
      {children}
    </Anchor>
  );
}
