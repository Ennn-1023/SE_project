import type { ButtonHTMLAttributes } from 'react';

/** 撞色按鈕：primary 深藍、secondary 珊瑚橘；觸控區至少 44×44 px（FR-004）。 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary/90',
  secondary: 'bg-accent text-ink hover:bg-accent/90',
  ghost: 'border border-cream-300 bg-cream-100 text-ink hover:bg-cream-300',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      data-variant={variant}
      className={`min-h-11 min-w-11 rounded-md px-4 py-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    />
  );
}
