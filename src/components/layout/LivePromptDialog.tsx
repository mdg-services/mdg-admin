import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button, Dialog } from '@/components/ui';
import { LiveCaptchaForm } from '@/pages/dealers/vault/calibrationClaim/LiveCaptchaBox';
import {
  claimPaneHref,
  livePromptWords,
  timeLeftWords,
} from '@/pages/dealers/vault/calibrationClaim/livePrompt';
import type { LiveCaptchaPrompt } from '@dk/shared';

/**
 * The pop-up itself: which outlet and claim, why, the time left, and the box.
 * Loaded only when a code is waiting (see `LiveCaptchaPrompts`), because it
 * brings the claim pane's form with it.
 *
 * It opens by itself, while the admin may be typing somewhere else, so it never
 * takes the keyboard on its own: the field is focused only when the admin opened
 * it from the banner (`focusField`). A tap on the backdrop does not close it;
 * the X, Escape and "Later" do, and "Later" leaves the banner.
 */
export function LivePromptDialog({
  prompt,
  meId,
  now,
  focusField,
  onLater,
}: {
  prompt: LiveCaptchaPrompt;
  meId: string | null;
  now: number;
  focusField: boolean;
  onLater: () => void;
}) {
  const navigate = useNavigate();
  const words = livePromptWords(prompt, meId);
  return (
    <Dialog
      open
      onClose={onLater}
      dismissOnBackdrop={false}
      size="sm"
      title={words.title}
      description={words.subtitle}
      footerBelow="row"
      footer={
        <>
          <Button
            variant="ghost"
            leftIcon={<ExternalLink width={16} height={16} strokeWidth={1.75} />}
            onClick={() => {
              onLater();
              navigate(claimPaneHref(prompt.dealerId));
            }}
          >
            Open the claim
          </Button>
          <Button variant="secondary" onClick={onLater}>
            Later
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-sm text-text">{words.why}</p>
        <p className="text-sm font-medium text-warning-strong">
          The site waits <span aria-hidden>{timeLeftWords(prompt.expiresAt, now)}</span> more.{' '}
          {words.whose}
        </p>
        {/* The form says "Sent" and the pop-up goes by itself once the robot has
            taken the code, because the server clears the code then. */}
        <LiveCaptchaForm dealerId={prompt.dealerId} captcha={prompt} autoFocus={focusField} />
      </div>
    </Dialog>
  );
}
