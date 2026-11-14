'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BRAND } from '@/brand/generated/brand';

export function TopBar({ signedIn, isAdmin, isReviewer }: { signedIn: boolean; isAdmin: boolean; isReviewer: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const current = (href: string) => (href === '/' ? path === '/' : path.startsWith(href)) ? 'page' : undefined;
  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.push('/login');
    router.refresh();
  }
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="wordmark" aria-label={`${BRAND.name} home`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="emblem" src={BRAND.logos.emblem.src} alt="" width={34} height={34} />
          <span aria-hidden>
            {BRAND.wordmark.map((p) => (
              <span key={p.text} style={{ '--wm-light': p.light, '--wm-dark': p.dark } as React.CSSProperties}>{p.text}</span>
            ))}
          </span>
        </Link>
        {signedIn ? (
          <nav className="nav" aria-label="Main">
            <Link href="/" aria-current={current('/')}>Home</Link>
            <Link href="/insights" aria-current={current('/insights')}>Insights</Link>
            <Link href="/guide" aria-current={current('/guide')}>Guide</Link>
            <Link href="/logbook" aria-current={current('/logbook')}>Logbook</Link>
            <Link href="/progress" aria-current={current('/progress')}>Progress</Link>
            {isReviewer ? <Link href="/review" aria-current={current('/review')}>Review</Link> : null}
            {isAdmin ? <Link href="/admin" aria-current={current('/admin')}>Admin</Link> : null}
            <button type="button" className="linkbtn small" onClick={signOut}>Sign out</button>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
