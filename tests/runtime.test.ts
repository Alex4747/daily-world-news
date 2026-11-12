import test from "node:test";
import assert from "node:assert/strict";
import { isDryRun, missingSecrets } from "../src/runtime.js";

test("delivery is dry-run unless explicitly disabled", () => {
  assert.equal(isDryRun(undefined), true);
  assert.equal(isDryRun("true"), true);
  assert.equal(isDryRun("yes"), true);
  assert.equal(isDryRun("false"), false);
});

test("checks only the secrets needed for the selected mode", () => {
  assert.deepEqual(missingSecrets(true, {}), ["GEMINI_API_KEY"]);
  assert.deepEqual(missingSecrets(false, {}), ["GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]);
  assert.deepEqual(missingSecrets(false, {
    GEMINI_API_KEY: "key", TELEGRAM_BOT_TOKEN: "token", TELEGRAM_CHAT_ID: "chat",
  }), []);
});
