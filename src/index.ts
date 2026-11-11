import { createDigest } from "./gemini.js";
import { localDate, previousDate } from "./dates.js";
import { formatDigest } from "./format.js";
import { deduplicateArticles, fetchRssFeeds } from "./rss.js";
import { sendTelegram } from "./telegram.js";
import { selectDigestArticles } from "./selection.js";

async function main() {
  const now = new Date();
  const timezone = process.env.TIMEZONE || "Europe/Kyiv";
  const today = localDate(now, timezone);
  const yesterday = previousDate(now, timezone);
  const articles = deduplicateArticles(await fetchRssFeeds());
  const input = selectDigestArticles(articles, yesterday, today, timezone);
  if (!input.length) throw new Error(`No eligible RSS articles found for yesterday or confirmed events for ${today}; refusing to send an empty digest.`);
  const digest = await createDigest(input, yesterday, today, process.env.GEMINI_API_KEY || "", process.env.GEMINI_MODEL);
  const messages = formatDigest(digest);
  if (!messages.length) throw new Error("Digest has no stories; refusing to send an empty digest.");
  if (process.env.DRY_RUN === "true") {
    console.log(JSON.stringify({ mode: "dry-run", date: today, messages }, null, 2));
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
