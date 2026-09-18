'use client';

import { signOut } from 'next-auth/react';
import { Button, type ButtonSize, type ButtonVariant } from './Button';

export function SignOutButton({
  className,
  variant = 'secondary',
  size = 'md',
}: {
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={() => signOut({ callbackUrl: '/login' })}
    >
      Sign out
    </Button>
  );
}
