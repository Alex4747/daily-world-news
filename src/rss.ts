import Parser from "rss-parser";
import type { Article } from "./types.js";

export const FEEDS = [
  { source: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { source: "The Guardian", url: "https://www.theguardian.com/world/rss" },
  { source: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { source: "DW", url: "https://rss.dw.com/xml/rss-en-world" },
  { source: "NPR", url: "https://feeds.npr.org/1004/rss.xml" },
  { source: "Le Monde", url: "https://www.lemonde.fr/en/international/rss_full.xml" },
];

const parser = new Parser({ timeout: 15_000, headers: { "User-Agent": "WorldNewsDigest/1.0" } });

interface FeedItem {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
}

function cleanDescription(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, " ").trim().slice(0, 1800);
}

function toArticles(feed: { items: FeedItem[] }, source: string): Article[] {
  return feed.items.flatMap((item) => {
    const link = item.link?.trim();
    const title = item.title?.trim();
    const publishedAt = item.isoDate ?? item.pubDate;
    if (!link || !title || !publishedAt || Number.isNaN(new Date(publishedAt).valueOf())) return [];
    try {
      const parsedUrl = new URL(link);
      if ((parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") || parsedUrl.href.length > 1800) return [];
    } catch { return []; }
    return [{
      title,
      description: cleanDescription(item.contentSnippet ?? item.content ?? ""),
      url: link,
      source,
      publishedAt: new Date(publishedAt).toISOString(),
    }];
  });
}

export async function parseFeedXml(xml: string, source: string): Promise<Article[]> {
  return toArticles(await parser.parseString(xml), source);
}

export async function fetchRssFeeds(feeds = FEEDS): Promise<Article[]> {
  const results = await Promise.allSettled(feeds.map(async ({ source, url }) => {
    const feed = await parser.parseURL(url);
    return toArticles(feed, source);
  }));
  const articles = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (articles.length === 0) {
    const successes = results.filter((result) => result.status === "fulfilled").length;
    throw new Error(`No RSS articles retrieved (${successes}/${feeds.length} feeds returned successfully).`);
  }
  return articles;
}

export function deduplicateArticles(articles: Article[]): Article[] {
  const seen = new Set<string>();
  return articles.filter((article) => {
    const key = article.url.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
