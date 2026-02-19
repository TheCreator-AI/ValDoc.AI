import type { NextConfig } from "next";

const requiredEnv = ["DATABASE_URL", "JWT_SECRET", "CUSTOMER_ID", "ORG_NAME"] as const;
const missingEnv = requiredEnv.filter((key) => !process.env[key] || !process.env[key]?.trim());
if (missingEnv.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(", ")}`);
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
