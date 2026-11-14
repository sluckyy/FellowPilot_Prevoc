import { BRAND } from '@/brand/generated/brand';

/**
 * The full logo, from the brand file. The guide asks for a properly designed reversed version on dark
 * backgrounds; until one exists, dark mode shows it on a white plate (--logo-plate in brand.css).
 */
export function BrandLogo({ variant = 'horizontal', width }: { variant?: 'horizontal' | 'stacked'; width?: number }) {
  const logo = BRAND.logos[variant];
  const w = Math.max(width ?? logo.minWidth ?? 280, logo.minWidth ?? 0);
  return (
    <span className="brand-logo" style={{ padding: variant === 'horizontal' ? '4px 8px' : 12 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo.src} alt={BRAND.name} width={w} height={Math.round((w * logo.height) / logo.width)} />
    </span>
  );
}
