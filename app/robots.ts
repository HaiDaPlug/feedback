import type { MetadataRoute } from 'next';

/**
 * Nothing in this application should be indexed. Participant forms are secret
 * links, and the dashboard is private. Per-route noindex headers are set in
 * next.config.ts as well -- this file is the crawler-facing half.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
