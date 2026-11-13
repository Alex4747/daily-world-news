import { formatDigest } from "./format.js";
import { sendTelegram } from "./telegram.js";
import { runPipeline } from "./pipeline.js";
import { isDryRun, missingSecrets, redactSecrets } from "./runtime.js";

async function main() {
  const timezone = process.env.TIMEZONE || "Europe/Kyiv";
  const dryRun = isDryRun();
  const missing = missingSecrets(dryRun);
  if (missing.length) throw new Error(`Missing required GitHub Actions/local secrets: ${missing.join(", ")}.`);
  const result = await runPipeline({
    timeZone: timezone, apiKey: process.env.GEMINI_API_KEY || "", model: process.env.GEMINI_MODEL, log: console.log,
  });
  const { today, digest, candidates, eventCandidates, eventStatuses } = result;
  if (!digest) {
    if (dryRun) {
      console.log(JSON.stringify({ mode: "dry-run", date: today, candidates: 0, events: 0, result: "no-eligible-items" }));
      return;
    }
    throw new Error(`No eligible RSS articles or confirmed official events found for ${today}; refusing to send an empty digest.`);
  }
  const messages = formatDigest(digest);
  if (!messages.length) {
    if (dryRun) {
      console.log(JSON.stringify({ mode: "dry-run", date: today, candidates: candidates.length, officialEventCandidates: eventCandidates.length, yesterday: 0, todayEvents: 0, eventStatuses, result: "no-confirmed-stories" }));
      return;
    }
    throw new Error("Digest has no stories; refusing to send an empty digest.");
  }
  if (dryRun) {
    console.log(JSON.stringify({ mode: "dry-run", date: today, feedStatuses: result.feedStatuses, fetchedArticles: result.fetchedArticles, deduplicatedArticles: result.deduplicatedArticles, candidates: candidates.length, eventStatuses, officialEventCandidates: eventCandidates.length, yesterday: digest.yesterday.length, todayEvents: digest.today.length, messages }, null, 2));
    return;
  }
  await sendTelegram(messages, process.env.TELEGRAM_BOT_TOKEN || "", process.env.TELEGRAM_CHAT_ID || "");
  console.log(`Digest sent: ${messages.length} message(s) for ${today}.`);
}

main().catch((error: unknown) => {
  console.error(redactSecrets(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
