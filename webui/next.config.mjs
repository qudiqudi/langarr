/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Proxy API requests to the backend server during development only
  async rewrites() {
    // In production, API and Next.js run on the same port
    if (process.env.NODE_ENV === 'production') {
      return [];
    }

    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
    ];
  },
  // Allow Plex avatar images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'plex.tv',
      },
      {
        protocol: 'https',
        hostname: '*.plex.tv',
      },
    ],
  },
};

export default nextConfig;
