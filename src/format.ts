import type { Digest, DigestStory, PlannedEvent } from "./types.js";

function clip(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function storyText(story: DigestStory, index: number): string {
  const url = new URL(story.url);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Story URL must use HTTP or HTTPS.");
  if (url.href.length > 1800) throw new Error("Story URL is too long to format safely for Telegram.");
  return `${index}. <b>${escapeHtml(clip(story.title, 240))}</b>\n${escapeHtml(clip(story.summary, 700))}\n<i>${escapeHtml(clip(story.category, 60))} · ${escapeHtml(clip(story.source, 60))}</i>\n<a href="${escapeHtml(url.href)}">Источник</a>`;
}

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function formatDigest(digest: Digest): string[] {
  if (digest.yesterday.length + digest.today.length === 0) return [];
  const blocks: string[] = [`<b>🌍 Мировой дайджест · ${escapeHtml(digest.date)}</b>`];
  if (digest.yesterday.length) {
    blocks.push("<b>ТОП-10 ЗА ВЧЕРА</b>");
    blocks.push(...digest.yesterday.slice(0, 10).map((story, i) => storyText(story, i + 1)));
  } else blocks.push("<b>ТОП-10 ЗА ВЧЕРА</b>\nНадёжных новостей за указанную дату не найдено.");
  if (digest.today.length) {
    blocks.push("<b>СЕГОДНЯ · ПОДТВЕРЖДЁННЫЕ СОБЫТИЯ</b>");
    blocks.push(...digest.today.slice(0, 10).map((story: PlannedEvent, i) => `${storyText(story, i + 1)}\n<i>Дата: ${escapeHtml(story.eventDate)}${story.eventTime ? ` · ${escapeHtml(story.eventTime)}` : ""} · ${escapeHtml(story.timeZone)} · подтверждено первоисточником</i>`));
  } else blocks.push("<b>СЕГОДНЯ · ПОДТВЕРЖДЁННЫЕ СОБЫТИЯ</b>\nВ предоставленных источниках нет достаточно подтверждённых событий на сегодня.");
  return splitMessages(blocks.join("\n\n"));
}

export function splitMessages(text: string, limit = 3900): string[] {
  const paragraphs = text.split("\n\n");
  const messages: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= limit) { current = next; continue; }
    if (current) messages.push(current);
    if (paragraph.length <= limit) current = paragraph;
    else {
      if (/<\/?[a-z][^>]*>/i.test(paragraph)) throw new Error("HTML block exceeds the Telegram message size limit.");
      let rest = paragraph;
      while (rest.length > limit) { messages.push(rest.slice(0, limit)); rest = rest.slice(limit); }
      current = rest;
    }
  }
  if (current) messages.push(current);
  return messages;
}
