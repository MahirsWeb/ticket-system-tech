import { useEffect, useState } from 'react';
import { lookupsApi } from '../../api/lookups';
import { settingsApi } from '../../api/settings';
import type { DepartmentItemFull, LookupItemFull, SlaPlanItemFull } from '../../types';
import { Button, Card, ErrorText, Input, Label, SuccessText } from '../../components/ui';

function OverdueNotificationsSection() {
  const [notifyOnSlaBreach, setNotifyOnSlaBreach] = useState(true);
  const [manualOverdueDays, setManualOverdueDays] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    settingsApi
      .getOverdueNotifications()
      .then((s) => {
        setNotifyOnSlaBreach(s.notifyOnSlaBreach);
        setManualOverdueDays(s.manualOverdueDays?.toString() ?? '');
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await settingsApi.updateOverdueNotifications(notifyOnSlaBreach, manualOverdueDays.trim() ? Number(manualOverdueDays) : null);
      setSaved(true);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Overdue ticket notifications</h2>
      <p className="mb-4 text-xs text-slate-400">
        Emails every assignee once a ticket first becomes overdue. Each ticket is only notified once.
      </p>
      <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={notifyOnSlaBreach} onChange={(e) => setNotifyOnSlaBreach(e.target.checked)} />
        Notify when a ticket passes its SLA due date
      </label>
      <div className="flex items-center gap-2">
        <Label>Also notify after this many days open (optional)</Label>
      </div>
      <Input
        type="number"
        min={1}
        max={365}
        placeholder="e.g. 3"
        value={manualOverdueDays}
        onChange={(e) => setManualOverdueDays(e.target.value)}
        className="max-w-[8rem]"
      />
      <div className="mt-3">
        <ErrorText>{error}</ErrorText>
        <SuccessText>{saved ? 'Saved.' : null}</SuccessText>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Card>
  );
}

function DepartmentsSection({ items, onRefresh }: { items: DepartmentItemFull[]; onRefresh: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingEmail, setEditingEmail] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) return;
    try {
      await lookupsApi.createDepartment(name.trim(), email.trim());
      setName('');
      setEmail('');
      onRefresh();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not add branch.');
    }
  }

  async function handleToggleActive(item: DepartmentItemFull) {
    await lookupsApi.updateDepartment(item.id, item.name, item.email, !item.isActive);
    onRefresh();
  }

  async function handleSaveEdit(item: DepartmentItemFull) {
    if (!editingName.trim() || !editingEmail.trim()) return;
    try {
      await lookupsApi.updateDepartment(item.id, editingName.trim(), editingEmail.trim(), item.isActive);
      setEditingId(null);
      onRefresh();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not update branch.');
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Branches</h2>
      <p className="mb-4 text-xs text-slate-400">
        Every branch needs a dedicated email address. Employees are assigned to exactly one branch; tickets and
        emails are isolated to that branch.
      </p>
      <form onSubmit={handleCreate} className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Branch name (e.g. Servis)" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
        <Input
          type="email"
          placeholder="Branch email (e.g. servis@firma.ba)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit">Add</Button>
      </form>
      <ErrorText>{error}</ErrorText>
      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2">
            {editingId === item.id ? (
              <div className="flex flex-1 gap-2">
                <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="max-w-xs" />
                <Input type="email" value={editingEmail} onChange={(e) => setEditingEmail(e.target.value)} className="max-w-xs" />
              </div>
            ) : (
              <span className={item.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}>
                {item.name} <span className="text-xs text-slate-400">— {item.email}</span>
              </span>
            )}
            <div className="flex shrink-0 gap-2 text-xs">
              {editingId === item.id ? (
                <>
                  <button className="font-medium text-blue-700 hover:underline" onClick={() => handleSaveEdit(item)}>
                    Save
                  </button>
                  <button className="text-slate-500 hover:underline" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="font-medium text-blue-700 hover:underline"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditingName(item.name);
                      setEditingEmail(item.email);
                    }}
                  >
                    Edit
                  </button>
                  <button className="text-slate-500 hover:underline" onClick={() => handleToggleActive(item)}>
                    {item.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="py-4 text-center text-sm text-slate-400">No branches yet.</li>}
      </ul>
    </Card>
  );
}

