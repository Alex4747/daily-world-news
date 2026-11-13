import type { DigestResponse, SourceStatus } from "../../src/types";
import { EventCard, StoryCard } from "./components/Cards";
import { useDigest } from "./useDigest";

function Sources({ title, items }: { title: string; items: SourceStatus[] }) {
  return (
    <div>
      <h4>{title}</h4>
      <ul className="sources">
        {items.map((s) => (
          <li key={s.source} className={s.ok ? "ok" : "fail"}>
            {s.source}: {s.ok ? `${s.count}` : "недоступен"}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DigestView({ data }: { data: DigestResponse }) {
  const generated = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: data.timeZone }).format(new Date(data.generatedAt));
  return (
    <>
      <section aria-labelledby="yesterday-title">
        <h2 id="yesterday-title">Топ-10 новостей за вчера <small>{data.yesterdayDate}</small></h2>
        {data.yesterday.length ? (
          <ol className="list">{data.yesterday.slice(0, 10).map((s, i) => <StoryCard key={s.url} story={s} rank={i + 1} />)}</ol>
        ) : <p className="empty">Надёжных новостей за указанную дату не найдено.</p>}
      </section>
      <section aria-labelledby="today-title">
        <h2 id="today-title">Топ-10 событий на сегодня <small>{data.date}</small></h2>
        {data.today.length ? (
          <ol className="list">{data.today.slice(0, 10).map((e, i) => <EventCard key={`${e.url}#${e.title}`} event={e} rank={i + 1} />)}</ol>
        ) : <p className="empty">В предоставленных источниках нет достаточно подтверждённых событий на сегодня.</p>}
      </section>
      <footer>
        <p>Обновлено: {generated} ({data.timeZone})</p>
        <details>
          <summary>Источники</summary>
          <Sources title="Новостные ленты (RSS)" items={data.sources.feeds} />
          <Sources title="Официальные календари событий" items={data.sources.events} />
        </details>
      </footer>
    </>
  );
}

export function App({ useData = useDigest }: { useData?: typeof useDigest }) {
  const { state, reload } = useData();
  return (
    <main>
      <header>
        <h1>🌍 Мировой дайджест</h1>
        <button type="button" onClick={reload} disabled={state.status === "loading"}>Обновить</button>
      </header>
      {state.status === "loading" && <p role="status" className="status">Собираем новости и события, это может занять до минуты…</p>}
      {state.status === "error" && (
        <div role="alert" className="status error">
          <p>{state.message}</p>
          <button type="button" onClick={reload}>Повторить</button>
        </div>
      )}
      {state.status === "ready" && <DigestView data={state.data} />}
    </main>
  );
}
