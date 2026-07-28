import { useEffect, useState } from 'react';
import { format, subDays } from 'date-fns';
import { reportsApi } from '../../api/reports';
import { lookupsApi } from '../../api/lookups';
import { usersApi } from '../../api/users';
import type { BranchBreakdownEntryDto, DepartmentItemFull, LeaderboardEntryDto, ReportSummaryDto, TimeSeriesPointDto, UserListItemDto } from '../../types';
import { Button, Card, Select } from '../../components/ui';
import { DateRangePicker } from '../../components/DateRangePicker';
import { useAuthStore } from '../../store/authStore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

function KpiCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ?? 'text-slate-900'}`}>{value}</div>
    </Card>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'Admin';

  const [to, setTo] = useState(() => new Date());
  const [from, setFrom] = useState(() => subDays(new Date(), 30));
  const [departmentId, setDepartmentId] = useState('');
  const [agentId, setAgentId] = useState('');

  const [departments, setDepartments] = useState<DepartmentItemFull[]>([]);
  const [employees, setEmployees] = useState<UserListItemDto[]>([]);

  const [summary, setSummary] = useState<ReportSummaryDto | null>(null);
  const [series, setSeries] = useState<TimeSeriesPointDto[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntryDto[]>([]);
  const [branchBreakdown, setBranchBreakdown] = useState<BranchBreakdownEntryDto[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    lookupsApi.departments().then(setDepartments);
    Promise.all([usersApi.list({ role: 'Consultant' }), usersApi.list({ role: 'SupportAgent' })]).then(([a, b]) =>
      setEmployees([...a, ...b])
    );
  }, [isAdmin]);

  useEffect(() => {
    const params = { from: from.toISOString(), to: to.toISOString(), departmentId: departmentId || undefined, agentId: agentId || undefined };

    reportsApi.summary(params).then(setSummary);
    reportsApi.timeSeries(params).then(setSeries);
    reportsApi.leaderboard(params).then(setLeaderboard);
    if (isAdmin) reportsApi.byBranch({ from: params.from, to: params.to }).then(setBranchBreakdown);
  }, [from, to, departmentId, agentId, isAdmin]);

  async function handleExport() {
    setExporting(true);
    try {
      await reportsApi.exportCsv({ from: from.toISOString(), to: to.toISOString(), departmentId: departmentId || undefined, agentId: agentId || undefined });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          {!isAdmin && user?.departmentName && (
            <p className="text-xs text-slate-400">Showing data for your branch: {user.departmentName}</p>
          )}
          {isAdmin && <p className="text-xs text-slate-400">Global statistics across all branches</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <div className="w-48">
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">All branches</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {isAdmin && (
            <div className="w-56">
              <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="">All employees</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName} ({e.role})
                  </option>
                ))}
              </Select>
            </div>
          )}
          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          <Button variant="secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : '⬇ Export CSV'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard label="New" value={summary?.totalNew ?? '—'} />
        <KpiCard label="Open / In progress" value={summary?.totalOpen ?? '—'} accent="text-amber-600" />
        <KpiCard label="Closed" value={summary?.totalClosed ?? '—'} accent="text-green-700" />
        <KpiCard label="Avg. resolution (h)" value={summary?.avgResolutionHours ?? '—'} />
        <KpiCard label="SLA compliance" value={summary ? `${summary.slaComplianceRate}%` : '—'} accent="text-blue-700" />
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Tickets over time</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={series.map((p) => ({ ...p, date: format(new Date(p.date), 'dd MMM') }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="opened" name="Opened" stroke="#2f5ea8" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="closed" name="Closed" stroke="#15803d" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {isAdmin && (
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">By branch</h2>
          {branchBreakdown.length === 0 && <p className="text-sm text-slate-400">No routed tickets in this period yet.</p>}
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase text-slate-400">
              <tr>
                <th className="py-1">Branch</th>
                <th className="py-1">New</th>
                <th className="py-1">Open / In progress</th>
                <th className="py-1">Closed</th>
              </tr>
            </thead>
            <tbody>
              {branchBreakdown.map((b) => (
                <tr key={b.departmentId} className="border-t border-slate-100">
                  <td className="py-2 font-medium text-slate-800">{b.departmentName}</td>
                  <td className="py-2">{b.totalNew}</td>
                  <td className="py-2 text-amber-600">{b.totalOpen}</td>
                  <td className="py-2 text-green-700">{b.totalClosed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Top agents (closed tickets)</h2>
        {leaderboard.length === 0 && <p className="text-sm text-slate-400">No closed tickets in this period yet.</p>}
        <ol className="space-y-2">
          {leaderboard.map((entry, i) => (
            <li key={entry.userId} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
              <span>
                <span className="mr-2 font-bold text-slate-400">#{i + 1}</span>
                {entry.name}
              </span>
              <span className="font-semibold text-slate-800">{entry.closedCount} closed</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
