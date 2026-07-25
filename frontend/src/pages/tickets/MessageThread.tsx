import { useState } from 'react';
import { format } from 'date-fns';
import { ticketsApi } from '../../api/tickets';
import type { MessageType, TicketDetailDto, TicketMessageDto } from '../../types';
import { Button, Card } from '../../components/ui';
import { RichTextEditor } from '../../components/RichTextEditor';

export function MessageThread({
  ticket,
  messages,
  type,
  canReply,
  onMessageAdded,
}: {
  ticket: TicketDetailDto;
  messages: TicketMessageDto[];
  type: MessageType;
  canReply: boolean;
  onMessageAdded: (m: TicketMessageDto) => void;
}) {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!body.trim() || body === '<p></p>') return;
    setSending(true);
    try {
      const message = (await ticketsApi.addMessage(ticket.id, type, body)) as TicketMessageDto;
      if (files.length > 0) {
        const uploaded = await ticketsApi.uploadAttachments(ticket.id, files, message.id);
        message.attachments = uploaded;
      }
      onMessageAdded(message);
      setBody('');
      setFiles([]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {messages.length === 0 && <p className="text-sm text-slate-400">No messages yet.</p>}
        {messages.map((m) => (
          <Card key={m.id} className={`p-4 ${type === 'InternalNote' ? 'border-amber-200 bg-amber-50' : ''}`}>
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{m.authorName}</span>
              <span>{format(new Date(m.createdAt), 'dd.MM.yyyy HH:mm')}</span>
            </div>
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: m.bodyHtml }} />
            {m.attachments.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs">
                {m.attachments.map((a) => (
                  <li key={a.id}>
                    <a href={a.fileUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                      📎 {a.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      {canReply && (
        <div className="space-y-2">
          <RichTextEditor value={body} onChange={setBody} placeholder={type === 'Response' ? 'Write a reply…' : 'Write an internal note (not visible to the client)…'} />
          <input
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block text-xs text-slate-500"
          />
          <Button onClick={handleSend} disabled={sending}>
            {sending ? 'Sending…' : type === 'Response' ? 'Send reply' : 'Add internal note'}
          </Button>
        </div>
      )}
    </div>
  );
}
