/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['winston', 'telegram', 'node-telegram-bot-api'],
  },
}

export default nextConfig
