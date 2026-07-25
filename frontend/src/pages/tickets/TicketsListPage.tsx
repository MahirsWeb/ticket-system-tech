import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ticketsApi } from '../../api/tickets';
import type { TicketListItem, TicketStatus } from '../../types';
import { Button, Card, Input, Select, Spinner, StatusBadge } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { format } from 'date-fns';

const STATUSES: TicketStatus[] = ['New', 'Open', 'InProgress', 'Resolved', 'Closed'];
const PAGE_SIZE = 20;

export default function TicketsListPage() {
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<TicketListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    ticketsApi
      .list({ page, pageSize: PAGE_SIZE, status: status || undefined, search: search || undefined })
      .then((res) => {
        setItems(res.items);
        setTotalCount(res.totalCount);
      })
      .finally(() => setLoading(false));
  }, [page, status, search]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">{user?.role === 'Client' ? 'My Tickets' : 'Tickets'}</h1>
        {user?.role === 'Client' && (
          <Link to="/tickets/new">
            <Button>Submit a ticket</Button>
          </Link>
        )}
      </div>

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="w-48">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-64">
          <Input
            placeholder="Search by number or title…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-6 w-6 text-blue-700" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2">Assigned to</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link to={`/tickets/${t.id}`} className="font-medium text-blue-700 hover:underline">
                      #{t.ticketNumber}
                    </Link>
                  </td>
                  <td className="max-w-xs truncate px-4 py-2">{t.title}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-2">{t.companyName}</td>
                  <td className="px-4 py-2">{t.clientName}</td>
                  <td className="px-4 py-2">{t.assignedToName ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-500">{format(new Date(t.createdAt), 'dd.MM.yyyy HH:mm')}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No tickets found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-slate-600">
            Page {page} of {totalPages}
          </span>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
