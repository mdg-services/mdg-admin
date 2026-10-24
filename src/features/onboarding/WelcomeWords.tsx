import { Check, Copy, MessageCircle } from 'lucide-react';
import * as React from 'react';

import { Button, Label, Textarea, useToast } from '@/components/ui';
import { copyText } from '@/lib/clipboard';
import { dialHref, phoneLabel } from '@/lib/intake';
import { messageLangLabel } from '@/lib/onboarding';
import type { SetupMessageLang } from '@dk/shared';

/**
 * The welcome as words, for a person to send from their own phone: the message,
 * WhatsApp's own link that opens the chat with it ready (`wa.me`), Copy, and a call
 * link. Shown when the server could not send the WhatsApp template itself (no
 * consent on the form, the template not approved, Meta refused), both after Approve
 * and after "Send welcome on WhatsApp".
 *
 * Nothing here records that it was sent: whoever sends it taps "Mark welcome sent
 * by hand" afterwards, so a second person does not send it again.
 */
export function WelcomeWords({
  mobile,
  text,
  waLink,
  lang,
}: {
  mobile: string;
  text: string;
  waLink: string;
  lang: SetupMessageLang;
}) {
  const toast = useToast();
  const textId = React.useId();
  const [copied, setCopied] = React.useState(false);

  async function copyWelcome() {
    if (await copyText(text)) {
      setCopied(true);
      toast.success('Message copied');
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error('Could not copy. Select the message and copy it by hand.');
    }
  }

  return (
    <>
      <div>
        <Label htmlFor={textId}>
          Message to send to {phoneLabel(mobile)}
          <span className="ml-2 text-xs font-normal text-text-subtle">
            in {messageLangLabel(lang)}
          </span>
        </Label>
        <Textarea id={textId} rows={6} readOnly value={text} className="select-text" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* WhatsApp's own link, as the Films page uses: opens the chat with the words ready. */}
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 min-h-11 items-center gap-2 rounded-md bg-success px-4 text-sm font-semibold text-white hover:bg-success/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
        >
          <MessageCircle width={16} height={16} strokeWidth={1.75} aria-hidden />
          Open WhatsApp
        </a>
        <Button
          variant="secondary"
          onClick={() => void copyWelcome()}
          leftIcon={copied ? <Check width={14} height={14} /> : <Copy width={14} height={14} />}
        >
          {copied ? 'Copied' : 'Copy message'}
        </Button>
        {dialHref(mobile) ? (
          <a
            href={dialHref(mobile) ?? undefined}
            className="inline-flex min-h-11 items-center text-sm text-brand underline md:min-h-0"
          >
            Or call them
          </a>
        ) : null}
      </div>
    </>
  );
}
