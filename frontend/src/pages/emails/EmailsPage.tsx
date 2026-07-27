import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { emailIntegrationApi, type InboxMessageSummaryDto } from '../../api/emailIntegration';
import { Button, Card, Spinner } from '../../components/ui';
import { formatDistanceToNow } from 'date-fns';

function buildMicrosoftAuthUrl(clientId: string, redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'offline_access Mail.Read User.Read',
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

export default function EmailsPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessageSummaryDto[]>([]);
  const [tab, setTab] = useState<'inbox' | 'marked'>('inbox');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refreshMessages() {
    emailIntegrationApi
      .listMessages(30)
      .then(setMessages)
      .catch(() => setError('Could not load your inbox. Try reconnecting your mailbox.'));
  }

  useEffect(() => {
    emailIntegrationApi
      .getStatus()
      .then((s) => {
        setConnected(s.connected);
        setConnectedEmail(s.connectedEmail);
        if (s.connected) refreshMessages();
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleConnect() {
    setConnecting(true);
    const { clientId } = await emailIntegrationApi.getConfig();
    if (!clientId) {
      setError('Outlook integration is not configured yet (missing Client ID). Ask an admin to finish setup.');
      setConnecting(false);
      return;
    }
    const redirectUri = `${window.location.origin}/emails/callback`;
    const state = Math.random().toString(36).slice(2);
    sessionStorage.setItem('ms_oauth_state', state);
    window.location.href = buildMicrosoftAuthUrl(clientId, redirectUri, state);
  }

  async function handleToggleMark(m: InboxMessageSummaryDto) {
    const marked = await emailIntegrationApi.setMarked(m.messageId, !m.isMarked);
    setMessages((prev) => prev.map((x) => (x.messageId === m.messageId ? { ...x, isMarked: marked } : x)));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8 text-blue-700" />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="mb-2 text-xl font-bold text-slate-900">Emails</h1>
        <Card className="p-6 text-center">
          <p className="mb-4 text-sm text-slate-600">
            Connect your Outlook mailbox to see incoming emails here and turn them into tickets without leaving
            this app.
          </p>
          {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Redirecting…' : '🔗 Connect Outlook'}
          </Button>
        </Card>
      </div>
    );
  }

  const visible = tab === 'inbox' ? messages : messages.filter((m) => m.isMarked);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Emails</h1>
          <p className="text-xs text-slate-400">Connected: {connectedEmail}</p>
        </div>
        <Button variant="secondary" onClick={refreshMessages}>
          Refresh
        </Button>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setTab('inbox')}
          className={`px-3 py-2 text-sm font-medium ${tab === 'inbox' ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500'}`}
        >
          Inbox
        </button>
        <button
          onClick={() => setTab('marked')}
          className={`px-3 py-2 text-sm font-medium ${tab === 'marked' ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500'}`}
        >
          Marked for tickets ({messages.filter((m) => m.isMarked).length})
        </button>
      </div>

      <Card className="divide-y divide-slate-100">
        {visible.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-400">
            {tab === 'inbox' ? 'No emails found.' : 'No emails marked as tickets yet.'}
          </p>
        )}
        {visible.map((m) => (
          <div key={m.messageId} className="flex items-start gap-3 px-4 py-3">
            <input
              type="checkbox"
              checked={m.isMarked}
              onChange={() => handleToggleMark(m)}
              className="mt-1.5 h-4 w-4"
              title="Mark as ticket"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-slate-800">{m.subject}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {formatDistanceToNow(new Date(m.receivedAtUtc), { addSuffix: true })}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                {m.fromName ? `${m.fromName} <${m.fromEmail}>` : m.fromEmail}
                {m.hasAttachments && <span className="ml-1">📎</span>}
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-400">{m.bodyPreview}</p>
            </div>
            {m.isMarked && (
              <div className="shrink-0">
                {m.convertedTicketId ? (
                  <Link to={`/tickets/${m.convertedTicketId}`} className="text-xs font-medium text-green-700 hover:underline">
                    View ticket →
                  </Link>
                ) : (
                  <Link
                    to={`/tickets/new-on-behalf?fromEmail=${encodeURIComponent(m.messageId)}`}
                    className="text-xs font-medium text-blue-700 hover:underline"
                  >
                    Open ticket →
                  </Link>
                )}
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
