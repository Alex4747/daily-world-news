import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";
import { fetchDigest } from "./api";
import type { DigestResponse } from "../../src/types";

const digest: DigestResponse = {
  date: "2026-11-13",
  yesterdayDate: "2026-11-12",
  timeZone: "Europe/Kyiv",
  generatedAt: "2026-11-13T07:00:00.000Z",
  yesterday: [{ title: "Новость дня", summary: "Кратко о новости", source: "BBC News", url: "https://example.com/news", category: "Политика", importance: 9 }],
  today: [{
    title: "Заседание ЕЦБ", summary: "Решение по ставке", source: "ЕЦБ", url: "https://example.com/ecb", category: "Экономика", importance: 8,
    eventDate: "2026-11-13", eventTime: "14:15", timeZone: "Europe/Brussels", confirmation: "confirmed",
  }],
  sources: { feeds: [{ source: "BBC News", ok: true, count: 12 }], events: [{ source: "ЕЦБ", ok: false, count: 0 }] },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("App", () => {
  it("shows yesterday's news and today's events once loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(digest)));
    render(<App />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(await screen.findByText("Новость дня")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /событий на сегодня/i })).toBeInTheDocument();
    expect(screen.getByText("Заседание ЕЦБ")).toBeInTheDocument();
    expect(screen.getByText(/14:15/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Первоисточник" });
    expect(link).toHaveAttribute("href", "https://example.com/ecb");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows the server error and retries on demand", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ error: "Gemini недоступен" }, 502))
      .mockResolvedValueOnce(json(digest));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Gemini недоступен");
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    await waitFor(() => expect(screen.getByText("Новость дня")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders empty-state messages for sections without items", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ...digest, today: [] })));
    render(<App />);
    expect(await screen.findByText(/нет достаточно подтверждённых событий/i)).toBeInTheDocument();
  });
});

describe("fetchDigest", () => {
  it("rejects payloads of an unexpected shape", async () => {
    await expect(fetchDigest(undefined, async () => json({ hello: "world" }))).rejects.toThrow("неожиданного формата");
  });
});
