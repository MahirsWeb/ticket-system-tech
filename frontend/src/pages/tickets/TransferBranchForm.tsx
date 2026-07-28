import { useEffect, useState } from 'react';
import { lookupsApi } from '../../api/lookups';
import { ticketsApi } from '../../api/tickets';
import type { DepartmentItemFull, TicketDetailDto } from '../../types';
import { Button, Card, ErrorText, Label, Select } from '../../components/ui';

export function TransferBranchForm({ ticket, onTransferred }: { ticket: TicketDetailDto; onTransferred: (t: TicketDetailDto) => void }) {
  const [departments, setDepartments] = useState<DepartmentItemFull[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    lookupsApi.departments().then((depts) => setDepartments(depts.filter((d) => d.id !== ticket.departmentId)));
  }, [ticket.departmentId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!departmentId) {
      setError('Select a destination branch.');
      return;
    }
    setLoading(true);
    try {
      const updated = await ticketsApi.transferBranch(ticket.id, departmentId);
      setDepartmentId('');
      onTransferred(updated);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not transfer this ticket.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Transfer to another branch</h2>
      <p className="mb-3 text-xs text-slate-400">
        Moves this ticket out of {ticket.departmentName ?? 'its current branch'} and notifies everyone in the destination branch.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Label>Destination branch</Label>
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Select a branch…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary" disabled={loading}>
          {loading ? 'Transferring…' : 'Transfer'}
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
