import * as React from 'react';

import { FieldError, Input, Label, SegmentedControl, Select, Textarea } from '@/components/ui';
import {
  DEFAULT_TEXT_MAX,
  type Draft,
  answerWords,
  englishWords,
  hindiUnder,
  isDrawnKind,
  optionsFor,
  suggestedLine,
} from '@/lib/outletDetails';
import type { OutletDetailsQuestionView, OutletDetailsView } from '@dk/shared';

/**
 * The Pump details form, drawn from what the SERVER sends. One box per question, chosen
 * by its kind alone: state and choice are a select, yes/no is two buttons, text a box,
 * number a number box, date a date box. It never counts the questions and never names
 * one, so a question added on the server shows up here with no release.
 *
 * The English question is the label; the Hindi question the dealer saw is in small grey
 * type under it. A kind this screen cannot draw is shown read-only with its answer.
 *
 * Controlled: the parent owns the draft (`lib/outletDetails.ts` turns it into a save).
 */
export function OutletDetailsForm({
  view,
  draft,
  onChange,
  problems,
  disabled = false,
}: {
  view: OutletDetailsView;
  draft: Draft;
  onChange: (id: string, value: string) => void;
  /** Question id -> what is wrong with its box, in plain words. */
  problems: Record<string, string>;
  disabled?: boolean;
}) {
  const uid = React.useId();
  if (view.questions.length === 0) {
    return <p className="text-sm text-text-muted">There is nothing to fill in yet.</p>;
  }
  return (
    <div className="grid gap-4">
      {view.questions.map((q) => (
        <Question
          key={q.id}
          q={q}
          domId={`${uid}-${q.id}`}
          value={draft[q.id] ?? ''}
          onChange={(v) => onChange(q.id, v)}
          problem={problems[q.id]}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function Question({
  q,
  domId,
  value,
  onChange,
  problem,
  disabled,
}: {
  q: OutletDetailsQuestionView;
  domId: string;
  value: string;
  onChange: (v: string) => void;
  problem: string | undefined;
  disabled: boolean;
}) {
  const hindi = hindiUnder(q.label);
  const help = englishWords(q.help);
  // A box the dealer never answered, with a value MDG already holds: say so under it.
  const suggestion = suggestedLine(q);
  return (
    <div className="min-w-0">
      <Label htmlFor={domId} required={q.required} className={hindi ? 'mb-0' : undefined}>
        {englishWords(q.label)}
      </Label>
      {hindi ? (
        <p lang="hi" className="mb-1 text-xs text-text-subtle">
          {hindi}
        </p>
      ) : null}
      <Control q={q} domId={domId} value={value} onChange={onChange} problem={problem} disabled={disabled} />
      <FieldError message={problem} />
      {help ? <p className="mt-1 text-xs text-text-muted">{help}</p> : null}
      {suggestion ? <p className="mt-1 text-xs text-text-muted">{suggestion}</p> : null}
    </div>
  );
}

function Control({
  q,
  domId,
  value,
  onChange,
  problem,
  disabled,
}: {
  q: OutletDetailsQuestionView;
  domId: string;
  value: string;
  onChange: (v: string) => void;
  problem: string | undefined;
  disabled: boolean;
}) {
  const invalid = !!problem;
  const placeholder = englishWords(q.placeholder) || undefined;
  if (!isDrawnKind(q.kind)) {
    // A kind added on the server that this build has never seen: show the answer, change nothing.
    return (
      <p id={domId} className="text-sm text-text">
        {answerWords(q) ?? 'Not answered yet'}
        <span className="block text-xs text-text-muted">
          This kind of question cannot be changed from here.
        </span>
      </p>
    );
  }
  switch (q.kind) {
    case 'state':
    case 'choice':
      return (
        <Select
          id={domId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          invalid={invalid}
        >
          <option value="">{q.kind === 'state' ? 'Choose a state' : 'Choose one'}</option>
          {optionsFor(q).map((o) => (
            <option key={o.value} value={o.value}>
              {englishWords(o.label) || o.value}
            </option>
          ))}
        </Select>
      );
    case 'yesno':
      return (
        <SegmentedControl<string>
          aria-label={englishWords(q.label)}
          value={value}
          // Tapping the chosen button again clears it, unless the question must have an answer.
          onChange={
            disabled
              ? () => {}
              : (v) => onChange(v === value && !q.required ? '' : v)
          }
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ]}
        />
      );
    case 'text': {
      const limit = q.maxLength ?? DEFAULT_TEXT_MAX;
      const props = {
        id: domId,
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          onChange(e.target.value),
        maxLength: limit,
        placeholder,
        disabled,
        invalid,
        autoComplete: 'off',
      } as const;
      // A long answer gets room to write; a short one stays one line.
      return limit > 120 ? <Textarea rows={2} {...props} /> : <Input {...props} />;
    }
    case 'number':
      return (
        <Input
          id={domId}
          type="number"
          inputMode="decimal"
          step="any"
          {...(q.min !== undefined ? { min: q.min } : {})}
          {...(q.max !== undefined ? { max: q.max } : {})}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          invalid={invalid}
        />
      );
    case 'date':
      return (
        <Input
          id={domId}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          invalid={invalid}
        />
      );
  }
}
