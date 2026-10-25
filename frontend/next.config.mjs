/** @type {import('next').NextConfig} */

// Upstream Spring API for the same-origin proxy. Read at BUILD time for
// rewrites, so on Vercel set BACKEND_API_URL before building; in Docker it is
// passed as a build arg (see frontend/Dockerfile).
const backend = (
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8080'
).replace(/\/$/, '')

const isProd = process.env.NODE_ENV === 'production'

// Baseline security headers for every page. The CSP is deliberately pragmatic:
// Next.js injects inline bootstrap scripts and the UI uses inline styles, so
// 'unsafe-inline' is required without a nonce pipeline. It still blocks
// third-party script/frame/object injection, base-tag hijacking, and form
// posts to foreign origins. All API calls are same-origin via the proxy, so
// connect-src can stay 'self'.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"} https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
]

const nextConfig = {
  // Self-contained server bundle (server.js + minimal node_modules) for a
  // small production Docker image. Vercel ignores this setting.
  output: 'standalone',

  typescript: {
    ignoreBuildErrors: false,
  },

  reactStrictMode: true,

  compress: true,
  poweredByHeader: false,

  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  env: {
    NEXT_PUBLIC_APP_NAME: 'LibraFlow',
    NEXT_PUBLIC_APP_VERSION: '1.0.0',
  },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },

  // Same-origin API proxy (BFF pattern).
  // The browser only ever talks to this Next.js origin, and Next forwards these
  // paths to the Spring backend server-side. That keeps the refresh token in a
  // first-party HttpOnly cookie (SameSite=Lax works — no cross-site request).
  //  - /api/**               REST API
  //  - /oauth2/**            starts the Google OAuth handshake
  //  - /login/oauth2/**      Google's redirect back (set GOOGLE_REDIRECT_URI to
  //                          https://<this-origin>/login/oauth2/code/google)
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/oauth2/:path*', destination: `${backend}/oauth2/:path*` },
      { source: '/login/oauth2/:path*', destination: `${backend}/login/oauth2/:path*` },
    ]
  },

  turbopack: {},
}

export default nextConfig
