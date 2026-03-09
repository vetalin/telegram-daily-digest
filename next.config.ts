import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['winston', 'telegram'],
  },
}

export default nextConfig
