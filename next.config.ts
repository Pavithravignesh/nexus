import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optional: build into another folder so a production build can run next to `next dev`
  // (e.g. NEXT_DIST_DIR=.next-verify npm run build && NEXT_DIST_DIR=.next-verify npx next start -p 3100).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
