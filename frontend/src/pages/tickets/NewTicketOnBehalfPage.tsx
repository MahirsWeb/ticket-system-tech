import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usersApi } from '../../api/users';
import { lookupsApi } from '../../api/lookups';
import { ticketsApi } from '../../api/tickets';
import { emailIntegrationApi } from '../../api/emailIntegration';
import type { ClientLookupResult, DepartmentItemFull, LookupItem, SlaPlanItem, TicketSource } from '../../types';
import { Button, Card, ErrorText, Input, Label, Select } from '../../components/ui';
import { RichTextEditor } from '../../components/RichTextEditor';
import { useAuthStore } from '../../store/authStore';

const SOURCES: TicketSource[] = ['Phone', 'Email', 'TicketSystem', 'Other'];

export default function NewTicketOnBehalfPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromEmailMessageId = searchParams.get('fromEmail');
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'Admin';

  const [email, setEmail] = useState('');
  const [client, setClient] = useState<ClientLookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [prefilledFromEmail, setPrefilledFromEmail] = useState(false);
  const [emailHasAttachments, setEmailHasAttachments] = useState(false);

  const [helpTopics, setHelpTopics] = useState<LookupItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItemFull[]>([]);
  const [slaPlans, setSlaPlans] = useState<SlaPlanItem[]>([]);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<TicketSource>('Phone');
  const [helpTopicId, setHelpTopicId] = useState('');
  // Non-admin staff can only open tickets into their own branch; Admin may pick any branch.
  const [departmentId, setDepartmentId] = useState(isAdmin ? '' : user?.departmentId ?? '');
  const [slaPlanId, setSlaPlanId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([lookupsApi.helpTopics(), lookupsApi.departments(), lookupsApi.slaPlans()]).then(([topics, depts, slas]) => {
      setHelpTopics(topics);
      setDepartments(depts);
      setSlaPlans(slas);
      if (topics[0]) setHelpTopicId(topics[0].id);
      if (isAdmin && depts[0]) setDepartmentId(depts[0].id);
      if (slas[0]) setSlaPlanId(slas[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!departmentId) {
      setAssignees([]);
      return;
    }
    setAssignedToUserId('');
    Promise.all([
      usersApi.list({ role: 'SupportAgent', departmentId }),
      usersApi.list({ role: 'Consultant', departmentId }),
    ]).then(([support, consultants]) => {
      setAssignees([...support, ...consultants].map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName} (${u.role})` })));
    });
  }, [departmentId]);

  useEffect(() => {
    if (!fromEmailMessageId) return;
    emailIntegrationApi.getPrefill(fromEmailMessageId).then((p) => {
      setEmail(p.clientEmail);
      setTitle(p.subject);
      setDescription(p.bodyHtml);
      setSource('Email');
      setEmailHasAttachments(p.hasAttachments);
      setPrefilledFromEmail(true);
      usersApi
        .lookupByEmail(p.clientEmail)
        .then(setClient)
        .catch(() => setLookupError('Could not automatically find a client account for this email — search manually below.'));
    });
  }, [fromEmailMessageId]);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setLookupError(null);
    setLooking(true);
    try {
      const result = await usersApi.lookupByEmail(email);
      setClient(result);
    } catch (err: any) {
      setClient(null);
      setLookupError(err?.response?.data?.message ?? 'No client found with that email.');
    } finally {
      setLooking(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!client) return;
    if (!title.trim() || !description.trim() || description === '<p></p>') {
      setError('Title and description are required.');
      return;
    }
    if (!helpTopicId || !departmentId || !slaPlanId || !dueDate || !assignedToUserId) {
      setError('All ticket fields are required.');
      return;
    }
    setLoading(true);
    try {
      const ticket = await ticketsApi.createOnBehalf({
        clientEmail: client.email,
        title,
        description,
        source,
        helpTopicId,
        departmentId,
        slaPlanId,
        dueDateUtc: new Date(dueDate).toISOString(),
        assignedToUserId,
      });
      if (fromEmailMessageId) {
        await emailIntegrationApi.completeTicket(fromEmailMessageId, ticket.id);
      }
      navigate(`/tickets/${ticket.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not create the ticket.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">New ticket on behalf of a client</h1>
        <p className="mt-1 text-sm text-slate-500">
          Use this when a client reports an issue by phone (or in person) instead of through the client portal.
          The ticket will show up exactly as if the client had submitted it themselves.
        </p>
      </div>

      {prefilledFromEmail && (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
          ✉️ Title, description and sender were pulled from the marked email.
          {emailHasAttachments && ' Its attachments will be added to the ticket automatically once created.'}
        </p>
      )}

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">1. Find the client</h2>
        <form onSubmit={handleLookup} className="flex gap-2">
          <Input type="email" required placeholder="client@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" disabled={looking}>
            {looking ? 'Looking…' : 'Find client'}
          </Button>
        </form>
        <ErrorText>{lookupError}</ErrorText>
        {client && (
          <div className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-900">
            <div className="font-semibold">
              {client.firstName} {client.lastName}
            </div>
            <div>{client.email}</div>
            <div>{client.companyName ?? 'No company on file'}</div>
            <div>{client.phoneNumber ?? 'No phone number on file'}</div>
          </div>
        )}
      </Card>

      {client && (
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">2. Describe the issue &amp; open the ticket</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary of the issue" />
            </div>
            <div>
              <Label>Description *</Label>
              <RichTextEditor value={description} onChange={setDescription} placeholder="Describe the issue as reported by the client…" />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                <Label>Branch</Label>
                {isAdmin ? (
                  <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                    <option value="">Select a branch…</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {user?.departmentName ?? 'No branch assigned'}
                  </div>
                )}
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
            </div>

            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating…' : 'Create & open ticket'}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
