const dateParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
};

export function localDate(date: Date, timeZone = "Europe/Kyiv"): string {
  const p = dateParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function previousDate(date: Date, timeZone = "Europe/Kyiv"): string {
  const [year, month, day] = localDate(date, timeZone).split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1, 12));
  return localDate(previous, timeZone);
}

export function filterArticlesForDate<T extends ArticleLike>(articles: T[], wantedDate: string, timeZone = "Europe/Kyiv"): T[] {
  return articles.filter((article) => {
    const parsed = new Date(article.publishedAt);
    return !Number.isNaN(parsed.valueOf()) && localDate(parsed, timeZone) === wantedDate;
  });
}

interface ArticleLike { publishedAt: string }
