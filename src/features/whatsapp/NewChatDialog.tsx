import { Link2, SendHorizontal } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { FieldError, Label } from '@/components/ui/Label';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { newClientId, useNewWhatsAppChat } from '@/hooks/api/useWhatsAppInbox';
import { cn } from '@/lib/cn';
import { renderSimpleTemplate, type WhatsAppInboxConfig, type WhatsAppLine } from '@dk/shared';

import {
  describeSendError,
  indianMobile,
  linkLabel,
  NEW_CHAT_WRONG_NUMBER,
  newChatTitle,
  OUT_OF_DATE_WORDS,
  planSend,
  readLink,
  repeatWarning,
  sendButtonLabel,
  serverSendsFrom,
} from './format';
import { FromStrip } from './LineMark';

export interface NewChatDialogProps {
  /** The inbox the admin is in: the chat is started from this number, and there is no choice in here. */
  line: WhatsAppLine;
  open: boolean;
  onClose: () => void;
  config: WhatsAppInboxConfig | undefined;
  /** Open the new chat. */
  onStarted: (person: string) => void;
}

/**
 * Message somebody who is not in the inbox yet — from the number of the inbox
 * the admin is in. There is deliberately no number picker in here: the inbox
 * decides, the strip at the top says which, and a line of help says how to
 * change it (close this and switch at the top of the list).
 *
 * A number nobody has written to us from is outside the 24-hour window by
 * definition, so the message can only go in the greeting template — and the
 * dialog says so up front and shows the finished message, rather than
 * surprising the admin with a sign-off they did not write.
 *
 * The number is checked loosely here as a courtesy; the server is the authority
 * and its refusal (not a mobile, on the stop list, sending switched off) is
 * shown in the same place, in its own words.
 *
 * One id goes with the message for as long as the answer is in doubt. The
 * server sends an id once, so pressing Send again after a reply that never
 * came (the connection dropped, a gateway returned an error page) cannot
 * message the number twice: it gets the first try's answer. The id is dropped
 * when the server has given a final answer, when the words or the number are
 * changed (a different message), and when the dialog opens again. And when the
 * outcome is unsure, Send is not left open for a blind second go: the dialog
 * closes and the chat opens, where the unsure message is.
 *
 * A link is optional, and offered only once the server says its template is
 * approved. With one, the message goes in the link template: the same words,
 * and a button that opens the link through our own address, so each tap is
 * counted on the Message results page.
 *
 * Words with their own greeting or sign-off stop Send, as in the chat's box:
 * the template already has both, so a warning offers to take them out, or to
 * send anyway.
 */
