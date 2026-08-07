import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

async function main() {
const output = process.env.SOUNDCUE_VISUAL_OUTPUT ?? path.join(process.cwd(), "test-results", "visual");
await mkdir(output, { recursive: true });
const audioFixture = path.join(process.cwd(), "tests", "fixtures", "sustained-ah.wav");

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${audioFixture}`] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"] });
await context.addInitScript(() => {
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (!constraints || typeof constraints !== "object" || !(constraints as MediaStreamConstraints).audio) {
      return originalGetUserMedia(constraints);
    }
    const audioContext = new AudioContext({ sampleRate: 48_000 });
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const destination = audioContext.createMediaStreamDestination();
    oscillator.frequency.value = 220;
    gain.gain.value = 0.16;
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    const qaWindow = window as typeof window & { __soundcueQaAudio?: AudioContext[] };
    qaWindow.__soundcueQaAudio = [...(qaWindow.__soundcueQaAudio ?? []), audioContext];
    return destination.stream;
  };
});
const page = await context.newPage();
const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

await page.goto(base);
await page.screenshot({ path: path.join(output, "landing-1440x900.png") });

await page.goto(`${base}/auth/sign-up`);
await page.screenshot({ path: path.join(output, "auth-1440x900.png") });

await page.goto(`${base}/auth/sign-in`);
await page.getByLabel("Email address").fill(process.env.SOUNDCUE_DEMO_EMAIL ?? "demo@soundcue.local");
await page.getByLabel("Password", { exact: true }).fill(process.env.SOUNDCUE_DEMO_PASSWORD ?? "SoundCue-Demo-Only-2026!");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL(/\/screenings\/new/);
await page.screenshot({ path: path.join(output, "recording-1440x900.png") });
await page.getByRole("button", { name: "Start recording" }).click();
await page.getByText("You can stop when ready").waitFor({ timeout: 10_000 });
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(output, "recording-active-1440x900.png") });

await page.goto(`${base}/history`);
await page.getByRole("heading", { name: "Your screening history." }).waitFor();
await page.screenshot({ path: path.join(output, "history-1440x900.png") });

await page.getByRole("link", { name: "View result" }).first().click();
await page.getByRole("heading", { name: /vocal changes detected\./i }).waitFor();
await page.screenshot({ path: path.join(output, "result-1440x900.png") });

await page.goto(base);
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: path.join(output, "landing-390x844.png") });

await browser.close();
process.stdout.write(`Saved visual QA screenshots to ${output}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Visual capture failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
