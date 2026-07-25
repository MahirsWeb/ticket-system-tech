import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ticketsApi } from '../../api/tickets';
import { Button, Card, ErrorText, Input, Label } from '../../components/ui';
import { RichTextEditor } from '../../components/RichTextEditor';

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !description.trim() || description === '<p></p>') {
      setError('Title and description are required.');
      return;
    }
    setLoading(true);
    try {
      const ticket = await ticketsApi.create(title, description);
      if (files.length > 0) {
        await ticketsApi.uploadAttachments(ticket.id, files);
      }
      navigate(`/tickets/${ticket.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not submit your ticket.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold text-slate-900">Submit a ticket</h1>
      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary of the issue" />
          </div>
          <div>
            <Label>Description *</Label>
            <RichTextEditor value={description} onChange={setDescription} placeholder="Describe the issue in detail…" />
          </div>
          <div>
            <Label>Attachments (optional)</Label>
            <input
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full text-sm text-slate-600"
            />
            {files.length > 0 && (
              <ul className="mt-2 text-xs text-slate-500">
                {files.map((f) => (
                  <li key={f.name}>{f.name}</li>
                ))}
              </ul>
            )}
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={loading}>
            {loading ? 'Submitting…' : 'Submit ticket'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
