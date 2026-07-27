import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ticketsApi } from '../../api/tickets';
import type { MessageType, TicketDetailDto } from '../../types';
import { Card, Spinner, StatusBadge } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { OpenTicketForm } from './OpenTicketForm';
import { CloseTicketForm } from './CloseTicketForm';
import { MessageThread } from './MessageThread';
import { KnowledgeBaseSearchPanel } from './KnowledgeBaseSearchPanel';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm text-slate-800">{value ?? '—'}</div>
    </div>
  );
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const [ticket, setTicket] = useState<TicketDetailDto | null>(null);
  const [tab, setTab] = useState<MessageType>('Response');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    ticketsApi.getById(id).then(setTicket).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8 text-blue-700" />
      </div>
    );
  }
  if (!ticket || !user) return <p>Ticket not found.</p>;

  const isStaff = user.role === 'Admin' || user.role === 'Consultant' || user.role === 'SupportAgent';
  const canOpen = isStaff && ticket.status === 'New';
  const canClose = isStaff && ticket.status !== 'New' && ticket.status !== 'Closed';
  const canSeeInternalNotes = user.role !== 'Client';
  const canReplyResponse = ticket.status !== 'Closed';
  const canReplyInternal = ticket.status !== 'Closed' && canSeeInternalNotes;

  const responseMessages = ticket.messages.filter((m) => m.type === 'Response');
  const internalMessages = ticket.messages.filter((m) => m.type === 'InternalNote');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">
            #{ticket.ticketNumber} — {ticket.title}
          </h1>
          <StatusBadge status={ticket.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Submitted by {ticket.clientName} ({ticket.companyName}) on {format(new Date(ticket.createdAt), 'dd.MM.yyyy HH:mm')}
        </p>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Original request</h2>
        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: ticket.description }} />
        {ticket.attachments.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs">
            {ticket.attachments.map((a) => (
              <li key={a.id}>
                <a href={a.fileUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                  📎 {a.fileName}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {ticket.status !== 'New' && (
        <Card className="grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
          <InfoRow label="Source" value={ticket.source} />
          <InfoRow label="Help topic" value={ticket.helpTopicName} />
          <InfoRow label="Department" value={ticket.departmentName} />
          <InfoRow label="SLA plan" value={ticket.slaPlanName} />
          <InfoRow label="Due date" value={ticket.dueDateUtc ? format(new Date(ticket.dueDateUtc), 'dd.MM.yyyy HH:mm') : null} />
          <InfoRow label="Assigned to" value={ticket.assignedToName} />
          <InfoRow label="Opened at" value={ticket.openedAtUtc ? format(new Date(ticket.openedAtUtc), 'dd.MM.yyyy HH:mm') : null} />
          <InfoRow label="Closed at" value={ticket.closedAtUtc ? format(new Date(ticket.closedAtUtc), 'dd.MM.yyyy HH:mm') : null} />
        </Card>
      )}

      {ticket.status === 'Closed' && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Resolution</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-800">{ticket.resolutionSummary}</p>
          {canSeeInternalNotes && ticket.technicalNotes && (
            <div className="mt-3 rounded-md bg-slate-50 p-3">
              <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Technical / code-change log</div>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{ticket.technicalNotes}</p>
            </div>
          )}
        </Card>
      )}

      {canSeeInternalNotes && <KnowledgeBaseSearchPanel initialQuery={ticket.title} />}

      {canOpen && <OpenTicketForm ticket={ticket} onOpened={setTicket} />}

      <Card className="p-5">
        {canSeeInternalNotes ? (
          <div className="mb-4 flex gap-2 border-b border-slate-200">
            <button
              onClick={() => setTab('Response')}
              className={`px-3 py-2 text-sm font-medium ${tab === 'Response' ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500'}`}
            >
              Response
            </button>
            <button
              onClick={() => setTab('InternalNote')}
              className={`px-3 py-2 text-sm font-medium ${tab === 'InternalNote' ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500'}`}
            >
              Internal Note
            </button>
          </div>
        ) : (
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Response</h2>
        )}

        {tab === 'Response' || !canSeeInternalNotes ? (
          <MessageThread ticket={ticket} messages={responseMessages} type="Response" canReply={canReplyResponse} onMessageAdded={(m) => setTicket({ ...ticket, messages: [...ticket.messages, m] })} />
        ) : (
          <MessageThread ticket={ticket} messages={internalMessages} type="InternalNote" canReply={canReplyInternal} onMessageAdded={(m) => setTicket({ ...ticket, messages: [...ticket.messages, m] })} />
        )}
      </Card>

      {canClose && <CloseTicketForm ticket={ticket} onClosed={setTicket} />}
    </div>
  );
}
