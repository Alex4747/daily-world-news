import type { DigestStory, PlannedEvent } from "../../../src/types";

function Meta({ children }: { children: React.ReactNode }) {
  return <p className="meta">{children}</p>;
}

export function StoryCard({ story, rank }: { story: DigestStory; rank: number }) {
  return (
    <li className="card">
      <span className="rank" aria-hidden="true">{rank}</span>
      <div className="card-body">
        <h3>{story.title}</h3>
        <p>{story.summary}</p>
        <Meta>
          <span className="tag">{story.category}</span> {story.source} ·{" "}
          <a href={story.url} target="_blank" rel="noopener noreferrer">Источник</a>
        </Meta>
      </div>
    </li>
  );
}

export function EventCard({ event, rank }: { event: PlannedEvent; rank: number }) {
  return (
    <li className="card">
      <span className="rank" aria-hidden="true">{rank}</span>
      <div className="card-body">
        <h3>{event.title}</h3>
        <p>{event.summary}</p>
        <Meta>
          <span className="tag">{event.category}</span>{" "}
          <time dateTime={event.eventTime ? `${event.eventDate}T${event.eventTime}` : event.eventDate}>
            {event.eventDate}{event.eventTime ? ` · ${event.eventTime}` : ""}
          </time>{" "}
          · {event.timeZone} · {event.source} ·{" "}
          <a href={event.url} target="_blank" rel="noopener noreferrer">Первоисточник</a>
        </Meta>
      </div>
    </li>
  );
}
