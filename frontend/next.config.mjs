/** @type {import('next').NextConfig} */
export default {
  output: 'standalone',
  distDir: process.env.NEXT_E2E === 'true' ? '.next-e2e' : '.next',
  async rewrites() {
    const gateway = (process.env.API_INTERNAL_BASE_URL || 'http://localhost:8080')
      .replace(/\/+$/, '').replace(/\/api$/, '');
    return { afterFiles: [
      // OAuth redirects and path-scoped cookies use Auth's canonical paths.
      // Keep the browser on the frontend origin throughout the handshake.
      { source: '/auth/google/:path*', destination: `${gateway}/auth/google/:path*` },
      { source: '/auth/oauth2/:path*', destination: `${gateway}/auth/oauth2/:path*` },
    ], fallback: [
      // Local API handlers, including dynamic PDF preview routes, must resolve
      // before forwarding unmatched API paths to the gateway.
      { source: '/api/:path*', destination: `${gateway}/api/:path*` },
    ] };
  },
};
