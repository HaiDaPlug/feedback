'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Select, TextInput } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Section';
import { addModeratorAction } from '../../actions';

export function AddModeratorForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'moderator'>('moderator');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const result = await addModeratorAction({ email, name, password, role });

      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
        return;
      }

      setMessage({ ok: true, text: `${email} can now sign in as a ${role}.` });
      setEmail('');
      setName('');
      setPassword('');
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-4 p-5">
      {message && (
        <Notice tone={message.ok ? 'ok' : 'danger'} role="alert">
          {message.text}
        </Notice>
      )}

      <TextInput
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="off"
      />

      <TextInput
        label="Name"
        optional
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="off"
      />

      <TextInput
        label="Temporary password"
        type="text"
        helpText="At least 12 characters. Share it privately and ask them to change it."
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="off"
        minLength={12}
      />

      <Select
        id="role"
        label="Role"
        value={role}
        onChange={(e) => setRole(e.target.value as 'admin' | 'moderator')}
      >
        <option value="moderator">Moderator</option>
        <option value="admin">Administrator (can add moderators)</option>
      </Select>

      <div className="mt-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Adding...' : 'Add moderator'}
        </Button>
      </div>
    </form>
  );
}
