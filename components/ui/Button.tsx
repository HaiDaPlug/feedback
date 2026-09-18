import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'inverse';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-brand-fg border border-transparent shadow-[0_1px_0_rgb(0_0_0/0.08)] ' +
    'hover:bg-brand-hover active:bg-brand-hover active:shadow-none disabled:bg-brand/50 disabled:shadow-none',
  secondary:
    'bg-surface text-ink border border-hairline-strong hover:bg-canvas hover:border-ink-faint ' +
    'active:bg-well disabled:opacity-50',
  danger:
    'bg-surface text-danger border border-danger/40 hover:bg-danger/5 hover:border-danger/60 ' +
    'active:bg-danger/10 disabled:opacity-50',
  ghost:
    'bg-transparent text-ink-muted border border-transparent hover:text-ink hover:bg-canvas ' +
    'active:bg-well disabled:opacity-50',
  // For navy and blue surfaces: a white button with navy type.
  inverse:
    'bg-surface text-navy border border-transparent shadow-[0_1px_0_rgb(0_0_0/0.12)] ' +
    'hover:bg-cyan-soft active:bg-cyan/40 active:shadow-none disabled:opacity-60 disabled:shadow-none',
};

const SIZES: Record<Size, string> = {
  // `sm` is for dense in-card controls only; it still meets a 36px target.
  sm: 'min-h-9 px-3 text-sm rounded-md',
  // Minimum 44px tall so touch targets stay comfortable on a phone.
  md: 'min-h-11 px-4 text-sm rounded-lg',
  lg: 'min-h-13 px-5 text-base rounded-lg',
};

/**
 * Class string shared by <Button> and link elements that must look like
 * buttons (Next <Link>, <a download>). Keeps every button-shaped thing in the
 * app on one set of states.
 */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
}: {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
} = {}): string {
  return [
    'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none',
    'transition-[background-color,border-color,color,box-shadow] duration-150',
    'disabled:cursor-not-allowed',
    VARIANTS[variant],
    SIZES[size],
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}) {
  return <button {...props} className={buttonClass({ variant, size, fullWidth, className })} />;
}

export type { Variant as ButtonVariant, Size as ButtonSize };
