import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep server-only scraping deps out of the client bundle.
  serverExternalPackages: ["cheerio", "xlsx"],
  // Pin the file-tracing root to this project (multiple lockfiles exist above).
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
