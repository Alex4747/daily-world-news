import test from "node:test";
import assert from "node:assert/strict";
import { selectDigestArticles } from "../src/selection.js";
import type { Article } from "../src/types.js";

test("includes yesterday's stories and recent explicitly dated event announcements", () => {
  const articles: Article[] = [
    { title: "Yesterday story", description: "News", url: "https://example.com/yesterday", source: "BBC", publishedAt: "2026-11-10T12:00:00Z" },
    { title: "Summit scheduled for 2026-11-11", description: "Leaders will meet on 2026-11-11", url: "https://example.com/summit", source: "NPR", publishedAt: "2026-10-20T10:00:00Z" },
    { title: "Possible summit", description: "A summit may take place 2026-11-11", url: "https://example.com/speculation", source: "DW", publishedAt: "2026-11-09T10:00:00Z" },
    { title: "Old event", description: "Meeting scheduled 2026-11-11", url: "https://example.com/old", source: "DW", publishedAt: "2026-09-01T10:00:00Z" },
  ];
  const selected = selectDigestArticles(articles, "2026-11-10", "2026-11-11");
  assert.deepEqual(selected.map((article) => article.url), [
    "https://example.com/yesterday",
    "https://example.com/summit",
  ]);
});
