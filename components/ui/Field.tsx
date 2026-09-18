'use client';

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';

/**
 * Form field primitives.
 *
 * All text inputs use 16px type (`text-base`): anything smaller causes iOS
 * Safari to zoom the viewport when the field receives focus, which is the most
 * common way a mobile form feels broken.
 *
 * Every text-like control in the app (moderator and participant) should use
 * CONTROL_CLASS so borders, radii, focus rings, and disabled states match.
 */

const CONTROL_CLASS =
  'w-full min-h-11 rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-base ' +
  'text-ink placeholder:text-ink-faint shadow-[inset_0_1px_0_rgb(26_26_26/0.02)] ' +
  'transition-[border-color,box-shadow] duration-150 ' +
  'hover:border-ink-faint focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/20 ' +
  'disabled:cursor-not-allowed disabled:bg-well disabled:opacity-70 ' +
  'aria-invalid:border-danger aria-invalid:focus:ring-danger/20';

/** Native <select> needs its own chevron; the browser default is inconsistent. */
const SELECT_CLASS = CONTROL_CLASS + ' select-chevron';

export function Label({
  htmlFor,
  children,
  required,
  optional,
}: {
  htmlFor: string;
  children: ReactNode;
  required?: boolean;
  /** Renders a quiet "Optional" marker after the label text. */
  optional?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium leading-5 text-ink">
      {children}
      {required && (
        <span className="ml-1 text-danger" aria-hidden="true">
          *
        </span>
      )}
      {required && <span className="sr-only"> (required)</span>}
      {optional && !required && (
        <span className="ml-1.5 font-normal text-ink-faint">Optional</span>
      )}
    </label>
  );
}

export function HelpText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 text-sm leading-5 text-ink-muted">
      {children}
    </p>
  );
}

export function ErrorText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm font-medium leading-5 text-danger">
      {children}
    </p>
  );
}

type FieldChrome = {
  label: string;
  helpText?: string | null;
  error?: string | null;
  optional?: boolean;
};

function useFieldIds(explicitId: string | undefined) {
  const generatedId = useId();
  const id = explicitId ?? generatedId;
  return { id, helpId: `${id}-help`, errorId: `${id}-error` };
}

function describedBy(helpId: string, errorId: string, helpText?: string | null, error?: string | null) {
  return [helpText ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
}

export function TextInput({
  label,
  helpText,
  error,
  optional,
  required,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & FieldChrome) {
  const { id, helpId, errorId } = useFieldIds(props.id);

  return (
    <div>
      <Label htmlFor={id} required={required} optional={optional}>
        {label}
      </Label>
      {helpText && <HelpText id={helpId}>{helpText}</HelpText>}
      <input
        {...props}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(helpId, errorId, helpText, error)}
        className={`${CONTROL_CLASS} mt-1.5 ${className}`}
      />
      {error && <ErrorText id={errorId}>{error}</ErrorText>}
    </div>
  );
}

export function TextArea({
  label,
  helpText,
  error,
  optional,
  required,
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldChrome) {
  const { id, helpId, errorId } = useFieldIds(props.id);

  return (
    <div>
      <Label htmlFor={id} required={required} optional={optional}>
        {label}
      </Label>
      {helpText && <HelpText id={helpId}>{helpText}</HelpText>}
      <textarea
        {...props}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(helpId, errorId, helpText, error)}
        className={`${CONTROL_CLASS} mt-1.5 resize-y ${className}`}
      />
      {error && <ErrorText id={errorId}>{error}</ErrorText>}
    </div>
  );
}

export function Select({
  label,
  helpText,
  error,
  optional,
  required,
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & FieldChrome) {
  const { id, helpId, errorId } = useFieldIds(props.id);

  return (
    <div>
      <Label htmlFor={id} required={required} optional={optional}>
        {label}
      </Label>
      {helpText && <HelpText id={helpId}>{helpText}</HelpText>}
      <select
        {...props}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(helpId, errorId, helpText, error)}
        className={`${SELECT_CLASS} mt-1.5 ${className}`}
      >
        {children}
      </select>
      {error && <ErrorText id={errorId}>{error}</ErrorText>}
    </div>
  );
}

/**
 * Checkbox with a label, sized for touch. Uses the native control coloured
 * with the brand via accent-color so keyboard and screen-reader behaviour is
 * the browser's own.
 */
export function Checkbox({
  label,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode }) {
  const { id } = useFieldIds(props.id);
  return (
    <label
      htmlFor={id}
      className={`inline-flex min-h-11 cursor-pointer select-none items-center gap-2.5 text-sm text-ink ${className}`}
    >
      <input
        {...props}
        id={id}
        type="checkbox"
        className="h-4 w-4 shrink-0 rounded border-hairline-strong accent-[var(--color-brand)]"
      />
      {label}
    </label>
  );
}

export { CONTROL_CLASS, SELECT_CLASS };
