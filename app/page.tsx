import { redirect } from 'next/navigation';

/**
 * The root is not a public landing page: there is deliberately no directory of
 * events or feedback forms. Visitors are sent to the moderator sign-in;
 * participants reach their form only through its secret link.
 */
export default function RootPage() {
  redirect('/dashboard');
}
