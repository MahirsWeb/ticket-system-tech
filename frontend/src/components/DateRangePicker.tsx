import { format } from 'date-fns';

function toInputValue(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

/// Themed "from date – to date" range picker backed by native date inputs (which render the browser's own calendar popup).
export function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: Date;
  to: Date;
  onChange: (from: Date, to: Date) => void;
}) {
  function handleFrom(value: string) {
    if (!value) return;
    const next = new Date(value + 'T00:00:00');
    onChange(next, next > to ? next : to);
  }

  function handleTo(value: string) {
    if (!value) return;
    const next = new Date(value + 'T23:59:59');
    onChange(next < from ? next : from, next);
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
      <input
        type="date"
        value={toInputValue(from)}
        onChange={(e) => handleFrom(e.target.value)}
        className="border-0 bg-transparent text-sm text-slate-700 focus:outline-none"
      />
      <span className="text-slate-300">→</span>
      <input
        type="date"
        value={toInputValue(to)}
        onChange={(e) => handleTo(e.target.value)}
        className="border-0 bg-transparent text-sm text-slate-700 focus:outline-none"
      />
    </div>
  );
}
