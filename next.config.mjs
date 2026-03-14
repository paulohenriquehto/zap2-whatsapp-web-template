/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['baileys', 'jimp'],
};

export default nextConfig;
