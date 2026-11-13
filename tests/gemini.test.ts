import test from "node:test";
import assert from "node:assert/strict";
import { buildDigestFromOutput, createDigest } from "../src/gemini.js";
import type { GoogleGenAI } from "@google/genai";
import type { Article } from "../src/types.js";
import type { CalendarEvent } from "../src/events.js";

test("uses Russian model output, keeps original source and link, and rejects wrong dates", () => {
  const articles: Article[] = [
    { title: "Original title", description: "Conference planned for 2026-11-11", url: "https://example.com/one", source: "BBC News", publishedAt: "2026-11-10T20:30:00Z" },
    { title: "Older story", description: "", url: "https://example.com/two", source: "Reuters", publishedAt: "2026-11-09T12:00:00Z" },
  ];
  const events: CalendarEvent[] = [{ id: "ev1", title: "International conference", category: "Технологии", date: "2026-11-11", time: null, timeZone: "Europe/Paris", description: "Officially scheduled.", url: "https://example.com/calendar", source: "Organizer", confirmation: "confirmed" }];
  const digest = buildDigestFromOutput(articles, {
    yesterday: [
      { articleIndex: 0, title: "Переведённый заголовок", summary: "Краткое описание.", category: "Наука", importance: 8 },
      { articleIndex: 1, title: "Старая новость", summary: "Старое описание.", category: "Мир", importance: 10 },
    ],
    today: [
      { eventIndex: 0, title: "Подтверждённая конференция", summary: "Событие запланировано.", category: "Наука", importance: 7 },
      { eventIndex: 1, title: "Неподтверждённое событие", summary: "Нет в календаре.", category: "Мир", importance: 9 },
    ],
  }, "2026-11-10", "2026-11-11", "Europe/Kyiv", events);
  assert.equal(digest.yesterday.length, 1);
  assert.equal(digest.yesterday[0].title, "Переведённый заголовок");
  assert.equal(digest.yesterday[0].source, "BBC News");
  assert.equal(digest.yesterday[0].url, articles[0].url);
  assert.equal(digest.today.length, 1);
  assert.equal(digest.today[0].eventDate, "2026-11-11");
  assert.equal(digest.today[0].url, events[0].url);
});

test("Gemini SDK request uses JSON mode and preserves the source article reference", async () => {
  const article: Article = { title: "Election report", description: "Result published", url: "https://example.com/election", source: "BBC News", publishedAt: "2026-11-10T12:00:00Z" };
  let request: Parameters<GoogleGenAI["models"]["generateContent"]>[0] | undefined;
  const mockModels: Pick<GoogleGenAI["models"], "generateContent"> = {
    generateContent: async (params) => {
      request = params;
      return { text: JSON.stringify({ yesterday: [{ articleIndex: 0, title: "Итоги выборов", summary: "Опубликованы результаты.", category: "Политика", importance: 9 }], today: [] }) } as Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;
    },
  };
  const digest = await createDigest([article], "2026-11-10", "2026-11-11", "test-key", undefined, "Europe/Kyiv", mockModels);
  assert.equal(request?.model, "gemini-3.5-flash-lite");
  assert.equal(request?.config?.responseMimeType, "application/json");
  assert.deepEqual((request?.config?.responseSchema as { required?: string[] })?.required, ["yesterday", "today"]);
  assert.match(String(request?.contents), /https:\/\/example\.com\/election/);
  assert.match(String(request?.contents), /official calendar events/i);
  assert.equal(digest.yesterday[0].url, article.url);
});

test("requests ten distinct stories when at least ten yesterday candidates exist", async () => {
  const articles: Article[] = Array.from({ length: 12 }, (_, index) => ({ title: `Story ${index}`, description: "", url: `https://example.com/${index}`, source: "Source", publishedAt: "2026-11-11T12:00:00Z" }));
  let request: Parameters<GoogleGenAI["models"]["generateContent"]>[0] | undefined;
  const nouns = ["выборы", "переговоры", "землетрясение", "санкции", "перемирие", "инфляция", "саммит", "кибератака", "запуск", "забастовка"];
  const mockModels: Pick<GoogleGenAI["models"], "generateContent"> = { generateContent: async (params) => { request = params; return { text: JSON.stringify({ yesterday: articles.slice(0, 10).map((_, articleIndex) => ({ articleIndex, title: `Срочные ${nouns[articleIndex]} мирового масштаба`, summary: `Подробности ${nouns[articleIndex]} и международная реакция`, category: "Мир", importance: 10 - articleIndex })), today: [] }) } as Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>; } };
  const digest = await createDigest(articles, "2026-11-11", "2026-11-12", "test-key", undefined, "Europe/Kyiv", mockModels);
  const schema = request?.config?.responseSchema as { properties: { yesterday: { minItems?: string; maxItems?: string } } };
  assert.equal(schema.properties.yesterday.minItems, "10");
  assert.equal(digest.yesterday.length, 10);
});

test("retries transient Gemini errors and falls back to another model", async () => {
  const article: Article = { title: "Election report", description: "", url: "https://example.com/election", source: "BBC News", publishedAt: "2026-11-10T12:00:00Z" };
  const models: string[] = [];
  const mockModels: Pick<GoogleGenAI["models"], "generateContent"> = {
    generateContent: async (params) => {
      models.push(String(params.model));
      if (params.model !== "gemini-2.5-flash") throw Object.assign(new Error("Service Unavailable"), { status: 503 });
      return { text: JSON.stringify({ yesterday: [{ articleIndex: 0, title: "Итоги выборов", summary: "Опубликованы результаты.", category: "Политика", importance: 9 }], today: [] }) } as Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;
    },
  };
  const digest = await createDigest([article], "2026-11-10", "2026-11-11", "test-key", undefined, "Europe/Kyiv", mockModels, [], 1);
  assert.deepEqual(models, [...Array(4).fill("gemini-3.5-flash-lite"), "gemini-2.5-flash"]);
  assert.equal(digest.yesterday.length, 1);
});

test("does not retry non-transient Gemini errors", async () => {
  const article: Article = { title: "Election report", description: "", url: "https://example.com/election", source: "BBC News", publishedAt: "2026-11-10T12:00:00Z" };
  let calls = 0;
  const mockModels: Pick<GoogleGenAI["models"], "generateContent"> = { generateContent: async () => { calls++; throw Object.assign(new Error("Bad key"), { status: 400 }); } };
  await assert.rejects(createDigest([article], "2026-11-10", "2026-11-11", "test-key", undefined, "Europe/Kyiv", mockModels, [], 1), /Bad key/);
  assert.equal(calls, 1);
});

test("removes repeated translated headlines and keeps the higher-ranked copy", () => {
  const articles: Article[] = [
    { title: "First report", description: "", url: "https://example.com/1", source: "BBC", publishedAt: "2026-11-10T12:00:00Z" },
    { title: "Second report", description: "", url: "https://example.com/2", source: "NPR", publishedAt: "2026-11-10T13:00:00Z" },
  ];
  const digest = buildDigestFromOutput(articles, {
    yesterday: [
      { articleIndex: 0, title: "Саммит лидеров в Женеве", summary: "Первый источник.", category: "Мир", importance: 7 },
      { articleIndex: 1, title: "Саммит лидеров в Женеве!", summary: "Другой источник о том же.", category: "Мир", importance: 9 },
    ], today: [],
  }, "2026-11-10", "2026-11-11");
  assert.equal(digest.yesterday.length, 1);
  assert.equal(digest.yesterday[0].source, "NPR");
});
