import { useState } from 'react';
import { ticketsApi } from '../../api/tickets';
import type { TicketDetailDto } from '../../types';
import { Button, ErrorText } from '../../components/ui';

function toLocalInputValue(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/// Manually logged "worked from X to Y (CET)" — not tied to any single assignee, just a record of when work happened.
export function WorkTimeEditor({ ticket, onChanged }: { ticket: TicketDetailDto; onChanged: (t: TicketDetailDto) => void }) {
  const [started, setStarted] = useState(toLocalInputValue(ticket.workStartedAtUtc));
  const [ended, setEnded] = useState(toLocalInputValue(ticket.workEndedAtUtc));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await ticketsApi.setWorkTime(
        ticket.id,
        started ? new Date(started).toISOString() : null,
        ended ? new Date(ended).toISOString() : null
      );
      onChanged(updated);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not save work time.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Work time (CET)</div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input
          type="datetime-local"
          value={started}
          onChange={(e) => setStarted(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
        />
        <span className="text-slate-400">→</span>
        <input
          type="datetime-local"
          value={ended}
          onChange={(e) => setEnded(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
        />
        <Button type="button" variant="secondary" className="text-xs" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
