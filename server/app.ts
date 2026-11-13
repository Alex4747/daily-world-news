import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { runPipeline } from "../src/pipeline.js";
import { redactSecrets } from "../src/runtime.js";
import type { DigestResponse } from "../src/types.js";

export type DigestBuilder = (now: Date) => Promise<DigestResponse | null>;

export interface AppOptions {
  build: DigestBuilder;
  staticDir?: string;
  timeZone?: string;
  ttlMs?: number;
  failureTtlMs?: number;
  now?: () => Date;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".ico": "image/x-icon", ".png": "image/png",
};

export function pipelineBuilder(env: NodeJS.ProcessEnv = process.env): DigestBuilder {
  return async (now) => {
    const timeZone = env.TIMEZONE || "Europe/Kyiv";
    const result = await runPipeline({ now, timeZone, apiKey: env.GEMINI_API_KEY || "", model: env.GEMINI_MODEL, log: console.log });
    if (!result.digest) return null;
    return {
      ...result.digest,
      yesterdayDate: result.yesterday,
      timeZone,
      generatedAt: now.toISOString(),
      sources: {
        feeds: result.feedStatuses.map((s) => ({ source: s.source, ok: s.ok, count: s.articleCount })),
        events: result.eventStatuses.map((s) => ({ source: s.source, ok: s.ok, count: s.count })),
      },
    };
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

/**
 * Digest generation calls Gemini and a dozen external sources, so results are cached per local date
 * and concurrent requests share one in-flight build.
 */
export function createApp(options: AppOptions) {
  const { build, staticDir, timeZone = "Europe/Kyiv", ttlMs = 3 * 60 * 60_000, failureTtlMs = 60_000, now = () => new Date() } = options;
  let cache: { date: string; expires: number; value: DigestResponse | null } | null = null;
  let failure: { expires: number; message: string } | null = null;
  let inflight: Promise<DigestResponse | null> | null = null;

  async function getDigest(): Promise<DigestResponse | null> {
    const current = now();
    const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(current);
    if (cache && cache.date === date && cache.expires > current.getTime()) return cache.value;
    if (failure && failure.expires > current.getTime()) throw new Error(failure.message);
    inflight ??= build(current).then((value) => {
      cache = { date, expires: current.getTime() + ttlMs, value };
      failure = null;
      return value;
    }).catch((error: unknown) => {
      const message = redactSecrets(error instanceof Error ? error.message : String(error));
      failure = { expires: current.getTime() + failureTtlMs, message };
      throw new Error(message);
    }).finally(() => { inflight = null; });
    return inflight;
  }

  async function serveStatic(pathname: string, res: ServerResponse) {
    if (!staticDir) return sendJson(res, 404, { error: "Not found" });
    const root = resolve(staticDir);
    let file = resolve(join(root, normalize(decodeURIComponent(pathname))));
    if (file !== root && !file.startsWith(root + sep)) return sendJson(res, 403, { error: "Forbidden" });
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) file = join(root, "index.html");
    try {
      const body = await readFile(file);
      const immutable = file.includes(`${sep}assets${sep}`);
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
      res.end(body);
    } catch {
      sendJson(res, 404, { error: "Not found" });
    }
  }

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (url.pathname === "/api/health") return sendJson(res, 200, { ok: true });
      if (url.pathname === "/api/digest") {
        if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" }, { Allow: "GET" });
        let digest: DigestResponse | null;
        try { digest = await getDigest(); }
        catch (error) { return sendJson(res, 502, { error: (error as Error).message }); }
        if (!digest) return sendJson(res, 404, { error: "Нет подходящих новостей или подтверждённых событий." });
        return sendJson(res, 200, digest);
      }
      if (url.pathname.startsWith("/api/")) return sendJson(res, 404, { error: "Not found" });
      if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Method not allowed" }, { Allow: "GET, HEAD" });
      return await serveStatic(url.pathname, res);
    } catch (error) {
      sendJson(res, 500, { error: redactSecrets(error instanceof Error ? error.message : "Internal error") });
    }
  };
}

export function startServer(options: AppOptions & { port: number; host?: string }): Server {
  const server = createServer(createApp(options));
  server.listen(options.port, options.host ?? "127.0.0.1");
  return server;
}
