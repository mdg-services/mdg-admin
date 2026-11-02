import { Send } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Input,
  Label,
  Spinner,
  useToast,
} from '@/components/ui';
import { useAnswerLiveCaptcha } from '@/hooks/api/useCalibrationClaim';
import { ApiError } from '@/lib/api';
import { formatTime } from '@/lib/format';
import type { LiveCaptchaView } from '@dk/shared';

/**
 * A picture code the robot could not read, waiting for a person.
 *
 * The robot is stopped in the middle of the eMaaptaul sign-in, holding the page
 * open, and the code on that page has a time limit — so this is the first thing
 * on the pane while it exists, and the pane re-reads every few seconds so it
 * appears as soon as it is needed and goes when it has been answered.
 *
 * What was typed is sent once per picture. After Send the box stops taking input
 * and says it is waiting: sending a second guess for the same picture would only
 * be refused, and the box is gone on its own when the portal moves on.
 */
export function LiveCaptchaBox({
  dealerId,
  captcha,
}: {
  dealerId: string;
  captcha: LiveCaptchaView;
}) {
  const toast = useToast();
  const answer = useAnswerLiveCaptcha(dealerId);
  const [text, setText] = React.useState('');
  const [sentFor, setSentFor] = React.useState<string | null>(null);

  // A new picture is a new question: start it empty and open.
  React.useEffect(() => {
    setText('');
    setSentFor(null);
  }, [captcha.sessionId]);

  const sent = sentFor === captcha.sessionId;
  const trimmed = text.trim();

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || sent) return;
    answer.mutate(
      { sessionId: captcha.sessionId, answer: trimmed },
      {
        onSuccess: () => {
          setSentFor(captcha.sessionId);
          toast.success('Sent. The robot carries on from here.');
        },
        onError: (err) =>
          toast.error(
            err instanceof ApiError ? err.message : 'Could not send the code. Please try again.',
          ),
      },
    );
  }

  return (
    <Card className="border-warning">
      <CardHeader padding="comfortable">
        <div>
          <CardTitle>Type the code in the picture</CardTitle>
          <CardSubtitle>
            The robot could not read it. The site waits until {formatTime(captcha.expiresAt)}.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSend} className="grid gap-3 md:max-w-md" noValidate>
          <img
            src={captcha.imageUrl}
            alt="The picture code from the Bihar weights and measures site"
            className="min-h-14 max-h-28 w-full max-w-xs rounded-md border border-border bg-white object-contain p-2"
          />
          {sent ? (
            <Callout intent="info">
              <span className="inline-flex items-center gap-2">
                <Spinner size={14} /> Sent. Waiting for the site to accept it.
              </span>
            </Callout>
          ) : (
            <>
              <div>
                <Label htmlFor="live-captcha">The letters and numbers you see</Label>
                {/* An identifier, not a word: no capital on the first letter, no
                    autocorrect, no suggestion bar to change what was read. */}
                <Input
                  id="live-captcha"
                  value={text}
                  maxLength={12}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={answer.isPending}
                  onChange={(e) => setText(e.target.value)}
                />
              </div>
              <div>
                <Button
                  type="submit"
                  loading={answer.isPending}
                  disabled={!trimmed}
                  leftIcon={<Send width={16} height={16} strokeWidth={1.75} />}
                >
                  Send
                </Button>
              </div>
            </>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
