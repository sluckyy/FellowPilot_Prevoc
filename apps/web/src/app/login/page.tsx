import { BRAND } from '@/brand/generated/brand';
import { BrandLogo } from '@/components/BrandLogo';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const u = await currentUser().catch(() => null);
  if (u) redirect(u.hasConsent ? '/' : '/welcome');
  return (
    <div className="page">
      <div className="stack">
        <BrandLogo width={380} />
        <h1>Sign in</h1>
        <p className="muted">{BRAND.name} is in beta for invited prevocational doctors (PGY1 and PGY2) and their medical education teams. Enter the email your invitation was sent to and we&apos;ll email you a sign-in link.</p>
      </div>
      <LoginForm />
    </div>
  );
}
