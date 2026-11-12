import { filterArticlesForDate } from "./dates.js";
import type { Article } from "./types.js";

function selectRoundRobin(articles: Article[], limit: number): Article[] {
  const groups = new Map<string, Article[]>();
  for (const article of articles) groups.set(article.source, [...(groups.get(article.source) ?? []), article]);
  const selected: Article[] = [];
  while (selected.length < limit) {
    let added = false;
    for (const group of groups.values()) {
      const next = group.shift();
      if (next) { selected.push(next); added = true; }
      if (selected.length === limit) break;
    }
    if (!added) break;
  }
  return selected;
}

export function selectDigestArticles(articles: Article[], yesterdayDate: string, _todayDate?: string, timeZone = "Europe/Kyiv"): Article[] {
  return selectRoundRobin(filterArticlesForDate(articles, yesterdayDate, timeZone)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)), 60);
}
