import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { lookupsApi } from '../../api/lookups';
import { settingsApi } from '../../api/settings';
import type { DepartmentItemFull, LookupItemFull, SlaPlanItemFull, SubBranchItemFull } from '../../types';
import { Button, Card, ErrorText, Input, Label, StatusPill, SuccessText } from '../../components/ui';
import { ConfirmDialog } from '../../components/ConfirmDialog';

type TabKey = 'branches' | 'helpTopics' | 'slaPlans' | 'notifications';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'branches', label: 'Branches', icon: '🏢' },
  { key: 'helpTopics', label: 'Help Topics', icon: '🏷️' },
  { key: 'slaPlans', label: 'SLA Plans', icon: '⏱️' },
  { key: 'notifications', label: 'Notifications', icon: '⏰' },
];

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Card className={clsx('p-5', className)}>{children}</Card>;
}

function ListRow({ children }: { children: React.ReactNode }) {
  return <div className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition hover:bg-slate-50">{children}</div>;
}

function SubBranchesInline({ departmentId }: { departmentId: string }) {
  const [items, setItems] = useState<SubBranchItemFull[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function refresh() {
    lookupsApi.subBranchesAdmin(departmentId).then((items) => {
      setItems(items);
      setLoading(false);
    });
  }

  useEffect(refresh, [departmentId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    try {
      await lookupsApi.createSubBranch(departmentId, name.trim());
      setName('');
      refresh();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not add sub-branch.');
    }
  }

  async function handleToggleActive(item: SubBranchItemFull) {
    await lookupsApi.updateSubBranch(item.id, item.name, !item.isActive);
    refresh();
  }

  if (loading) return <p className="py-2 text-xs text-slate-400">Loading sub-branches…</p>;

  return (
    <div className="mt-1 mb-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
      <p className="mb-2 text-xs text-slate-500">
        Optional finer units within this branch, sharing its email but tracked separately for statistics and
        ticket assignment. If any exist, staff and tickets in this branch must pick one.
      </p>
      <form onSubmit={handleCreate} className="mb-2 flex gap-2">
        <Input placeholder="Sub-branch name…" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs text-xs" />
        <Button type="submit" variant="secondary" className="text-xs">
          Add
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>
      <div className="divide-y divide-slate-100">
        {items.map((item) => (
          <ListRow key={item.id}>
            <span className="text-sm text-slate-700">{item.name}</span>
            <div className="flex items-center gap-2">
              <StatusPill active={item.isActive} />
              <button className="text-xs text-slate-500 hover:underline" onClick={() => handleToggleActive(item)}>
                {item.isActive ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </ListRow>
        ))}
        {items.length === 0 && <p className="py-2 text-xs text-slate-400">No sub-branches — this branch is used as a single unit.</p>}
      </div>
    </div>
  );
}

function BranchesTab({ items, onRefresh }: { items: DepartmentItemFull[]; onRefresh: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingEmail, setEditingEmail] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DepartmentItemFull | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q));
  }, [items, search]);

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

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    setDeleteError(null);
    try {
      await lookupsApi.deleteDepartment(confirmDelete.id);
      setConfirmDelete(null);
      onRefresh();
    } catch (err: any) {
      setDeleteError(err?.response?.data?.message ?? 'Could not delete this branch.');
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      <Panel className="h-fit">
        <h2 className="text-sm font-bold text-slate-800">Add new branch</h2>
        <p className="mt-0.5 mb-4 text-xs text-slate-400">Every branch needs a dedicated email address.</p>
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <Label>Branch name</Label>
            <Input placeholder="e.g. Servis" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Branch email</Label>
            <Input type="email" placeholder="servis@firma.ba" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" className="w-full">
            + Add Branch
          </Button>
        </form>
      </Panel>

      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-800">Existing branches ({items.length})</h2>
          <Input placeholder="Search branches…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        </div>
        <div className="divide-y divide-slate-100">
          {filtered.map((item) => (
            <div key={item.id}>
              <ListRow>
                {editingId === item.id ? (
                  <div className="flex flex-1 gap-2">
                    <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="max-w-xs" />
                    <Input type="email" value={editingEmail} onChange={(e) => setEditingEmail(e.target.value)} className="max-w-xs" />
                  </div>
                ) : (
                  <span className="text-sm text-slate-800">
                    {item.name} <span className="text-xs text-slate-400">— {item.email}</span>
                  </span>
                )}
                <div className="flex shrink-0 items-center gap-3 text-xs">
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
                      <StatusPill active={item.isActive} />
                      <button className="text-slate-500 hover:underline" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                        {expandedId === item.id ? 'Hide sub-branches' : 'Sub-branches'}
                      </button>
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
                      <button className="font-medium text-red-600 hover:underline" onClick={() => setConfirmDelete(item)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </ListRow>
              {expandedId === item.id && <SubBranchesInline departmentId={item.id} />}
            </div>
          ))}
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No branches found.</p>}
        </div>
      </Panel>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this branch?"
          message={`"${confirmDelete.name}" will be permanently deleted. Any tickets or staff currently assigned to it will simply become unassigned from a branch — nothing else is deleted.${deleteError ? `\n\n${deleteError}` : ''}`}
          confirmLabel="Delete"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setConfirmDelete(null);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}