export function NewChatDialog({ line, open, onClose, config, onStarted }: NewChatDialogProps) {
  const start = useNewWhatsAppChat();
  const [phone, setPhone] = React.useState('');
  const [name, setName] = React.useState('');
  const [text, setText] = React.useState('');
  const [linkValue, setLinkValue] = React.useState('');
  const [phoneTouched, setPhoneTouched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();
  // The id of the message being sent; null until Send is first pressed.
  const clientIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    clientIdRef.current = null;
    setPhone('');
    setName('');
    setText('');
    setLinkValue('');
    setPhoneTouched(false);
    setError(null);
    start.reset();
    // Only when it opens: `start` is a new object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const number = indianMobile(phone);
  const linkTemplate = config?.linkTemplate ?? null;
  const link = linkTemplate ? readLink(linkValue) : ({ state: 'none' } as const);
  const linked = link.state === 'ok';
  const plan = config ? planSend(text, 'template', config, linked) : null;
  const sendingOff = config ? !config.sendingEnabled : false;
  // A server older than this page would start the chat from a number it picks itself.
  const outOfDate = config ? !serverSendsFrom(config, line) : false;
  const ready =
    number !== null &&
    text.trim().length > 0 &&
    plan !== null &&
    !plan.tooLong &&
    !sendingOff &&
    !outOfDate &&
    link.state !== 'bad';
  const repeat = config ? repeatWarning(text, 'template') : null;

  /** `keepRepeats` only from "Send anyway": past the warning, on purpose. */
  async function submit(keepRepeats: boolean) {
    if (!ready || start.isPending || (repeat !== null && !keepRepeats)) return;
    setError(null);
    const clientId = (clientIdRef.current ??= newClientId());
    // Where the chat will be, for an unsure answer: the number as the server
    // keys it (91 and ten digits), taken now in case the box is edited meanwhile.
    const person = number;
    try {
      const result = await start.mutateAsync({
        line,
        phone: number,
        name: name.trim() === '' ? null : name.trim(),
        text: text.trim(),
        clientId,
        ...(link.state === 'ok' ? { link: link.target } : {}),
        ...(keepRepeats ? { keepRepeats: true } : {}),
      });
      onStarted(result.person);
      onClose();
    } catch (err) {
      const failure = describeSendError(err);
      if (failure.kind === 'unknown') {
        // It may have gone. Show the chat, not a Send button: its "Not sure this
        // went" bubble says the rest, and a toast here would sit over the composer.
        onStarted(person);
        onClose();
        return;
      }
      // A final answer spends the id; silence keeps it, so the next press asks the same question again.
      if (!failure.networkLost) clientIdRef.current = null;
      setError(failure.text);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={start.isPending ? () => undefined : onClose}
      title={newChatTitle(line)}
      description="Start a conversation with somebody who has not written to us."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={start.isPending}>
            Cancel
          </Button>
          <button
            type="submit"
            form={`${id}-form`}
            data-line={line}
            disabled={!ready || repeat !== null || start.isPending}
            aria-label={sendButtonLabel(line)}
            // The number's colour, not the app's: the button says whose number this leaves from.
            className="wa-line inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--line)] px-4 text-sm font-semibold text-white transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 disabled:opacity-45 md:min-h-9"
          >
            {start.isPending ? (
              <Spinner size={16} />
            ) : (
              <SendHorizontal width={16} height={16} strokeWidth={2} aria-hidden />
            )}
            {sendButtonLabel(line)}
          </button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
        className="space-y-4"
      >
        <div>
          <FromStrip line={line} />
          <p className="mt-1 px-1 text-xs text-text-muted">{NEW_CHAT_WRONG_NUMBER}</p>
        </div>

        {sendingOff ? (
          <Callout intent="warning">Sending is switched off on the server, so nothing can be sent from here yet.</Callout>
        ) : outOfDate ? (
          <Callout intent="warning">{OUT_OF_DATE_WORDS}</Callout>
        ) : null}

        <div>
          <Label htmlFor={`${id}-phone`} required>
            Mobile number
          </Label>
          <Input
            id={`${id}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            autoFocus
            value={phone}
            placeholder="98000 00001"
            invalid={phoneTouched && phone.trim() !== '' && number === null}
            onChange={(e) => {
              setPhone(e.target.value);
              clientIdRef.current = null;
            }}
            onBlur={() => setPhoneTouched(true)}
          />
          <FieldError
            message={
              phoneTouched && phone.trim() !== '' && number === null
                ? 'That does not look like an Indian mobile number. It should have ten digits and start with 6, 7, 8 or 9.'
                : undefined
            }
          />
        </div>

        <div>
          <Label htmlFor={`${id}-name`} hint="Optional">
            Name
          </Label>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={100}
            autoComplete="off"
            placeholder="So the chat has a name"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor={`${id}-text`} required>
            Message
          </Label>
          <Textarea
            id={`${id}-text`}
            rows={4}
            value={text}
            invalid={plan?.tooLong ?? false}
            placeholder="What you want to tell them"
            onChange={(e) => {
              setText(e.target.value);
              clientIdRef.current = null;
            }}
          />
          {plan?.showCounter ? (
            <p className={cn('mt-1 text-right text-xs tabular-nums', plan.tooLong ? 'font-medium text-danger-strong' : 'text-text-subtle')}>
              {plan.used.toLocaleString('en-IN')} / {plan.limit.toLocaleString('en-IN')}
            </p>
          ) : null}
          {repeat ? (
            <div role="alert" className="mt-2">
              <Callout intent="warning">{repeat.text}</Callout>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {repeat.fixed !== null ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setText(repeat.fixed ?? '');
                      clientIdRef.current = null;
                    }}
                  >
                    {repeat.removeLabel}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!ready || start.isPending}
                  onClick={() => void submit(true)}
                >
                  Send anyway
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {linkTemplate ? (
          <div>
            <Label htmlFor={`${id}-link`} hint="Optional">
              Link
            </Label>
            <Input
              id={`${id}-link`}
              // Text, not "url": the browser's own check refuses an address
              // typed without https://, which is how people type them.
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={linkValue}
              placeholder="mdgservices.in/film"
              invalid={link.state === 'bad'}
              onChange={(e) => {
                setLinkValue(e.target.value);
                clientIdRef.current = null;
              }}
            />
            {link.state === 'bad' ? (
              <FieldError message="That is not a web address. Paste the whole link, like https://mdgservices.in/film." />
            ) : (
              <p className="mt-1 text-xs text-text-muted">
                They get a button that opens it. We count each tap, and who comes back to it, on the Message results
                page.
              </p>
            )}
          </div>
        ) : null}

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">What they will receive</p>
          <div className="wa-scope wa-wallpaper rounded-lg p-3">
            <div className="ml-auto max-w-[90%] rounded-lg bg-[var(--wa-out)] px-2.5 py-1.5 text-[14.2px] leading-[19px] text-[var(--wa-text)] shadow-sm">
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                {text.trim() ? renderSimpleTemplate(text) : renderSimpleTemplate('…')}
              </p>
            </div>
            {linked && linkTemplate ? (
              <div className="ml-auto mt-0.5 flex max-w-[90%] items-center justify-center gap-1.5 rounded-lg bg-[var(--wa-out)] py-2 text-sm font-medium text-[var(--wa-link)] shadow-sm">
                <Link2 width={14} height={14} strokeWidth={2} aria-hidden />
                {linkTemplate.button}
              </div>
            ) : config?.template.button ? (
              <div className="ml-auto mt-0.5 max-w-[90%] rounded-lg bg-[var(--wa-out)] py-2 text-center text-sm font-medium text-[var(--wa-link)] shadow-sm">
                {config.template.button}
              </div>
            ) : null}
          </div>
          {link.state === 'ok' ? (
            <p className="mt-1.5 text-xs text-text-muted [overflow-wrap:anywhere]">
              The button opens {linkLabel(link.target)}.
            </p>
          ) : null}
          <p className="mt-1.5 text-xs text-text-muted">
            Somebody new has not written to us in the last 24 hours, so WhatsApp only lets this go in the greeting
            template. {plan?.joinsLines ? 'Line breaks in your message become one paragraph.' : ''}
          </p>
        </div>

        <FieldError message={error ?? undefined} />
      </form>
    </Dialog>
  );
}
