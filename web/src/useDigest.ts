import { useCallback, useEffect, useState } from "react";
import type { DigestResponse } from "../../src/types";
import { fetchDigest } from "./api";

export type DigestState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: DigestResponse };

export function useDigest(fetcher: typeof fetchDigest = fetchDigest): { state: DigestState; reload: () => void } {
  const [state, setState] = useState<DigestState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetcher(controller.signal).then(
      (data) => setState({ status: "ready", data }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: error instanceof Error ? error.message : "Неизвестная ошибка." });
      },
    );
    return () => controller.abort();
  }, [fetcher, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, reload };
}
