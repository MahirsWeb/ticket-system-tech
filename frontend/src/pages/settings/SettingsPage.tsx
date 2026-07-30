import { useEffect, useState } from 'react';
import { lookupsApi } from '../../api/lookups';
import { settingsApi } from '../../api/settings';
import type { DepartmentItemFull, LookupItemFull, SlaPlanItemFull, SubBranchItemFull } from '../../types';
import { Button, Card, ErrorText, Input, Label, StatusPill, SuccessText } from '../../components/ui';
import { ConfirmDialog } from '../../components/ConfirmDialog';

function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-lg">{icon}</span>
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3.5 py-2.5">{children}</div>;
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
    <div className="mt-2 rounded-lg border border-slate-100 bg-white p-3">
      <p className="mb-2 text-xs text-slate-500">
        Optional finer units within this branch — e.g. "Consulting" and "Technical Support" both under "Software",
        sharing its email but tracked separately for statistics and ticket assignment. If any exist, staff and
        tickets in this branch must pick one.
      </p>
      <form onSubmit={handleCreate} className="mb-2 flex gap-2">
        <Input placeholder="Sub-branch name…" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs text-xs" />
        <Button type="submit" variant="secondary" className="text-xs">
          Add
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>
      <div className="space-y-1.5">
        {items.map((item) => (
          <Row key={item.id}>
            <span className="text-sm text-slate-700">{item.name}</span>
            <div className="flex items-center gap-2">
              <StatusPill active={item.isActive} />
              <button className="text-xs text-slate-500 hover:underline" onClick={() => handleToggleActive(item)}>
                {item.isActive ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </Row>
        ))}
        {items.length === 0 && <p className="py-2 text-xs text-slate-400">No sub-branches — this branch is used as a single unit.</p>}
      </div>
    </div>
  );
}

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
      <SectionHeader icon="⏰" title="Overdue ticket notifications" subtitle="Emails every assignee once a ticket first becomes overdue. Each ticket is only notified once." />
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DepartmentItemFull | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    <Card className="p-5">
      <SectionHeader
        icon="🏢"
        title="Branches"
        subtitle="Every branch needs a dedicated email address. Employees are assigned to exactly one branch; tickets and emails are isolated to that branch."
      />
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
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id}>
            <Row>
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
                    <button
                      className="text-slate-500 hover:underline"
                      onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    >
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
            </Row>
            {expandedId === item.id && <SubBranchesInline departmentId={item.id} />}
          </div>
        ))}
        {items.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No branches yet.</p>}
      </div>

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
    </Card>
  );
}

function SimpleLookupSection({
  icon,
  title,
  items,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
  deleteWarning,
}: {
  icon: string;
  title: string;
  items: LookupItemFull[];
  onRefresh: () => void;
  onCreate: (name: string) => Promise<unknown>;
  onUpdate: (id: string, name: string, isActive: boolean) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  deleteWarning: string;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<LookupItemFull | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    <Card className="p-5">
      <SectionHeader icon={icon} title={title} />
      <form onSubmit={handleCreate} className="mb-4 flex gap-2">
        <Input placeholder={`Add a new ${title.toLowerCase().replace(/s$/, '')}…`} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit">Add</Button>
      </form>
      <ErrorText>{error}</ErrorText>
      <div className="space-y-1.5">
        {items.map((item) => (
          <Row key={item.id}>
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
          </Row>
        ))}
        {items.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No items yet.</p>}
      </div>

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
    </Card>
  );
}

function SlaPlansSection({ items, onRefresh }: { items: SlaPlanItemFull[]; onRefresh: () => void }) {
  const [name, setName] = useState('');
  const [responseHours, setResponseHours] = useState(8);
  const [resolutionHours, setResolutionHours] = useState(72);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SlaPlanItemFull | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    <Card className="p-5">
      <SectionHeader icon="⏱️" title="SLA Plans" />
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
      <div className="space-y-1.5">
        {items.map((item) => (
          <Row key={item.id}>
            <span className="text-sm text-slate-800">
              {item.name} — {item.responseTimeHours}h response / {item.resolutionTimeHours}h resolution
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
          </Row>
        ))}
        {items.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No SLA plans yet.</p>}
      </div>

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
      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage the dropdown values agents choose from when opening a ticket. Only Admins can change these.
        </p>
      </div>

      <DepartmentsSection items={departments} onRefresh={refreshDepartments} />
      <SimpleLookupSection
        icon="🏷️"
        title="Help Topics"
        items={helpTopics}
        onRefresh={refreshHelpTopics}
        onCreate={lookupsApi.createHelpTopic}
        onUpdate={lookupsApi.updateHelpTopic}
        onDelete={lookupsApi.deleteHelpTopic}
        deleteWarning="This help topic will be permanently deleted. Any tickets currently using it simply lose their help topic reference — nothing else is affected."
      />
      <SlaPlansSection items={slaPlans} onRefresh={refreshSlaPlans} />
      <OverdueNotificationsSection />
    </div>
  );
}
