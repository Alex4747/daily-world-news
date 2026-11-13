import { resolve } from "node:path";
import { pipelineBuilder, startServer } from "./app.js";

try { process.loadEnvFile(); } catch { /* .env is optional */ }

if (!process.env.GEMINI_API_KEY?.trim()) {
  console.error("GEMINI_API_KEY is required to start the web server (set it in .env).");
  process.exit(1);
}
const port = Number(process.env.PORT) || 8787;
const host = process.env.HOST || "127.0.0.1";
const staticDir = process.env.STATIC_DIR || resolve("web", "dist");

startServer({ build: pipelineBuilder(), staticDir, timeZone: process.env.TIMEZONE || "Europe/Kyiv", port, host });
console.log(`World News Digest: http://${host}:${port}`);
