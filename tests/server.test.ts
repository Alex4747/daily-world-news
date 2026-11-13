import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, type AppOptions } from "../server/app.js";
import type { DigestResponse } from "../src/types.js";

const digest: DigestResponse = {
  date: "2026-11-13", yesterdayDate: "2026-11-12", timeZone: "Europe/Kyiv", generatedAt: "2026-11-13T07:00:00.000Z",
  yesterday: [], today: [], sources: { feeds: [], events: [] },
};

async function withServer(options: AppOptions, run: (base: string) => Promise<void>) {
  const server: Server = createServer(createApp(options));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("digest API caches one build per local date and shares concurrent requests", async () => {
  let calls = 0;
  const build = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return digest; };
  await withServer({ build, now: () => new Date("2026-11-13T07:00:00Z") }, async (base) => {
    const responses = await Promise.all([fetch(`${base}/api/digest`), fetch(`${base}/api/digest`)]);
    assert.deepEqual(responses.map((r) => r.status), [200, 200]);
    assert.deepEqual(await responses[0].json(), digest);
    await fetch(`${base}/api/digest`);
    assert.equal(calls, 1);
  });
});

test("digest API rebuilds after the local date changes", async () => {
  let calls = 0;
  let current = new Date("2026-11-13T07:00:00Z");
  await withServer({ build: async () => { calls++; return digest; }, now: () => current }, async (base) => {
    await fetch(`${base}/api/digest`);
    current = new Date("2026-11-14T07:00:00Z");
    await fetch(`${base}/api/digest`);
    assert.equal(calls, 2);
  });
});

test("digest API redacts secrets from failures and briefly remembers them", async () => {
  process.env.GEMINI_API_KEY = "super-secret-key";
  let calls = 0;
  try {
    await withServer({ build: async () => { calls++; throw new Error("bad key super-secret-key"); }, now: () => new Date("2026-11-13T07:00:00Z") }, async (base) => {
      for (let i = 0; i < 2; i++) {
        const response = await fetch(`${base}/api/digest`);
        assert.equal(response.status, 502);
        assert.equal((await response.json() as { error: string }).error, "bad key [REDACTED]");
      }
      assert.equal(calls, 1);
    });
  } finally { delete process.env.GEMINI_API_KEY; }
});

test("digest API returns 404 when nothing is eligible and rejects non-GET", async () => {
  await withServer({ build: async () => null }, async (base) => {
    assert.equal((await fetch(`${base}/api/digest`)).status, 404);
    assert.equal((await fetch(`${base}/api/digest`, { method: "POST" })).status, 405);
  });
});

test("static files are served with SPA fallback and without path traversal", async () => {
  const dir = await mkdtemp(join(tmpdir(), "news-static-"));
  try {
    await mkdir(join(dir, "assets"));
    await writeFile(join(dir, "index.html"), "<h1>app</h1>");
    await writeFile(join(dir, "assets", "a.js"), "console.log(1)");
    await withServer({ build: async () => digest, staticDir: dir }, async (base) => {
      assert.equal(await (await fetch(`${base}/`)).text(), "<h1>app</h1>");
      assert.equal(await (await fetch(`${base}/some/route`)).text(), "<h1>app</h1>");
      const asset = await fetch(`${base}/assets/a.js`);
      assert.match(asset.headers.get("content-type") ?? "", /javascript/);
      for (const path of ["/%2e%2e/%2e%2e/package.json", "/..%2f..%2fpackage.json"]) {
        assert.doesNotMatch(await (await fetch(`${base}${path}`)).text(), /world-news-digest/);
      }
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
