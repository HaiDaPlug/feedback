/**
 * Central HelpBnk brand configuration.
 *
 * The logo is official (HelpBnk Brand Guidelines, Sept 2026); the in-app mark
 * is drawn inline by `components/ui/Brandmark.tsx` from `lib/brand-marks.ts`,
 * and the same artwork is exported as files under `public/brand/` for use
 * outside the app.
 *
 * Palette and type follow the guidelines: primary blue, navy, cyan, one yellow
 * accent, near-black ink, Inter. `app/globals.css` mirrors `colors` in its
 * `@theme` block; change both together. (The guideline PDF prints the primary
 * as #00D47E, which is a green; its rendered swatch is #0090e8.)
 */

export const brand = {
  /** Product-facing organization name. */
  name: 'HelpBnk',

  /** Written form of the name, for copy and accessible labels. */
  wordmark: 'HelpBnk',

  /** Short product name shown in the browser tab and dashboard header. */
  productName: 'Event Feedback',

  logo: {
    /** Full lockup (icon + wordmark), black type, for white surfaces. */
    src: '/brand/helpbnk-logo.svg',
    /** Lockup with white type and the gradient icon, for black surfaces. */
    onDark: '/brand/helpbnk-logo-on-dark.svg',
    /** All-white lockup, for blue and gradient surfaces. */
    white: '/brand/helpbnk-logo-white.svg',
    /** The three-Y icon alone (gradient), e.g. for avatars and QR posters. */
    icon: '/brand/helpbnk-icon.svg',
    alt: 'HelpBnk',
    /** Default rendered height of the lockup in pixels; width follows. */
    height: 28,
  },

  colors: {
    /** Primary action colour: buttons, active states, focus rings. */
    primary: '#0090e8',
    primaryHover: '#007ac6',
    /** Text/icon colour placed on top of `primary`. */
    onPrimary: '#ffffff',
    /** Deep brand blue: dark surfaces (QR card, stat tile) and the gradient end. */
    navy: '#052c4f',
    /** Light brand blue: soft tints and the background motif. */
    cyan: '#6fdcfa',
    /** The yellow has one job: the "Collecting" (live) status. */
    accent: '#f2d205',
    /** Page background and card surfaces. */
    background: '#f5f8fb',
    surface: '#ffffff',
    /** Body copy and muted secondary copy. */
    text: '#020204',
    textMuted: '#4f5b66',
    border: '#e2e8ef',
    /** Status colours. */
    success: '#15803d',
    danger: '#b91c1c',
    warning: '#b45309',
  },
} as const;

export type Brand = typeof brand;
