import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Content Security Policy.
 *
 * Everything the app needs is same-origin: Inter is self-hosted by next/font,
 * the QR code is drawn on a canvas, and the logo is inline SVG. `data:` images
 * are the select chevron and the background motif in globals.css. Inline
 * scripts and styles are allowed because Next.js emits both without nonces in
 * this setup; `unsafe-eval` is only added for the dev server's tooling.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    // Order matters: when two rules match a path and set the same header, the
    // LAST one wins. The site-wide defaults come first so the participant
    // override below can tighten Referrer-Policy.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          // Two years, preloadable. Harmless over plain http (browsers ignore it).
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
      {
        // Participant form routes. The access token lives in the URL, so we
        // suppress referrer leakage and search indexing for the whole subtree.
        source: '/f/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
    ];
  },
};

export default nextConfig;
