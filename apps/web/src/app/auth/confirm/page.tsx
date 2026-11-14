import { BRAND } from '@/brand/generated/brand';
import { ConfirmSignIn } from './ConfirmSignIn';

export const metadata = { title: 'Sign in' };

/**
 * The email link lands here. Signing in takes a button press (a POST), so link-checking
 * software in hospital email systems can open the link without using it up.
 */
export default function ConfirmPage({ searchParams }: { searchParams: { token?: string } }) {
  return (
    <div className="page">
      <div className="stack">
        <h1>Sign in to {BRAND.name}</h1>
        <p className="muted">Press the button to finish signing in on this device.</p>
      </div>
      <ConfirmSignIn token={searchParams.token ?? ''} />
    </div>
  );
}
