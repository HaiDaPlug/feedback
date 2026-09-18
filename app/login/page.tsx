import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Brandmark } from '@/components/ui/Brandmark';
import { getModerator } from '@/lib/auth/guards';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Moderator sign in',
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  // Already a moderator? Skip the form.
  const moderator = await getModerator();
  if (moderator) redirect('/dashboard');

  return (
    <main className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/*
        Brand panel. The guideline's blue-to-navy gradient with the white
        lockup. On phones it takes 40% of the viewport and the form the other
        60%, so neither half floats over dead space; on desktop it is a
        full-height column.
      */}
      <section className="relative flex min-h-[40dvh] flex-col justify-between overflow-hidden bg-linear-to-br from-brand to-navy px-6 pt-7 pb-8 text-white sm:px-10 lg:min-h-0 lg:px-14 lg:py-12">
        <Brandmark tone="mono" height={30} className="relative" />

        <div className="relative mt-8 max-w-md lg:mt-0">
          <p className="text-eyebrow text-cyan">Event feedback</p>
          <h2 className="mt-3 text-[1.75rem] leading-[1.1] font-bold tracking-[-0.03em] sm:text-4xl lg:text-5xl">
            Real help, from real people.
          </h2>
          <p className="mt-4 max-w-sm text-base leading-7 text-white/75">
            Honest, anonymous feedback from every HelpBnk event, so the next one is better.
          </p>
        </div>

        <p className="relative hidden text-sm text-white/60 lg:block">
          Anyone can be an entrepreneur.
        </p>

        <Brandmark
          variant="icon"
          tone="mono"
          decorative
          height={560}
          className="pointer-events-none absolute -right-24 -bottom-40 text-white/10 sm:-right-28 sm:-bottom-36"
        />
      </section>

      <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8 lg:py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-display text-ink">Moderator sign in</h1>
          <p className="mt-2 text-sm leading-5 text-ink-muted">
            For authorized HelpBnk moderators. Participants do not need an account.
          </p>

          <div className="mt-8">
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
