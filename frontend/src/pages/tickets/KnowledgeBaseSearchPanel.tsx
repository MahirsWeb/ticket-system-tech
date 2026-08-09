import { useState } from 'react';
import { knowledgeBaseApi } from '../../api/knowledgeBase';
import type { KnowledgeBaseSearchResultDto } from '../../types';
import { Button, Card, Input, Spinner, StatusBadge } from '../../components/ui';

export function KnowledgeBaseSearchPanel({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<KnowledgeBaseSearchResultDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);

  const SOURCES_PREVIEW_COUNT = 7;

  async function handleAsk(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setAsked(true);
    setShowAllSources(false);
    try {
      const res = await knowledgeBaseApi.ask(query);
      setAnswer(res.answer);
      setSources(res.sources);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        🤖 Ask the AI assistant about this ticket
      </Button>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">AI Assistant — Knowledge Base</h2>
        <button className="text-xs text-slate-400 hover:underline" onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        Answers are generated only from your organization's own closed tickets and internal notes — never from
        general internet knowledge.
      </p>
      <form onSubmit={handleAsk} className="mb-3 flex gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Describe the problem in a few keywords…" />
        <Button type="submit" disabled={loading}>
          {loading ? 'Thinking…' : 'Ask AI'}
        </Button>
      </form>

      {loading && (
        <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
          <Spinner className="h-4 w-4" /> Searching the knowledge base and asking the AI…
        </div>
      )}

      {!loading && asked && answer && (
        <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 p-4 text-sm text-slate-800">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">AI answer</div>
          <p className="whitespace-pre-wrap">{answer}</p>
          <p className="mt-3 border-t border-blue-100 pt-3 text-xs text-red-600">
            <span className="font-bold">WARNING!</span> This answer is suggested based on tickets in the knowledge
            base — it doesn't mean it's 100% relevant to use for this specific type of problem. Consult with a more
            experienced colleague before relying on it.
          </p>
        </div>
      )}

      {!loading && sources.length > 0 && (
        <>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Similar tickets used as context</div>
          <ul className="space-y-2">
            {(showAllSources ? sources : sources.slice(0, SOURCES_PREVIEW_COUNT)).map((r) => (
              <li key={r.ticketId}>
                <a
                  href={`/tickets/${r.ticketId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md border border-slate-200 p-3 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                    #{r.ticketNumber} — {r.title}
                    <StatusBadge status={r.status} />
                  </div>
                  {r.resolutionSummary && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{r.resolutionSummary}</p>}
                </a>
              </li>
            ))}
          </ul>
          {!showAllSources && sources.length > SOURCES_PREVIEW_COUNT && (
            <button
              className="mt-2 text-xs font-medium text-blue-700 hover:underline"
              onClick={() => setShowAllSources(true)}
            >
              See more ({sources.length - SOURCES_PREVIEW_COUNT} more)
            </button>
          )}
        </>
      )}

      {!loading && asked && sources.length === 0 && !answer && (
        <p className="text-sm text-slate-400">No similar tickets found yet — the knowledge base grows as tickets get closed.</p>
      )}
    </Card>
  );
}
