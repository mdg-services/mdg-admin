import {
  type ArrayFieldTemplateItemType,
  type FieldErrorProps,
  type IconButtonProps,
  type RegistryWidgetsType,
  type WidgetProps,
} from '@rjsf/utils';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

import { Button, Checkbox, IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * A small RJSF theme, so a plugin's generated config form obeys the same rules
 * as every hand-written form in the app.
 *
 * WHY THIS EXISTS RATHER THAN MORE `[&_…]` SELECTORS
 * -------------------------------------------------
 * The attach and edit dialogs render a plugin's `defaultConfigSchema` through
 * RJSF, styled by a wall of arbitrary descendant selectors in
 * `ServiceConfigFields`. Two things fell outside what that can reach:
 *
 * 1. **Array and object editing.** RJSF's own templates emit Add / Remove /
 *    move-up / move-down as *unstyled native* `<button>`s — this app ships no
 *    Bootstrap CSS — so they render at the browser default of roughly 22px, in
 *    a toolbar that does not wrap. The `dsr-report` schema is arrays of objects
 *    containing further arrays, so on a phone those controls were the whole
 *    editing surface and none of them met the 44px floor.
 * 2. **Booleans.** `[&_input]:h-11 [&_input]:w-full` also matches
 *    `input[type="checkbox"]`, and Blink honours width and height on one — so
 *    every boolean field drew as a full-width 44px bordered rectangle with no
 *    visible checked state.
 *
 * Registering real templates fixes both at the source and inherits the shared
 * `Button` / `IconButton` / `Checkbox` 44px floors for free, instead of guessing
 * at RJSF's internal class names, which are not stable across versions.
 */

/** Common to every button template: RJSF's own props are not DOM attributes. */
type ButtonTemplateProps = IconButtonProps;

const GLYPH = { width: 14, height: 14, strokeWidth: 1.75 } as const;

function AddButton({
  uiSchema: _uiSchema,
  registry: _registry,
  icon: _icon,
  iconType: _iconType,
  className,
  ...rest
}: ButtonTemplateProps) {
  return (
    <Button
      variant="secondary"
      size="sm"
      className={cn('mt-2', className)}
      leftIcon={<Plus {...GLYPH} />}
      {...rest}
    >
      Add item
    </Button>
  );
}

function RemoveButton({
  uiSchema: _uiSchema,
  registry: _registry,
  icon: _icon,
  iconType: _iconType,
  className,
  ...rest
}: ButtonTemplateProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('text-danger hover:bg-danger-soft', className)}
      leftIcon={<Trash2 {...GLYPH} />}
      {...rest}
    >
      Remove
    </Button>
  );
}

function MoveUpButton({
  uiSchema: _uiSchema,
  registry: _registry,
  icon: _icon,
  iconType: _iconType,
  className,
  ...rest
}: ButtonTemplateProps) {
  return (
    <IconButton
      aria-label="Move this item up"
      variant="secondary"
      size="sm"
      className={className}
      {...rest}
    >
      <ChevronUp {...GLYPH} />
    </IconButton>
  );
}

function MoveDownButton({
  uiSchema: _uiSchema,
  registry: _registry,
  icon: _icon,
  iconType: _iconType,
  className,
  ...rest
}: ButtonTemplateProps) {
  return (
    <IconButton
      aria-label="Move this item down"
      variant="secondary"
      size="sm"
      className={className}
      {...rest}
    >
      <ChevronDown {...GLYPH} />
    </IconButton>
  );
}

/**
 * One item of an array, with its controls in a toolbar that wraps.
 *
 * The toolbar is below the item rather than beside it: at 304px inside a sheet
 * there is no width to put three controls next to a nested object, and a
 * horizontal row that cannot wrap is how the move buttons ended up off the
 * panel — clipped, because `main` is `overflow-x-hidden`.
 */
function ArrayFieldItemTemplate(props: ArrayFieldTemplateItemType) {
  const {
    children,
    className,
    disabled,
    hasMoveDown,
    hasMoveUp,
    hasRemove,
    hasToolbar,
    index,
    onDropIndexClick,
    onReorderClick,
    readonly,
    registry,
    uiSchema,
  } = props;
  const { MoveDownButton: Down, MoveUpButton: Up, RemoveButton: Remove } =
    registry.templates.ButtonTemplates;
  const locked = disabled || readonly;

  return (
    <div
      className={cn(
        'mb-2 min-w-0 rounded-md border border-border bg-surface-2 p-3',
        className,
      )}
    >
      <div className="min-w-0">{children}</div>
      {hasToolbar ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {hasMoveUp ? (
            <Up
              disabled={locked}
              onClick={onReorderClick(index, index - 1)}
              uiSchema={uiSchema}
              registry={registry}
            />
          ) : null}
          {hasMoveDown ? (
            <Down
              disabled={locked}
              onClick={onReorderClick(index, index + 1)}
              uiSchema={uiSchema}
              registry={registry}
            />
          ) : null}
          {hasRemove ? (
            <Remove
              disabled={locked}
              onClick={onDropIndexClick(index)}
              uiSchema={uiSchema}
              registry={registry}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A field's validation messages, in the same red the app's own fields use. */
function FieldErrorTemplate({ errors }: FieldErrorProps) {
  if (!errors || errors.length === 0) return null;
  return (
    <ul className="mt-1 grid gap-0.5">
      {errors.map((error, i) => (
        <li key={i} className="break-words text-xs text-danger">
          {error}
        </li>
      ))}
    </ul>
  );
}

/**
 * A boolean field as the shared `Checkbox`: a 20px box below md inside a 44px
 * row that is itself the tap target, back to 16px and its old density at md.
 *
 * RJSF sets `displayLabel` to false for a plain boolean, so the widget owns its
 * own label — which is what lets the label and the box be one control here
 * rather than two things sitting near each other.
 */
function CheckboxWidget({
  id,
  value,
  disabled,
  readonly,
  label,
  hideLabel,
  autofocus,
  schema,
  options,
  onBlur,
  onChange,
  onFocus,
}: WidgetProps) {
  const description =
    typeof options.description === 'string'
      ? options.description
      : schema.description;
  return (
    <Checkbox
      id={id}
      name={id}
      checked={typeof value === 'boolean' ? value : false}
      disabled={disabled || readonly}
      autoFocus={autofocus}
      label={hideLabel ? undefined : label}
      hint={hideLabel ? undefined : description}
      onChange={(e) => onChange(e.target.checked)}
      onBlur={(e) => onBlur(id, e.target.checked)}
      onFocus={(e) => onFocus(id, e.target.checked)}
    />
  );
}

/** Pass to `<Form templates={RJSF_TEMPLATES}>`. */
export const RJSF_TEMPLATES = {
  ArrayFieldItemTemplate,
  FieldErrorTemplate,
  ButtonTemplates: {
    AddButton,
    RemoveButton,
    MoveUpButton,
    MoveDownButton,
  },
};

/** Pass to `<Form widgets={RJSF_WIDGETS}>`. */
export const RJSF_WIDGETS: RegistryWidgetsType = {
  CheckboxWidget,
};
