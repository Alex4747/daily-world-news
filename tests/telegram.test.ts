import test from "node:test";
import assert from "node:assert/strict";
import { sendTelegram } from "../src/telegram.js";

test("Telegram delivery sends HTML payload through the injectable transport", async () => {
  let called = false;
  const mockFetch: typeof fetch = async (input, init) => {
    called = true;
    assert.equal(String(input), "https://api.telegram.org/bottest-token/sendMessage");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.chat_id, "12345");
    assert.equal(body.parse_mode, "HTML");
    assert.equal(body.text, "<b>Тест</b>");
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  await sendTelegram(["<b>Тест</b>"], "test-token", "12345", mockFetch);
  assert.equal(called, true);
});

test("Telegram delivery refuses missing credentials", async () => {
  await assert.rejects(() => sendTelegram(["hello"], "", "123", fetch), /required/);
});

test("Telegram delivery refuses messages over the Bot API limit", async () => {
  await assert.rejects(() => sendTelegram(["x".repeat(4097)], "test-token", "123", fetch), /1–4096/);
});

test("Telegram delivery retries a rate limit using retry_after", async () => {
  let attempts = 0;
  let waited = -1;
  const mockFetch: typeof fetch = async () => {
    attempts++;
    return attempts === 1
      ? new Response(JSON.stringify({ ok: false, description: "Too Many Requests", parameters: { retry_after: 2 } }), { status: 429 })
      : new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  await sendTelegram(["hello"], "test-token", "123", mockFetch, async (ms) => { waited = ms; });
  assert.equal(attempts, 2);
  assert.equal(waited, 2000);
});
