import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ticketsApi } from '../../api/tickets';
import { lookupsApi } from '../../api/lookups';
import { usersApi } from '../../api/users';
import type { DepartmentItemFull, TicketListItem, TicketStatus, UserListItemDto } from '../../types';
import { Button, Card, Input, PriorityBadge, Select, Spinner, StatusBadge } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { format } from 'date-fns';

const STATUSES: TicketStatus[] = ['New', 'Open', 'InProgress', 'Resolved', 'Closed'];
const PAGE_SIZE = 20;

const SORTABLE_COLUMNS: { key: string; label: string; className?: string }[] = [
  { key: 'ticketNumber', label: '#' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'branch', label: 'Branch' },
  { key: 'company', label: 'Company' },
];

export default function TicketsListPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'Admin';
  const isEmployee = user?.role === 'Employee';
  const isStaff = isAdmin || isEmployee;
  const [section, setSection] = useState<'all' | 'mine'>('all');
  const [items, setItems] = useState<TicketListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? '';
  const [departmentId, setDepartmentId] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [departments, setDepartments] = useState<DepartmentItemFull[]>([]);
  const [employees, setEmployees] = useState<UserListItemDto[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isStaff) return;
    if (isAdmin) lookupsApi.departments().then(setDepartments);
    usersApi.list({ role: 'Employee' }).then(setEmployees);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff, isAdmin]);

  useEffect(() => {
    setPage(1);
  }, [status, section]);

  const effectiveStatus = section === 'mine' ? 'Open,InProgress' : status || undefined;
  const effectiveAssignedToUserId = section === 'mine' ? user?.id : assignedToUserId || undefined;

  useEffect(() => {
    setLoading(true);
    ticketsApi
      .list({
        page,
        pageSize: PAGE_SIZE,
        status: effectiveStatus,
        departmentId: departmentId || undefined,
        assignedToUserId: effectiveAssignedToUserId,
        search: search || undefined,
        sortBy: sortBy ?? undefined,
        sortDir,
      })
      .then((res) => {
        setItems(res.items);
        setTotalCount(res.totalCount);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, effectiveStatus, departmentId, effectiveAssignedToUserId, search, sortBy, sortDir]);

  const employeesByBranch = useMemo(() => {
    const scoped = departmentId ? employees.filter((e) => e.departmentId === departmentId) : employees;
    const groups = new Map<string, UserListItemDto[]>();
    for (const e of scoped) {
      const key = e.departmentName ?? 'No branch';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [employees, departmentId]);

  function handleSort(key: string) {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
    setPage(1);
  }

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
        {isStaff && (
          <Link to="/tickets/new-on-behalf">
            <Button>New ticket</Button>
          </Link>
        )}
      </div>

      {isEmployee && (
        <div className="mb-4 flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setSection('all')}
            className={`px-3 py-2 text-sm font-medium ${section === 'all' ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500'}`}
          >
            All tickets
          </button>
          <button
            onClick={() => setSection('mine')}
            className={`px-3 py-2 text-sm font-medium ${section === 'mine' ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500'}`}
          >
            My tickets
          </button>
        </div>
      )}

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        {section !== 'mine' && (
          <div className="w-44">
            <Select
              value={status}
              onChange={(e) =>
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  if (e.target.value) next.set('status', e.target.value);
                  else next.delete('status');
                  return next;
                })
              }
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="w-56">
          <Input
            placeholder="Search by number or title…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        {isAdmin && (
          <div className="w-44">
            <Select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setAssignedToUserId(''); setPage(1); }}>
              <option value="">All branches</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {isStaff && section !== 'mine' && (
          <div className="w-52">
            <Select value={assignedToUserId} onChange={(e) => { setAssignedToUserId(e.target.value); setPage(1); }}>
              <option value="">All employees</option>
              {employeesByBranch.map(([branchName, group]) => (
                <optgroup key={branchName} label={branchName}>
                  {group.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-6 w-6 text-blue-700" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  {SORTABLE_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className="cursor-pointer select-none whitespace-nowrap px-3 py-1.5 hover:text-slate-700"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      {sortBy === col.key && <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-3 py-1.5">Client</th>
                  <th className="whitespace-nowrap px-3 py-1.5">Assigned to</th>
                  <th
                    className="cursor-pointer select-none whitespace-nowrap px-3 py-1.5 hover:text-slate-700"
                    onClick={() => handleSort('createdAt')}
                  >
                    Created
                    {sortBy === 'createdAt' && <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((t, i) => (
                  <tr
                    key={t.id}
                    className={clsx('border-t border-slate-100 transition-colors hover:bg-slate-200', i % 2 === 1 && 'bg-slate-100')}
                  >
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <Link to={`/tickets/${t.id}`} className="font-medium text-blue-700 hover:underline">
                        #{t.ticketNumber}
                      </Link>
                    </td>
                    <td className="max-w-xs truncate px-3 py-1.5">{t.title}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{t.departmentName ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{t.companyName}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{t.clientName}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{t.assignedToName ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{format(new Date(t.createdAt), 'dd.MM.yyyy HH:mm')}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                      No tickets found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
