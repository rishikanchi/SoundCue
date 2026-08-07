import { afterEach, describe, expect, it } from "vitest";
import { getAnalyzer } from "./index";

const originalVercelEnv = process.env.VERCEL_ENV;
const originalAnalyzerMode = process.env.ANALYZER_MODE;
const originalHostedDummy = process.env.SOUNDCUE_ALLOW_HOSTED_DUMMY;

afterEach(() => {
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
  if (originalAnalyzerMode === undefined) delete process.env.ANALYZER_MODE;
  else process.env.ANALYZER_MODE = originalAnalyzerMode;
  if (originalHostedDummy === undefined) delete process.env.SOUNDCUE_ALLOW_HOSTED_DUMMY;
  else process.env.SOUNDCUE_ALLOW_HOSTED_DUMMY = originalHostedDummy;
});

describe("analyzer release gate", () => {
  it("fails closed for the dummy analyzer in public production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.ANALYZER_MODE = "dummy";
    expect(() => getAnalyzer()).toThrow("DUMMY_ANALYZER_DISABLED_IN_PRODUCTION");
  });

  it("does not pretend a validated adapter exists", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.ANALYZER_MODE = "validated";
    expect(() => getAnalyzer()).toThrow("VALIDATED_ANALYZER_NOT_CONFIGURED");
  });

  it("allows an explicitly configured hosted placeholder demo", () => {
    process.env.VERCEL_ENV = "production";
    process.env.ANALYZER_MODE = "dummy";
    process.env.SOUNDCUE_ALLOW_HOSTED_DUMMY = "true";
    expect(() => getAnalyzer()).not.toThrow();
  });
});
