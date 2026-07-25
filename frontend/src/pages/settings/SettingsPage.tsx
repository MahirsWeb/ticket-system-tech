import { useEffect, useState } from 'react';
import { lookupsApi } from '../../api/lookups';
import type { LookupItemFull, SlaPlanItemFull } from '../../types';
import { Button, Card, ErrorText, Input, Label } from '../../components/ui';

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
  const [departments, setDepartments] = useState<LookupItemFull[]>([]);
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

      <SimpleLookupSection
        title="Departments"
        items={departments}
        onRefresh={refreshDepartments}
        onCreate={lookupsApi.createDepartment}
        onUpdate={lookupsApi.updateDepartment}
      />
      <SimpleLookupSection
        title="Help Topics"
        items={helpTopics}
        onRefresh={refreshHelpTopics}
        onCreate={lookupsApi.createHelpTopic}
        onUpdate={lookupsApi.updateHelpTopic}
      />
      <SlaPlansSection items={slaPlans} onRefresh={refreshSlaPlans} />
    </div>
  );
}
