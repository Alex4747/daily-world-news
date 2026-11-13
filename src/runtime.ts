/** Only an explicit DRY_RUN=false opts into external delivery. */
export function isDryRun(value = process.env.DRY_RUN): boolean {
  return value !== "false";
}

export function redactSecrets(message: string, env: NodeJS.ProcessEnv = process.env): string {
  for (const secret of [env.GEMINI_API_KEY, env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID]) {
    if (secret) message = message.replaceAll(secret, "[REDACTED]");
  }
  return message;
}

export function missingSecrets(
  dryRun: boolean,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const required = dryRun
    ? ["GEMINI_API_KEY"]
    : ["GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"];
  return required.filter((name) => !env[name]?.trim());
}
