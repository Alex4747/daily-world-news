import test from "node:test";
import assert from "node:assert/strict";
import { formatDigest, splitMessages } from "../src/format.js";
import type { Digest } from "../src/types.js";

test("does not format empty digest", () => {
  assert.deepEqual(formatDigest({ date: "2026-11-11", yesterday: [], today: [] }), []);
});

test("splits long text below Telegram message limit", () => {
  const messages = splitMessages("x".repeat(8000), 3900);
  assert.equal(messages.length, 3);
  assert.ok(messages.every((message) => message.length <= 3900));
});

test("never cuts an HTML block in the middle", () => {
  assert.throws(() => splitMessages(`<a href="https://example.com">${"x".repeat(4000)}</a>`), /HTML block/);
});

test("formatted stories stay within Telegram limits and preserve complete HTML anchors", () => {
  const digest: Digest = { date: "2026-11-11", yesterday: [{ title: "Заголовок", summary: "Описание".repeat(250), category: "Мир", importance: 9, source: "BBC News", url: "https://example.com" }], today: [] };
  const messages = formatDigest(digest);
  assert.ok(messages.every((message) => message.length <= 4096));
  assert.ok(messages.every((message) => (message.match(/<a\b/g) ?? []).length === (message.match(/<\/a>/g) ?? []).length));
});

test("includes source and original link", () => {
  const digest: Digest = { date: "2026-11-11", yesterday: [{ title: "Заголовок", summary: "Описание", category: "Мир", importance: 9, source: "BBC News", url: "https://example.com" }], today: [] };
  const output = formatDigest(digest).join("");
  assert.match(output, /BBC News/);
  assert.match(output, /https:\/\/example\.com/);
});
