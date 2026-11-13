import type { DigestResponse } from "../../src/types";

export class ApiError extends Error {}

function isDigest(value: unknown): value is DigestResponse {
  const v = value as Partial<DigestResponse> | null;
  return !!v && typeof v === "object" && Array.isArray(v.yesterday) && Array.isArray(v.today)
    && typeof v.date === "string" && typeof v.generatedAt === "string" && !!v.sources;
}

export async function fetchDigest(signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<DigestResponse> {
  let response: Response;
  try {
    response = await fetcher("/api/digest", { signal, headers: { Accept: "application/json" } });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("Не удалось связаться с сервером.");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new ApiError(typeof message === "string" && message ? message : `Ошибка сервера (HTTP ${response.status}).`);
  }
  if (!isDigest(body)) throw new ApiError("Сервер вернул данные неожиданного формата.");
  return body;
}
