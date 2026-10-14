import { Mail, Phone } from 'lucide-react';

import { dialHref, mailtoHref, phoneLabel } from '@/lib/intake';

/**
 * Both ways to reach a person who wrote in from the website: the number is a
 * link that opens the dialler, the email one that opens the mail app.
 *
 * Both pages tell the admin to get in touch themselves, so these are the whole
 * point of the row, not decoration. 44px tall on a phone so a thumb can hit
 * them, ordinary height from md; `select-text` because the app turns selection
 * off everywhere else and a long-press to copy is how a number gets into
 * WhatsApp. If a stranger's text will not make a safe link it is printed as
 * plain text rather than dropped.
 */
const LINK =
  'inline-flex min-h-11 max-w-full select-text items-center gap-1 rounded-sm text-sm text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0';

export function ContactLinks({
  mobile,
  email,
  mailSubject,
}: {
  mobile: string;
  email?: string | null;
  /** Put on the subject line when the mail app opens. */
  mailSubject?: string;
}) {
  const tel = dialHref(mobile);
  const mailto = email ? mailtoHref(email, mailSubject) : null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 text-text-subtle">
      {tel ? (
        <a href={tel} className={`${LINK} tabular-nums`}>
          <Phone width={13} height={13} strokeWidth={1.75} aria-hidden className="shrink-0" />
          {phoneLabel(mobile)}
        </a>
      ) : (
        <span className="select-text text-sm tabular-nums">{phoneLabel(mobile)}</span>
      )}
      {email ? (
        mailto ? (
          <a href={mailto} className={LINK}>
            <Mail width={13} height={13} strokeWidth={1.75} aria-hidden className="shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{email}</span>
          </a>
        ) : (
          <span className="min-w-0 select-text text-sm [overflow-wrap:anywhere]">{email}</span>
        )
      ) : null}
    </p>
  );
}
