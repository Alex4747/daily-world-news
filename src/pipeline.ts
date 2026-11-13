import { createDigest } from "./gemini.js";
import { localDate, previousDate } from "./dates.js";
import { deduplicateArticles, fetchRssFeeds, type FeedStatus } from "./rss.js";
import { selectDigestArticles } from "./selection.js";
import { fetchOfficialEvents, filterTodayEvents, type EventSourceStatus } from "./events.js";
import type { Article, Digest } from "./types.js";
import type { CalendarEvent } from "./events.js";

export interface PipelineOptions {
  now?: Date;
  timeZone?: string;
  apiKey: string;
  model?: string;
  log?: (message: string) => void;
}

export interface PipelineResult {
  today: string;
  yesterday: string;
  timeZone: string;
  feedStatuses: FeedStatus[];
  eventStatuses: EventSourceStatus[];
  fetchedArticles: number;
  deduplicatedArticles: number;
  candidates: Article[];
  eventCandidates: CalendarEvent[];
  /** null when there was nothing to send to Gemini. */
  digest: Digest | null;
}

export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { now = new Date(), timeZone = "Europe/Kyiv", apiKey, model, log = () => {} } = options;
  const today = localDate(now, timeZone);
  const yesterday = previousDate(now, timeZone);
  const feedStatuses: FeedStatus[] = [];
  const fetched = await fetchRssFeeds(undefined, (status) => {
    feedStatuses.push(status);
    log(`RSS ${status.source}: ${status.ok ? `${status.articleCount} articles` : "unavailable"}.`);
  });
  const articles = deduplicateArticles(fetched);
  log(`RSS total: ${fetched.length} articles from ${feedStatuses.filter((status) => status.ok).length}/${feedStatuses.length} feeds; ${articles.length} after URL deduplication.`);
  const candidates = selectDigestArticles(articles, yesterday, today, timeZone);
  const eventStatuses: EventSourceStatus[] = [];
  const allEvents = await fetchOfficialEvents(now, (status) => {
    eventStatuses.push(status);
    log(`Events ${status.source}: ${status.ok ? `${status.count} official records` : `unavailable${status.detail ? ` (${status.detail})` : ""}`}.`);
  });
  const eventCandidates = filterTodayEvents(allEvents, now, timeZone);
  log(`Independent official-event search: ${allEvents.length} records; ${eventCandidates.length} confirmed events for ${today} in ${timeZone}.`);
  log(`Yesterday article candidates sent to Gemini: ${candidates.length}.`);
  const base = {
    today, yesterday, timeZone, feedStatuses, eventStatuses, candidates, eventCandidates,
    fetchedArticles: fetched.length, deduplicatedArticles: articles.length,
  };
  if (!candidates.length && !eventCandidates.length) return { ...base, digest: null };
  const digest = await createDigest(candidates, yesterday, today, apiKey, model, timeZone, undefined, eventCandidates);
  log(`Gemini result: ${digest.yesterday.length} yesterday stories, ${digest.today.length} confirmed events for today.`);
  return { ...base, digest };
}
