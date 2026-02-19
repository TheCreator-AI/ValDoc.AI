import "@testing-library/jest-dom/vitest";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./dev.db";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret-for-vitest-0123456789";
process.env.CUSTOMER_ID = process.env.CUSTOMER_ID ?? "test-customer";
process.env.ORG_NAME = process.env.ORG_NAME ?? "Test Organization";
