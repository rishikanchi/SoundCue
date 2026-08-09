import { afterEach, describe, expect, it } from "vitest";
import { getAnalyzer } from "./index";
import { ResearchModelAnalyzer } from "./research-analyzer";

const originalVercelEnv = process.env.VERCEL_ENV;
const originalAnalyzerMode = process.env.ANALYZER_MODE;
const originalUrl = process.env.SOUNDCUE_INFERENCE_URL;
const originalSecret = process.env.SOUNDCUE_INFERENCE_HMAC_SECRET;
const originalHash = process.env.SOUNDCUE_MODEL_ARTIFACT_SHA256;

afterEach(() => {
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
  if (originalAnalyzerMode === undefined) delete process.env.ANALYZER_MODE;
  else process.env.ANALYZER_MODE = originalAnalyzerMode;
  if (originalUrl === undefined) delete process.env.SOUNDCUE_INFERENCE_URL;
  else process.env.SOUNDCUE_INFERENCE_URL = originalUrl;
  if (originalSecret === undefined) delete process.env.SOUNDCUE_INFERENCE_HMAC_SECRET;
  else process.env.SOUNDCUE_INFERENCE_HMAC_SECRET = originalSecret;
  if (originalHash === undefined) delete process.env.SOUNDCUE_MODEL_ARTIFACT_SHA256;
  else process.env.SOUNDCUE_MODEL_ARTIFACT_SHA256 = originalHash;
});

describe("analyzer release gate", () => {
  it("fails closed for the dummy analyzer in public production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.ANALYZER_MODE = "dummy";
    expect(() => getAnalyzer()).toThrow("RESEARCH_ANALYZER_REQUIRED_IN_PRODUCTION");
  });

  it("does not pretend a validated adapter exists", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.ANALYZER_MODE = "validated";
    expect(() => getAnalyzer()).toThrow("ANALYZER_NOT_CONFIGURED");
  });

  it("constructs only a fully configured research analyzer in production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.ANALYZER_MODE = "research";
    process.env.SOUNDCUE_INFERENCE_URL = "https://inference.example.test";
    process.env.SOUNDCUE_INFERENCE_HMAC_SECRET = "test-secret";
    process.env.SOUNDCUE_MODEL_ARTIFACT_SHA256 = "a".repeat(64);
    expect(getAnalyzer()).toBeInstanceOf(ResearchModelAnalyzer);
  });
});
