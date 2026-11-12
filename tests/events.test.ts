import test from "node:test";
import assert from "node:assert/strict";
import { filterTodayEvents, parseCesEvents, parseEcbCalendar, parseEuroParliamentMeetings, parseF1Calendar, parseIcsEvents } from "../src/events.js";

const event = (date: string, time: string | null = null, timeZone = "Europe/Kyiv") => ({
  id: `${date}-${time}`, title: "Scheduled official meeting", category: "Политика" as const,
  date, time, timeZone, description: "Official schedule.", url: "https://example.org/event",
  confirmation: "confirmed" as const, source: "Official calendar",
});

test("filters calendar events on the Europe/Kyiv calendar date, across DST offsets", () => {
  const now = new Date("2026-11-12T07:00:00Z"); // Kyiv is UTC+2 in November.
  assert.equal(filterTodayEvents([event("2026-11-11"), event("2026-11-12"), event("2026-11-13")], now).length, 1);
  const summer = new Date("2026-07-12T07:00:00Z"); // Kyiv is UTC+3 in July.
  assert.equal(filterTodayEvents([event("2026-07-12")], summer).length, 1);
});

test("keeps events announced months earlier because source publication dates are irrelevant", () => {
  const ics = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:historic-announcement", "DTSTART;TZID=Europe/Paris:20261112T120000", "SUMMARY:Summit announced months ago", "DESCRIPTION:Official summit", "URL:https://example.org/summit", "STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const parsed = parseIcsEvents(ics, { category: "Международные мероприятия", source: "Official organizer", timeZone: "Europe/Paris", url: "https://example.org/calendar" });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].date, "2026-11-12");
  assert.equal(filterTodayEvents(parsed, new Date("2026-11-12T07:00:00Z")).length, 1);
});

test("excludes cancelled calendar records and cancelled ECB schedule items", () => {
  const ics = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:cancelled", "DTSTART;VALUE=DATE:20261112", "SUMMARY:Cancelled meeting", "STATUS:CANCELLED", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  assert.equal(parseIcsEvents(ics, { category: "Политика", source: "Official", timeZone: "Europe/Kyiv", url: "https://example.org/calendar" }).length, 0);
  const ecb = parseEcbCalendar("<p>12/11/2026 Cancelled: Governing Council meeting</p>");
  assert.equal(ecb.length, 0);
});

test("rejects past timed events and returns an empty list when no events exist", () => {
  const now = new Date("2026-11-12T10:00:00Z");
  assert.equal(filterTodayEvents([event("2026-11-12", "09:00")], now).length, 0);
  assert.deepEqual(filterTodayEvents([], now), []);
});

test("parses official European Parliament event rows with dated source links", () => {
  const events = parseEuroParliamentMeetings({ data: [{ id: "https://data.europarl.europa.eu/eli/dl/event/MTG-PL-2026-11-12", label: "Plenary sitting", "start-date": "2026-11-12T09:00:00+01:00", status: "confirmed" }] });
  assert.equal(events.length, 1);
  assert.equal(events[0].url, "https://data.europarl.europa.eu/eli/dl/event/MTG-PL-2026-11-12");
});

test("parses official sports and technology schedule dates without inventing session times", () => {
  const f1 = parseF1Calendar("ROUND 21 Las Vegas 19 - 21 NOV FORMULA 1 HEINEKEN LAS VEGAS GRAND PRIX 2026", 2026);
  assert.equal(f1.length, 3);
  assert.equal(f1[0].date, "2026-11-19");
  assert.equal(f1[0].time, null);
  const ces = parseCesEvents("<h2>Upcoming Events</h2><h3>CES Unveiled Las Vegas</h3><p>Mon January 4, 2027</p><h2>Past Events</h2><h3>CES Milan</h3><p>Wed October 21, 2026</p>", 2027);
  assert.equal(ces.length, 1);
  assert.equal(ces[0].title, "CES Unveiled Las Vegas");
  assert.equal(ces[0].date, "2027-01-04");
});
