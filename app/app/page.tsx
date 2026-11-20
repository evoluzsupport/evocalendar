import { redirect } from 'next/navigation';
import EvoCalendar from '@/components/EvoCalendar';
import SiteFooter from '@/components/SiteFooter';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'EvoCalendar' };

export default async function AppPage() {
  const user = await currentUser();
  if (!user) redirect('/');
  return (
    <>
      <EvoCalendar user={{ name: user.name, email: user.email }} />
      <SiteFooter />
    </>
  );
}
