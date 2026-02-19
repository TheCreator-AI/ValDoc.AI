import { describe, expect, it, vi } from "vitest";
import { getRequiredEnv, validateRequiredEnv, validateStartupConfig } from "@/server/config/env";

describe("env config guard", () => {
  it("throws when required env vars are missing", () => {
    expect(() =>
      validateRequiredEnv({
        DATABASE_URL: "",
        JWT_SECRET: "",
        CUSTOMER_ID: "",
        ORG_NAME: ""
      })
    ).toThrow(/Missing required environment variables/);
  });

  it("returns normalized env when all required vars are present", () => {
    const env = validateRequiredEnv({
      DATABASE_URL: "file:./dev.db",
      JWT_SECRET: "super-long-test-secret-0123456789",
      CUSTOMER_ID: "qa-org",
      ORG_NAME: "QA Organization"
    });

    expect(env.CUSTOMER_ID).toBe("qa-org");
    expect(env.ORG_NAME).toBe("QA Organization");
  });

  it("validates process env from getRequiredEnv()", () => {
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: process.env.JWT_SECRET,
      CUSTOMER_ID: process.env.CUSTOMER_ID,
      ORG_NAME: process.env.ORG_NAME
    };
    process.env.DATABASE_URL = "file:./dev.db";
    process.env.JWT_SECRET = "super-long-test-secret-0123456789";
    process.env.CUSTOMER_ID = "qa-org";
    process.env.ORG_NAME = "QA Organization";

    expect(getRequiredEnv().ORG_NAME).toBe("QA Organization");

    process.env.DATABASE_URL = previous.DATABASE_URL;
    process.env.JWT_SECRET = previous.JWT_SECRET;
    process.env.CUSTOMER_ID = previous.CUSTOMER_ID;
    process.env.ORG_NAME = previous.ORG_NAME;
  });

  it("throws when JWT secret is weak", () => {
    expect(() =>
      validateRequiredEnv({
        DATABASE_URL: "file:./dev.db",
        JWT_SECRET: "replace-with-long-random-secret",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization"
      })
    ).toThrow(/JWT_SECRET/);
  });

  it("logs startup validation when config is valid", () => {
    const logger = vi.fn();
    validateStartupConfig(
      {
        DATABASE_URL: "file:./dev.db",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization"
      },
      logger
    );

    expect(logger).toHaveBeenCalledWith(expect.stringContaining("Config validation executed"));
  });
});
