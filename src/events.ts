import { localDate } from "./dates.js";

export type EventCategory = "Политика" | "Экономика" | "Спорт" | "Технологии" | "Международные мероприятия";
export interface CalendarEvent {
  id: string;
  title: string;
  category: EventCategory;
  date: string;
  endDate?: string;
  endTime?: string | null;
  time: string | null;
  timeZone: string;
  description: string;
  url: string;
  confirmation: "confirmed";
  source: string;
}

const SOURCE_URLS = {
  europeanParliament: "https://data.europarl.europa.eu/api/v2/meetings?limit=100",
  ecb: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html",
  f1: `https://www.formula1.com/en/racing/${new Date().getUTCFullYear()}`,
  ces: "https://www.ces.tech/events/",
} as const;

function clean(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
}

function validUrl(value: unknown, fallback?: string): string | null {
  try {
    const url = new URL(typeof value === "string" ? value : fallback ?? "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

function dateOnly(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d\d)-(\d\d)$/);
  if (match) return value;
  const iso = value.match(/^(\d{4}-\d\d-\d\d)/);
  if (iso) return iso[1];
  const compact = value.match(/^(\d{4})(\d\d)(\d\d)(?:T.*)?$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const european = value.match(/^(\d\d)\/(\d\d)\/(\d{4})$/);
  if (european) return `${european[3]}-${european[2]}-${european[1]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
}

function mkEvent(input: Omit<CalendarEvent, "id" | "confirmation"> & { id?: string }): CalendarEvent | null {
  const url = validUrl(input.url);
  if (!url || !input.title.trim() || !/^\d{4}-\d\d-\d\d$/.test(input.date)) return null;
  return { ...input, id: input.id ?? `${url}#${input.date}#${input.title}`, url, confirmation: "confirmed" };
}

export function parseEcbCalendar(html: string): CalendarEvent[] {
  const text = clean(html);
  const events: CalendarEvent[] = [];
  const datePattern = /(?:^|\s)(\d{2}\/\d{2}\/\d{4})\s+([^\n]{4,240}?)(?=\s+\d{2}\/\d{2}\/\d{4}|$)/g;
  for (const match of text.matchAll(datePattern)) {
    const title = match[2].replace(/\s+/g, " ").trim();
    if (/cancelled|canceled|postponed/i.test(title)) continue;
    const date = dateOnly(match[1]);
    if (!date || !/meeting|press conference/i.test(title)) continue;
    const event = mkEvent({ title, category: "Экономика", date, time: null, timeZone: "Europe/Brussels", description: "Заседание из официального календаря Европейского центрального банка.", url: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html", source: "Европейский центральный банк" });
    if (event) events.push(event);
  }
  return events;
}

export function parseEuroParliamentMeetings(json: unknown): CalendarEvent[] {
  if (!json || typeof json !== "object") return [];
  const root = json as { data?: unknown[] };
  if (!Array.isArray(root.data)) return [];
  return root.data.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const title = String(item["label"] ?? item["title"] ?? item["meeting-label"] ?? "").trim();
    const start = String(item["start-date"] ?? item["startDate"] ?? item["meeting-start-date"] ?? "");
    const date = dateOnly(start);
    const idUrl = validUrl(item["id"]);
    const url = idUrl ?? "https://www.europarl.europa.eu/plenary/en/meetings-search.html";
    const status = String(item["status"] ?? item["event-status"] ?? "").toLowerCase();
    if (!date || !title || /cancel|postpon|tentative|provisional/i.test(status)) return [];
    const event = mkEvent({ title, category: "Политика", date, time: start.includes("T") ? start.slice(11, 16) : null, timeZone: "Europe/Brussels", description: "Заседание Европейского парламента из официального Open Data API.", url, source: "Европейский парламент" });
    return event ? [event] : [];
  });
}

export function parseIcsEvents(ics: string, options: { category: EventCategory; source: string; timeZone: string; url: string }): CalendarEvent[] {
  const unfolded = ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events: CalendarEvent[] = [];
  let item: Record<string, string> | null = null;
  for (const line of unfolded) {
    if (line === "BEGIN:VEVENT") { item = {}; continue; }
    if (line === "END:VEVENT" && item) {
      const rawStart = item.DTSTART ?? "";
      const rawEnd = item.DTEND ?? "";
      const startZone = item["DTSTART;TZID"] ?? (rawStart.endsWith("Z") ? "UTC" : options.timeZone);
      const utcStart = rawStart.endsWith("Z") && rawStart.includes("T") ? parseIcsInstant(rawStart) : null;
      const date = utcStart
        ? localDate(utcStart, options.timeZone)
        : dateOnly(rawStart);
      let endDate = rawEnd ? dateOnly(rawEnd) : undefined;
      if (endDate && rawEnd.length === 8) {
        endDate = new Date(Date.parse(`${endDate}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
      } else if (rawEnd.endsWith("Z") && rawEnd.includes("T")) {
        endDate = localDate(parseIcsInstant(rawEnd), startZone);
      }
      const endTime = rawEnd.endsWith("Z") && rawEnd.includes("T")
        ? new Intl.DateTimeFormat("en-GB", { timeZone: options.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(parseIcsInstant(rawEnd))
        : rawEnd.includes("T") ? `${rawEnd.slice(rawEnd.indexOf("T") + 1, rawEnd.indexOf("T") + 3)}:${rawEnd.slice(rawEnd.indexOf("T") + 3, rawEnd.indexOf("T") + 5)}` : null;
      const status = (item.STATUS ?? "CONFIRMED").toUpperCase();
      const title = (item.SUMMARY ?? "").replace(/\\[nN]/g, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").trim();
      const startTime = utcStart
        ? new Intl.DateTimeFormat("en-GB", { timeZone: options.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(utcStart)
        : rawStart.includes("T") ? `${rawStart.slice(rawStart.indexOf("T") + 1, rawStart.indexOf("T") + 3)}:${rawStart.slice(rawStart.indexOf("T") + 3, rawStart.indexOf("T") + 5)}` : null;
      const event = date && status === "CONFIRMED" ? mkEvent({ title, category: options.category, date, ...(endDate ? { endDate, endTime } : {}), time: startTime, timeZone: utcStart ? options.timeZone : startZone, description: (item.DESCRIPTION ?? "").replace(/\\[nN]/g, " ").slice(0, 500), url: validUrl(item.URL, options.url)!, source: options.source, id: item.UID }) : null;
      if (event) events.push(event);
      item = null;
      continue;
    }
    if (!item) continue;
    const split = line.indexOf(":");
    if (split < 0) continue;
    const key = line.slice(0, split);
    const field = key.split(";")[0];
    item[field] = line.slice(split + 1);
    if (field === "DTSTART" && key.includes("TZID=")) item["DTSTART;TZID"] = key.match(/TZID=([^;:]+)/)?.[1] ?? options.timeZone;
  }
  return events;
}

function parseIcsInstant(value: string): Date {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return new Date(Number.NaN);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])));
}

export function parseF1Calendar(html: string, year: number): CalendarEvent[] {
  const text = clean(html);
  const events: CalendarEvent[] = [];
  const regex = /ROUND\s+\d+\s+(.{3,45}?)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Z][a-z]{2})\s+([^\n]{4,180}?)(?=(?:ROUND\s+\d+|TESTING\s+|$))/gi;
  const months: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  for (const match of text.matchAll(regex)) {
    const month = months[match[4].toLowerCase()];
    if (!month) continue;
    const location = match[1].trim();
    const title = `${location} Grand Prix ${match[5].trim()}`;
    if (/cancelled|canceled|called off|postponed/i.test(title)) continue;
    const startDay = Number(match[2]); const endDay = Number(match[3]);
    const date = `${year}-${String(month).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
    const event = mkEvent({ title: `Formula 1: ${title}`, category: "Спорт", date, endDate, time: null, timeZone: "Часовой пояс трассы не указан на странице сезона", description: "Официально опубликован диапазон уик-энда; расписание отдельных сессий календарём сезона не подтверждено.", url: `https://www.formula1.com/en/racing/${year}`, source: "Formula 1" });
    if (event) events.push(event);
  }
  return events;
}

export function parseCesEvents(html: string, year: number): CalendarEvent[] {
  const upcomingStart = html.indexOf("Upcoming Events");
  if (upcomingStart < 0) return [];
  const pastStart = html.indexOf("Past Events", upcomingStart);
  const upcoming = html.slice(upcomingStart, pastStart < 0 ? undefined : pastStart);
  const events: CalendarEvent[] = [];
  const blocks = upcoming.split(/<h[2-6][^>]*>/i).slice(1);
  const months: Record<string, number> = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
  for (const block of blocks) {
    const [heading = "", content = ""] = block.split(/<\/h[2-6]>/i, 2);
    const title = clean(heading);
    const dateMatch = content.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (!dateMatch || Number(dateMatch[3]) !== year || !title) continue;
    const date = `${year}-${String(months[dateMatch[1]]).padStart(2, "0")}-${String(Number(dateMatch[2])).padStart(2, "0")}`;
    const event = mkEvent({ title, category: "Технологии", date, time: null, timeZone: "Местный пояс площадки не указан в календаре", description: "Предстоящее мероприятие из официального календаря CES/CTA.", url: "https://www.ces.tech/events/", source: "CES / Consumer Technology Association" });
    if (event) events.push(event);
  }
  return events;
}

export function filterTodayEvents(events: CalendarEvent[], now: Date, timeZone = "Europe/Kyiv"): CalendarEvent[] {
  const today = localDate(now, timeZone);
  const seen = new Set<string>();
  return events.filter((event) => {
    if (event.confirmation !== "confirmed" || !validUrl(event.url)) return false;
    if (event.time) {
      const [year, month, day] = event.date.split("-").map(Number);
      const [hour, minute] = event.time.split(":").map(Number);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
      const guess = Date.UTC(year, month - 1, day, hour, minute);
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: event.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      const offsetAtGuess = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute)) - guess;
      const instant = new Date(guess - offsetAtGuess);
      const ongoing = Boolean(event.endDate && event.endTime && event.endDate >= today && instant <= now && now < eventWallInstant(event.endDate, event.endTime, event.timeZone));
      if ((!ongoing && instant <= now) || (localDate(instant, timeZone) !== today && !ongoing)) return false;
    } else if (event.date !== today && !(event.endDate && event.date < today && event.endDate >= today)) return false;
    const key = `${event.title.toLowerCase()}|${event.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((event) => ({ ...event, date: today }));
}

function eventWallInstant(date: string, time: string, zone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const offset = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute)) - guess;
  return new Date(guess - offset);
}

export interface EventSourceStatus { source: string; count: number; ok: boolean; detail?: string }
export async function fetchWithRetry(url: string, attempts = 3, timeoutMs = 45_000, fetcher: typeof fetch = fetch): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "daily-world-news/1.0 (+https://github.com/Alex4747/daily-world-news)" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function fetchOfficialEvents(now = new Date(), report?: (status: EventSourceStatus) => void): Promise<CalendarEvent[]> {
  const year = Number(localDate(now, "Europe/Kyiv").slice(0, 4));
  const sources: Array<{ name: string; url: string; read: (body: string) => CalendarEvent[] }> = [
    { name: "Европейский парламент Open Data API", url: SOURCE_URLS.europeanParliament, read: (body) => parseEuroParliamentMeetings(JSON.parse(body)) },
    { name: "ЕЦБ: календарь заседаний", url: SOURCE_URLS.ecb, read: parseEcbCalendar },
    { name: "Formula 1: календарь сезона", url: SOURCE_URLS.f1.replace(/\d{4}$/, String(year)), read: (body) => parseF1Calendar(body, year) },
    { name: "CES / CTA: события", url: SOURCE_URLS.ces, read: (body) => parseCesEvents(body, year) },
  ];
  const results = await Promise.allSettled(sources.map(async (source) => {
    const response = await fetchWithRetry(source.url);
    const parsed = source.read(await response.text());
    report?.({ source: source.name, count: parsed.length, ok: true });
    return parsed;
  }));
  results.forEach((result, index) => { if (result.status === "rejected") report?.({ source: sources[index].name, count: 0, ok: false, detail: String(result.reason).slice(0, 180) }); });
  return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}
