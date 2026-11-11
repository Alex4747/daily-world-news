import { filterArticlesForDate, localDate } from "./dates.js";
import type { Article } from "./types.js";

const plannedLanguage = /\b(scheduled (?:for|to)|set to|planned for|announced (?:for|on)|will (?:meet|hold|release|publish|take place|vote|play|open|begin|start)|is due to (?:meet|hold|release|publish|take place|vote|play))\b/i;

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

function dateDaysBefore(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - days, 12)).toISOString().slice(0, 10);
}

export function selectDigestArticles(articles: Article[], yesterdayDate: string, todayDate: string, timeZone = "Europe/Kyiv"): Article[] {
  const yesterday = selectRoundRobin(filterArticlesForDate(articles, yesterdayDate, timeZone)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)), 60);
  const cutoff = dateDaysBefore(todayDate, 45);
  const events = selectRoundRobin(articles
    .filter((article) => {
      const published = localDate(new Date(article.publishedAt), timeZone);
      const text = `${article.title} ${article.description}`;
      return published >= cutoff && published <= todayDate && text.includes(todayDate) && plannedLanguage.test(text);
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)), 25);
  const seen = new Set<string>();
  return [...yesterday, ...events].filter((article) => {
    const key = article.url.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
