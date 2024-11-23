/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
 * This is especially useful for Docker builds.
 */
!process.env.SKIP_ENV_VALIDATION && (await import("./src/env.mjs"));

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,

  // Keep your image configuration
  images: {
    domains: [
      "lh3.googleusercontent.com",
      // Add any other domains you need for images
    ],
  },

  // Keep i18n configuration
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
  },

  // Enable proper optimization
  swcMinify: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },

  // Add custom webpack configuration for better debugging
  webpack: (config, { isServer, dev }) => {
    // Enable source maps in development
    if (dev) {
      config.devtool = 'source-map';
    }
    return config;
  },

  // Increase serverside timeout
  serverRuntimeConfig: {
    maxDuration: 60,
  },
};

export default config;