function SimpleLookupTab({
  itemNoun,
  items,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
  deleteWarning,
}: {
  itemNoun: string;
  items: LookupItemFull[];
  onRefresh: () => void;
  onCreate: (name: string) => Promise<unknown>;
  onUpdate: (id: string, name: string, isActive: boolean) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  deleteWarning: string;
}) {
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<LookupItemFull | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

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

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    setDeleteError(null);
    try {
      await onDelete(confirmDelete.id);
      setConfirmDelete(null);
      onRefresh();
    } catch (err: any) {
      setDeleteError(err?.response?.data?.message ?? 'Could not delete this item.');
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      <Panel className="h-fit">
        <h2 className="text-sm font-bold text-slate-800">Add new {itemNoun}</h2>
        <form onSubmit={handleCreate} className="mt-4 space-y-3">
          <div>
            <Label>Name</Label>
            <Input placeholder={`Enter ${itemNoun} name…`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" className="w-full">
            + Add {itemNoun}
          </Button>
        </form>
      </Panel>

      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-800">
            Existing {itemNoun}s ({items.length})
          </h2>
          <Input placeholder={`Search ${itemNoun}s…`} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        </div>
        <div className="divide-y divide-slate-100">
          {filtered.map((item) => (
            <ListRow key={item.id}>
              {editingId === item.id ? (
                <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="max-w-xs" />
              ) : (
                <span className="text-sm text-slate-800">{item.name}</span>
              )}
              <div className="flex items-center gap-3 text-xs">
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
                    <StatusPill active={item.isActive} />
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
                    <button className="font-medium text-red-600 hover:underline" onClick={() => setConfirmDelete(item)}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </ListRow>
          ))}
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No {itemNoun}s found.</p>}
        </div>
      </Panel>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${confirmDelete.name}"?`}
          message={`${deleteWarning}${deleteError ? `\n\n${deleteError}` : ''}`}
          confirmLabel="Delete"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setConfirmDelete(null);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}

function SlaPlansTab({ items, onRefresh }: { items: SlaPlanItemFull[]; onRefresh: () => void }) {
  const [name, setName] = useState('');
  const [resolutionHours, setResolutionHours] = useState(72);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SlaPlanItemFull | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    try {
      await lookupsApi.createSlaPlan(name.trim(), resolutionHours);
      setName('');
      onRefresh();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not add SLA plan.');
    }
  }

  async function handleToggleActive(item: SlaPlanItemFull) {
    await lookupsApi.updateSlaPlan(item.id, item.name, item.resolutionTimeHours, !item.isActive);
    onRefresh();
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    setDeleteError(null);
    try {
      await lookupsApi.deleteSlaPlan(confirmDelete.id);
      setConfirmDelete(null);
      onRefresh();
    } catch (err: any) {
      setDeleteError(err?.response?.data?.message ?? 'Could not delete this SLA plan.');
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      <Panel className="h-fit">
        <h2 className="text-sm font-bold text-slate-800">Add new SLA plan</h2>
        <form onSubmit={handleCreate} className="mt-4 space-y-3">
          <div>
            <Label>Name</Label>
            <Input placeholder="e.g. Standard" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Resolution time (hours)</Label>
            <Input type="number" min={1} value={resolutionHours} onChange={(e) => setResolutionHours(Number(e.target.value))} />
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" className="w-full">
            + Add SLA Plan
          </Button>
        </form>
      </Panel>

      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-800">Existing SLA plans ({items.length})</h2>
          <Input placeholder="Search SLA plans…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        </div>
        <div className="divide-y divide-slate-100">
          {filtered.map((item) => (
            <ListRow key={item.id}>
              <span className="text-sm text-slate-800">
                {item.name} <span className="text-xs text-slate-400">— {item.resolutionTimeHours}h resolution</span>
              </span>
              <div className="flex items-center gap-3 text-xs">
                <StatusPill active={item.isActive} />
                <button className="text-slate-500 hover:underline" onClick={() => handleToggleActive(item)}>
                  {item.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
                <button className="font-medium text-red-600 hover:underline" onClick={() => setConfirmDelete(item)}>
                  Delete
                </button>
              </div>
            </ListRow>
          ))}
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No SLA plans found.</p>}
        </div>
      </Panel>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${confirmDelete.name}"?`}
          message={`This SLA plan will be permanently deleted. Any tickets currently using it simply lose their SLA plan reference — nothing else is affected.${deleteError ? `\n\n${deleteError}` : ''}`}
          confirmLabel="Delete"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setConfirmDelete(null);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}

function NotificationsTab() {
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
    <Panel className="max-w-lg">
      <h2 className="text-sm font-bold text-slate-800">Overdue ticket notifications</h2>
      <p className="mt-0.5 mb-4 text-xs text-slate-400">
        Emails every assignee once a ticket first becomes overdue. Each ticket is only notified once.
      </p>
      <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={notifyOnSlaBreach} onChange={(e) => setNotifyOnSlaBreach(e.target.checked)} />
        Notify when a ticket passes its SLA due date
      </label>
      <Label>Also notify after this many days open (optional)</Label>
      <Input
        type="number"
        min={1}
        max={365}
        placeholder="e.g. 3"
        value={manualOverdueDays}
        onChange={(e) => setManualOverdueDays(e.target.value)}
        className="max-w-[8rem]"
      />
      <div className="mt-4">
        <ErrorText>{error}</ErrorText>
        <SuccessText>{saved ? 'Saved.' : null}</SuccessText>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Panel>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>('branches');
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
      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage the dropdown values agents choose from when opening a ticket. Only Admins can change these.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition',
              tab === t.key ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'branches' && <BranchesTab items={departments} onRefresh={refreshDepartments} />}
      {tab === 'helpTopics' && (
        <SimpleLookupTab
          itemNoun="help topic"
          items={helpTopics}
          onRefresh={refreshHelpTopics}
          onCreate={lookupsApi.createHelpTopic}
          onUpdate={lookupsApi.updateHelpTopic}
          onDelete={lookupsApi.deleteHelpTopic}
          deleteWarning="This help topic will be permanently deleted. Any tickets currently using it simply lose their help topic reference — nothing else is affected."
        />
      )}
      {tab === 'slaPlans' && <SlaPlansTab items={slaPlans} onRefresh={refreshSlaPlans} />}
      {tab === 'notifications' && <NotificationsTab />}
    </div>
  );
}
