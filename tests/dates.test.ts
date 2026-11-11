import test from "node:test";
import assert from "node:assert/strict";
import { filterArticlesForDate, localDate, previousDate } from "../src/dates.js";

test("Kyiv calendar dates account for UTC offsets", () => {
  assert.equal(localDate(new Date("2026-11-10T22:30:00Z")), "2026-11-11");
  assert.equal(previousDate(new Date("2026-11-10T22:30:00Z")), "2026-11-10");
  assert.equal(localDate(new Date("2026-07-15T21:30:00Z")), "2026-07-16");
});

test("filters articles to the requested local calendar date", () => {
  const items = [
    { publishedAt: "2026-11-10T21:30:00Z" },
    { publishedAt: "2026-11-10T22:30:00Z" },
    { publishedAt: "not a date" },
  ];
  assert.deepEqual(filterArticlesForDate(items, "2026-11-10").length, 1);
});
