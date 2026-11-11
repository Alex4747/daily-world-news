import test from "node:test";
import assert from "node:assert/strict";
import { parseFeedXml, deduplicateArticles } from "../src/rss.js";

test("parses valid RSS items and skips entries without a date", async () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Sample</title><item><title>World event</title><link>https://example.com/story</link><description>Short summary</description><pubDate>Tue, 10 Nov 2026 12:00:00 GMT</pubDate></item><item><title>Undated</title><link>https://example.com/undated</link></item></channel></rss>`;
  const articles = await parseFeedXml(xml, "Example News");
  assert.equal(articles.length, 1);
  assert.equal(articles[0].source, "Example News");
  assert.equal(articles[0].title, "World event");
  assert.equal(articles[0].url, "https://example.com/story");
});

test("deduplicates URL tracking parameters", () => {
  const base = { title: "A", description: "", source: "Source", publishedAt: "2026-11-10T12:00:00Z" };
  const articles = [
    { ...base, url: "https://example.com/story?utm_source=feed" },
    { ...base, url: "https://example.com/story" },
  ];
  assert.equal(deduplicateArticles(articles).length, 1);
});
