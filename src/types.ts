export interface Article {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
}

export interface DigestStory {
  title: string;
  summary: string;
  source: string;
  url: string;
  category: string;
  importance: number;
}

export interface PlannedEvent extends DigestStory {
  eventDate: string;
  eventTime: string | null;
  timeZone: string;
  confirmation: "confirmed";
}

export interface Digest {
  date: string;
  yesterday: DigestStory[];
  today: PlannedEvent[];
}

export interface SourceStatus {
  source: string;
  ok: boolean;
  count: number;
}

/** Payload of GET /api/digest consumed by the React client. */
export interface DigestResponse extends Digest {
  yesterdayDate: string;
  timeZone: string;
  generatedAt: string;
  sources: { feeds: SourceStatus[]; events: SourceStatus[] };
}
