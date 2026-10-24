import { SegmentedControl } from '@/components/ui';
import { MESSAGE_LANG_LABEL, MESSAGE_LANGS, messageLangLabel } from '@/lib/onboarding';
import type { SetupMessageLang } from '@dk/shared';

/**
 * "Message language: Hinglish / English": the one language the WhatsApp message
 * goes in when a person sends it (the Approve dialog's welcome, the Send bill
 * dialog's bill). Never both in one message.
 *
 * It is pre-set to the default the server worked out for this person — the owner's
 * app language, else what they last wrote to us in, else the registration form's —
 * and says so, so the admin sees why. Picking the other one is a deliberate act for
 * this send only; the default itself does not change.
 *
 * `picked` is what the person chose (null until they do) and `fallback` the
 * default; the parent sends `chosenMessageLang(picked, fallback)`, so the message
 * always goes in the language on screen.
 */
export function MessageLangField({
  picked,
  fallback,
  onPick,
  disabled,
}: {
  picked: SetupMessageLang | null;
  /** The server's default for this person. */
  fallback: SetupMessageLang;
  onPick: (lang: SetupMessageLang) => void;
  disabled?: boolean;
}) {
  const value = picked ?? fallback;
  return (
    <div>
      {/* A group of two buttons, so a caption and the group's own aria-label, not a <label for>. */}
      <p className="mb-1 text-sm font-medium text-text">Message language</p>
      <SegmentedControl<SetupMessageLang>
        aria-label="Message language"
        value={value}
        onChange={disabled ? () => {} : onPick}
        options={MESSAGE_LANGS.map((lang) => ({ value: lang, label: MESSAGE_LANG_LABEL[lang] }))}
      />
      <p className="mt-1 text-xs text-text-muted">
        {value === fallback
          ? `Pre-set to ${messageLangLabel(fallback)}: the language they use in the app, write to us in, or registered in. `
          : `You changed it from ${messageLangLabel(fallback)}. `}
        The message goes in this one language, never both. Hinglish is Hindi written in English
        letters.
      </p>
    </div>
  );
}
