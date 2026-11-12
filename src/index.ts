import { createDigest } from "./gemini.js";
import { localDate, previousDate } from "./dates.js";
import { formatDigest } from "./format.js";
import { deduplicateArticles, fetchRssFeeds } from "./rss.js";
import { sendTelegram } from "./telegram.js";
import { selectDigestArticles } from "./selection.js";
import { isDryRun, missingSecrets } from "./runtime.js";
import { fetchOfficialEvents, filterTodayEvents } from "./events.js";

async function main() {
  const now = new Date();
  const timezone = process.env.TIMEZONE || "Europe/Kyiv";
  const dryRun = isDryRun();
  const missing = missingSecrets(dryRun);
  if (missing.length) throw new Error(`Missing required GitHub Actions/local secrets: ${missing.join(", ")}.`);
  const today = localDate(now, timezone);
  const yesterday = previousDate(now, timezone);
  const feedStatuses: Array<{ source: string; articleCount: number; ok: boolean }> = [];
  const fetched = await fetchRssFeeds(undefined, (status) => {
    feedStatuses.push(status);
    console.log(`RSS ${status.source}: ${status.ok ? `${status.articleCount} articles` : "unavailable"}.`);
  });
  const articles = deduplicateArticles(fetched);
  console.log(`RSS total: ${fetched.length} articles from ${feedStatuses.filter((status) => status.ok).length}/${feedStatuses.length} feeds; ${articles.length} after URL deduplication.`);
  const input = selectDigestArticles(articles, yesterday, today, timezone);
  const eventStatuses: Array<{ source: string; count: number; ok: boolean; detail?: string }> = [];
  const allEvents = await fetchOfficialEvents(now, (status) => {
    eventStatuses.push(status);
    console.log(`Events ${status.source}: ${status.ok ? `${status.count} official records` : `unavailable${status.detail ? ` (${status.detail})` : ""}`}.`);
  });
  const todayEvents = filterTodayEvents(allEvents, now, timezone);
  console.log(`Independent official-event search: ${allEvents.length} records; ${todayEvents.length} confirmed events for ${today} in ${timezone}.`);
  console.log(`Yesterday article candidates sent to Gemini: ${input.length}.`);
  if (!input.length && !todayEvents.length) {
    if (dryRun) {
      console.log(JSON.stringify({ mode: "dry-run", date: today, candidates: 0, events: 0, result: "no-eligible-items" }));
      return;
    }
    throw new Error(`No eligible RSS articles or confirmed official events found for ${today}; refusing to send an empty digest.`);
  }
  const digest = await createDigest(input, yesterday, today, process.env.GEMINI_API_KEY || "", process.env.GEMINI_MODEL, timezone, undefined, todayEvents);
  const messages = formatDigest(digest);
  console.log(`Gemini result: ${digest.yesterday.length} yesterday stories, ${digest.today.length} confirmed events for today.`);
  if (!messages.length) {
    if (dryRun) {
      console.log(JSON.stringify({ mode: "dry-run", date: today, candidates: input.length, officialEventCandidates: todayEvents.length, yesterday: 0, todayEvents: 0, eventStatuses, result: "no-confirmed-stories" }));
      return;
    }
    throw new Error("Digest has no stories; refusing to send an empty digest.");
  }
  if (dryRun) {
    console.log(JSON.stringify({ mode: "dry-run", date: today, feedStatuses, fetchedArticles: fetched.length, deduplicatedArticles: articles.length, candidates: input.length, eventStatuses, officialEventCandidates: todayEvents.length, yesterday: digest.yesterday.length, todayEvents: digest.today.length, messages }, null, 2));
    return;
  }
  await sendTelegram(messages, process.env.TELEGRAM_BOT_TOKEN || "", process.env.TELEGRAM_CHAT_ID || "");
  console.log(`Digest sent: ${messages.length} message(s) for ${today}.`);
}

main().catch((error: unknown) => {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [process.env.GEMINI_API_KEY, process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID]) {
    if (secret) message = message.replaceAll(secret, "[REDACTED]");
  }
  console.error(message);
  process.exitCode = 1;
});