function SimpleLookupSection({
  title,
  items,
  onRefresh,
  onCreate,
  onUpdate,
}: {
  title: string;
  items: LookupItemFull[];
  onRefresh: () => void;
  onCreate: (name: string) => Promise<unknown>;
  onUpdate: (id: string, name: string, isActive: boolean) => Promise<unknown>;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    try {
      await onCreate(name.trim());
      setName('');
      onRefresh();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not add item.');
    }
  }

  async function handleToggleActive(item: LookupItemFull) {
    await onUpdate(item.id, item.name, !item.isActive);
    onRefresh();
  }

  async function handleSaveEdit(item: LookupItemFull) {
    if (!editingName.trim()) return;
    await onUpdate(item.id, editingName.trim(), item.isActive);
    setEditingId(null);
    onRefresh();
  }

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      <form onSubmit={handleCreate} className="mb-4 flex gap-2">
        <Input placeholder={`Add a new ${title.toLowerCase().replace(/s$/, '')}…`} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit">Add</Button>
      </form>
      <ErrorText>{error}</ErrorText>
      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2">
            {editingId === item.id ? (
              <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="max-w-xs" />
            ) : (
              <span className={item.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}>{item.name}</span>
            )}
            <div className="flex gap-2 text-xs">
              {editingId === item.id ? (
                <>
                  <button className="font-medium text-blue-700 hover:underline" onClick={() => handleSaveEdit(item)}>
                    Save
                  </button>
                  <button className="text-slate-500 hover:underline" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="font-medium text-blue-700 hover:underline"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditingName(item.name);
                    }}
                  >
                    Rename
                  </button>
                  <button className="text-slate-500 hover:underline" onClick={() => handleToggleActive(item)}>
                    {item.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="py-4 text-center text-sm text-slate-400">No items yet.</li>}
      </ul>
    </Card>
  );
}

function SlaPlansSection({ items, onRefresh }: { items: SlaPlanItemFull[]; onRefresh: () => void }) {
  const [name, setName] = useState('');
  const [responseHours, setResponseHours] = useState(8);
  const [resolutionHours, setResolutionHours] = useState(72);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    try {
      await lookupsApi.createSlaPlan(name.trim(), responseHours, resolutionHours);
      setName('');
      onRefresh();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not add SLA plan.');
    }
  }

  async function handleToggleActive(item: SlaPlanItemFull) {
    await lookupsApi.updateSlaPlan(item.id, item.name, item.responseTimeHours, item.resolutionTimeHours, !item.isActive);
    onRefresh();
  }

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">SLA Plans</h2>
      <form onSubmit={handleCreate} className="mb-4 grid grid-cols-4 gap-2">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <Label>Response (h)</Label>
          <Input type="number" min={1} value={responseHours} onChange={(e) => setResponseHours(Number(e.target.value))} />
        </div>
        <div>
          <Label>Resolution (h)</Label>
          <Input type="number" min={1} value={resolutionHours} onChange={(e) => setResolutionHours(Number(e.target.value))} />
        </div>
        <Button type="submit" className="self-end">
          Add
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>
      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between py-2">
            <span className={item.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}>
              {item.name} — {item.responseTimeHours}h response / {item.resolutionTimeHours}h resolution
            </span>
            <button className="text-xs text-slate-500 hover:underline" onClick={() => handleToggleActive(item)}>
              {item.isActive ? 'Deactivate' : 'Reactivate'}
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="py-4 text-center text-sm text-slate-400">No SLA plans yet.</li>}
      </ul>
    </Card>
  );
}

export default function SettingsPage() {
  const [departments, setDepartments] = useState<DepartmentItemFull[]>([]);
  const [helpTopics, setHelpTopics] = useState<LookupItemFull[]>([]);
  const [slaPlans, setSlaPlans] = useState<SlaPlanItemFull[]>([]);

  function refreshDepartments() {
    lookupsApi.departmentsAdmin().then(setDepartments);
  }
  function refreshHelpTopics() {
    lookupsApi.helpTopicsAdmin().then(setHelpTopics);
  }
  function refreshSlaPlans() {
    lookupsApi.slaPlansAdmin().then(setSlaPlans);
  }

  useEffect(() => {
    refreshDepartments();
    refreshHelpTopics();
    refreshSlaPlans();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Settings</h1>
      <p className="text-sm text-slate-500">
        Manage the dropdown values agents choose from when opening a ticket. Only Admins can change these.
      </p>

      <DepartmentsSection items={departments} onRefresh={refreshDepartments} />
      <SimpleLookupSection
        title="Help Topics"
        items={helpTopics}
        onRefresh={refreshHelpTopics}
        onCreate={lookupsApi.createHelpTopic}
        onUpdate={lookupsApi.updateHelpTopic}
      />
      <SlaPlansSection items={slaPlans} onRefresh={refreshSlaPlans} />
      <OverdueNotificationsSection />
    </div>
  );
}
