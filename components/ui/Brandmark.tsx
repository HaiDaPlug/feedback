import { useId } from 'react';
import { brand } from '@/lib/brand';
import {
  ICON_GRADIENT,
  ICON_HEIGHT,
  ICON_PATH,
  ICON_STROKE,
  ICON_WIDTH,
  LOCKUP,
  WORDMARK_PATH,
} from '@/lib/brand-marks';

type Tone = 'brand' | 'mono';

/**
 * HelpBnk brandmark, drawn inline.
 *
 * Inline SVG rather than an <img> so the mark costs no request (participant
 * pages must stay free of extra fetches), scales crisply, and can take its
 * colour from the surrounding text. The wordmark is outlined type, so it looks
 * identical whether or not a web font has loaded.
 *
 *   tone="brand"  gradient icon, wordmark in currentColor (default)
 *   tone="mono"   everything in currentColor; use on blue or gradient surfaces
 *                 with `text-white`, matching the guideline's white lockup.
 *
 * The same artwork is exported as files in public/brand/ for use outside the
 * app (emails, print, QR posters). See lib/brand.ts.
 */
export function Brandmark({
  className = '',
  showProductName = false,
  tone = 'brand',
  variant = 'lockup',
  height = brand.logo.height,
  decorative = false,
}: {
  className?: string;
  showProductName?: boolean;
  tone?: Tone;
  /** `icon` renders just the three-Y mark, for tight spaces. */
  variant?: 'lockup' | 'icon';
  /** Rendered height in CSS pixels; width follows. */
  height?: number;
  /** Hides the mark from assistive tech, for watermarks next to a real mark. */
  decorative?: boolean;
}) {
  const gradientId = useId();
  const iconStroke = tone === 'brand' ? `url(#${gradientId})` : 'currentColor';
  const a11y = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': brand.logo.alt } as const);

  const gradient = tone === 'brand' && (
    <defs>
      <linearGradient
        id={gradientId}
        gradientUnits="userSpaceOnUse"
        x1={ICON_GRADIENT.x1}
        y1={ICON_GRADIENT.y1}
        x2={ICON_GRADIENT.x2}
        y2={ICON_GRADIENT.y2}
      >
        <stop offset="0" stopColor={ICON_GRADIENT.from} />
        <stop offset="1" stopColor={ICON_GRADIENT.to} />
      </linearGradient>
    </defs>
  );

  const icon = (
    <path
      d={ICON_PATH}
      fill="none"
      stroke={iconStroke}
      strokeWidth={ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );

  const mark =
    variant === 'icon' ? (
      <svg
        {...a11y}
        viewBox={`0 0 ${ICON_WIDTH} ${ICON_HEIGHT}`}
        height={height}
        width={(height * ICON_WIDTH) / ICON_HEIGHT}
        className="block shrink-0"
      >
        {gradient}
        {icon}
      </svg>
    ) : (
      <svg
        {...a11y}
        viewBox={`0 ${LOCKUP.top} ${LOCKUP.width} ${LOCKUP.height}`}
        height={height}
        width={(height * LOCKUP.width) / LOCKUP.height}
        className="block shrink-0"
      >
        {gradient}
        <g transform={`translate(0 ${LOCKUP.iconTop}) scale(${LOCKUP.iconScale})`}>{icon}</g>
        <path d={WORDMARK_PATH} fill="currentColor" transform={`translate(${LOCKUP.textX} 0)`} />
      </svg>
    );

  return (
    // Colour is inherited so `text-white` on a parent (or here) flips the wordmark.
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {mark}
      {showProductName && (
        <>
          <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-hairline-strong" />
          <span className="text-sm whitespace-nowrap text-ink-muted">{brand.productName}</span>
        </>
      )}
    </span>
  );
}
