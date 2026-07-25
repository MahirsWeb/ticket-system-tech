import { useEffect, useState } from 'react';
import { lookupsApi } from '../../api/lookups';
import { usersApi } from '../../api/users';
import { ticketsApi } from '../../api/tickets';
import type { LookupItem, SlaPlanItem, TicketDetailDto, TicketSource } from '../../types';
import { Button, Card, ErrorText, Label, Select } from '../../components/ui';

const SOURCES: TicketSource[] = ['Phone', 'Email', 'TicketSystem', 'Other'];

export function OpenTicketForm({ ticket, onOpened }: { ticket: TicketDetailDto; onOpened: (t: TicketDetailDto) => void }) {
  const [helpTopics, setHelpTopics] = useState<LookupItem[]>([]);
  const [departments, setDepartments] = useState<LookupItem[]>([]);
  const [slaPlans, setSlaPlans] = useState<SlaPlanItem[]>([]);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);

  const [source, setSource] = useState<TicketSource>('TicketSystem');
  const [helpTopicId, setHelpTopicId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [slaPlanId, setSlaPlanId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      lookupsApi.helpTopics(),
      lookupsApi.departments(),
      lookupsApi.slaPlans(),
      usersApi.list({ role: 'SupportAgent' }),
      usersApi.list({ role: 'Consultant' }),
    ]).then(([topics, depts, slas, support, consultants]) => {
      setHelpTopics(topics);
      setDepartments(depts);
      setSlaPlans(slas);
      const merged = [...support, ...consultants].map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName} (${u.role})` }));
      setAssignees(merged);
      if (topics[0]) setHelpTopicId(topics[0].id);
      if (depts[0]) setDepartmentId(depts[0].id);
      if (slas[0]) setSlaPlanId(slas[0].id);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!helpTopicId || !departmentId || !slaPlanId || !dueDate || !assignedToUserId) {
      setError('All fields are required to open a ticket.');
      return;
    }
    setLoading(true);
    try {
      const updated = await ticketsApi.open(ticket.id, {
        source,
        helpTopicId,
        departmentId,
        slaPlanId,
        dueDateUtc: new Date(dueDate).toISOString(),
        assignedToUserId,
      });
      onOpened(updated);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not open the ticket.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Open ticket</h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <div>
          <Label>Ticket source</Label>
          <Select value={source} onChange={(e) => setSource(e.target.value as TicketSource)}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Help topic</Label>
          <Select value={helpTopicId} onChange={(e) => setHelpTopicId(e.target.value)}>
            {helpTopics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Department</Label>
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>SLA plan</Label>
          <Select value={slaPlanId} onChange={(e) => setSlaPlanId(e.target.value)}>
            {slaPlans.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.resolutionTimeHours}h resolution)
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Due date (CET)</Label>
          <input
            type="datetime-local"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div>
          <Label>Assign to</Label>
          <Select value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)}>
            <option value="">Select an agent…</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="col-span-2">
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={loading}>
            {loading ? 'Opening…' : 'Open ticket'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
