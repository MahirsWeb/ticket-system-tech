import { useEffect, useState } from 'react';
import { format, subDays } from 'date-fns';
import { reportsApi } from '../../api/reports';
import type { LeaderboardEntryDto, ReportSummaryDto, TimeSeriesPointDto } from '../../types';
import { Card, Select } from '../../components/ui';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const RANGE_OPTIONS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Since start of year', days: -1 },
];

function KpiCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ?? 'text-slate-900'}`}>{value}</div>
    </Card>
  );
}

export default function DashboardPage() {
  const [rangeIdx, setRangeIdx] = useState(1);
  const [summary, setSummary] = useState<ReportSummaryDto | null>(null);
  const [series, setSeries] = useState<TimeSeriesPointDto[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntryDto[]>([]);

  useEffect(() => {
    const option = RANGE_OPTIONS[rangeIdx];
    const to = new Date();
    const from = option.days === -1 ? new Date(to.getFullYear(), 0, 1) : subDays(to, option.days);
    const params = { from: from.toISOString(), to: to.toISOString() };

    reportsApi.summary(params).then(setSummary);
    reportsApi.timeSeries(params).then(setSeries);
    reportsApi.leaderboard(params).then(setLeaderboard);
  }, [rangeIdx]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
        <div className="w-56">
          <Select value={rangeIdx} onChange={(e) => setRangeIdx(Number(e.target.value))}>
            {RANGE_OPTIONS.map((o, i) => (
              <option key={o.label} value={i}>
                {o.label}
              </option>
            ))}
          </Select>
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
