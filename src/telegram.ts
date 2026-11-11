const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export async function sendTelegram(
  messages: string[], token: string, chatId: string, fetcher: typeof fetch = fetch,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<void> {
  if (!token || !chatId) throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required.");
  for (const text of messages) {
    if (!text.trim() || text.length > 4096) throw new Error("Telegram messages must contain 1–4096 characters.");
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
        });
        const result = await response.json() as { ok?: boolean; description?: string; parameters?: { retry_after?: number } };
        if (response.ok && result.ok) { lastError = undefined; break; }
        if (response.status < 500 && response.status !== 408 && response.status !== 429) throw new Error(`Telegram API: ${result.description ?? response.status}`);
        lastError = new Error(`Telegram temporary error: ${result.description ?? response.status}`);
        if (attempt < 3) await wait(result.parameters?.retry_after !== undefined ? result.parameters.retry_after * 1000 : 500 * 2 ** attempt);
      } catch (error) {
        lastError = error;
        if (attempt < 3 && !(error instanceof Error && error.message.startsWith("Telegram API:"))) await wait(500 * 2 ** attempt);
        else throw error;
      }
    }
    if (lastError) throw lastError;
  }
}
