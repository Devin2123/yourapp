/** @type {import('next').NextConfig} */
const nextConfig = {
  // ⬇️ make next build ignore ESLint errors (dev still lints)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // (optional) quiet the “inferred workspace root” warning you saw
  outputFileTracingRoot: __dirname,
};

module.exports = nextConfig;
