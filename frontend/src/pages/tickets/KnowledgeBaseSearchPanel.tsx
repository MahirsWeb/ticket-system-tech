import { useState } from 'react';
import { knowledgeBaseApi } from '../../api/knowledgeBase';
import type { KnowledgeBaseSearchResultDto } from '../../types';
import { Button, Card, Input, StatusBadge } from '../../components/ui';

export function KnowledgeBaseSearchPanel({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<KnowledgeBaseSearchResultDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await knowledgeBaseApi.search(query);
      setResults(res);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => { setOpen(true); handleSearch(); }}>
        🔍 Search knowledge base for similar tickets
      </Button>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Knowledge base</h2>
        <button className="text-xs text-slate-400 hover:underline" onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>
      <form onSubmit={handleSearch} className="mb-3 flex gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Describe the problem in a few keywords…" />
        <Button type="submit" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </Button>
      </form>
      {results && results.length === 0 && (
        <p className="text-sm text-slate-400">No similar tickets found yet — the knowledge base grows as tickets get closed.</p>
      )}
      {results && results.length > 0 && (
        <ul className="space-y-2">
          {results.slice(0, 10).map((r) => (
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
      )}
    </Card>
  );
}
