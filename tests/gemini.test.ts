import test from "node:test";
import assert from "node:assert/strict";
import { buildDigestFromOutput, createDigest } from "../src/gemini.js";
import type { GoogleGenAI } from "@google/genai";
import type { Article } from "../src/types.js";

test("uses Russian model output, keeps original source and link, and rejects wrong dates", () => {
  const articles: Article[] = [
    { title: "Original title", description: "Conference planned for 2026-11-11", url: "https://example.com/one", source: "BBC News", publishedAt: "2026-11-10T20:30:00Z" },
    { title: "Older story", description: "", url: "https://example.com/two", source: "Reuters", publishedAt: "2026-11-09T12:00:00Z" },
  ];
  const digest = buildDigestFromOutput(articles, {
    yesterday: [
      { articleIndex: 0, title: "Переведённый заголовок", summary: "Краткое описание.", category: "Наука", importance: 8 },
      { articleIndex: 1, title: "Старая новость", summary: "Старое описание.", category: "Мир", importance: 10 },
    ],
    today: [
      { articleIndex: 0, title: "Подтверждённая конференция", summary: "Событие запланировано.", category: "Наука", importance: 7, eventDate: "2026-11-11" },
      { articleIndex: 1, title: "Неподтверждённое событие", summary: "Дата не в исходнике.", category: "Мир", importance: 9, eventDate: "2026-11-11" },
    ],
  }, "2026-11-10", "2026-11-11");
  assert.equal(digest.yesterday.length, 1);
  assert.equal(digest.yesterday[0].title, "Переведённый заголовок");
  assert.equal(digest.yesterday[0].source, "BBC News");
  assert.equal(digest.yesterday[0].url, articles[0].url);
  assert.equal(digest.today.length, 1);
  assert.equal(digest.today[0].eventDate, "2026-11-11");
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
  assert.match(String(request?.contents), /If at least one such article is supplied, return at least one story/);
  assert.equal(digest.yesterday[0].url, article.url);
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
