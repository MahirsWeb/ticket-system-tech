import { Fragment, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuthStore } from '../../store/authStore';
import { usersApi } from '../../api/users';
import { lookupsApi } from '../../api/lookups';
import type { CompanyItemFull, CreatedUserResponse, DepartmentItemFull, SubBranchItemFull, UserListItemDto, UserRole } from '../../types';
import { Button, Card, ErrorText, Input, Label, Select, StatusPill } from '../../components/ui';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TempPasswordModal } from './TempPasswordModal';

export default function UsersPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'Admin';
  const canSeeEmployees = isAdmin; // non-admin staff only manage clients here
  const [searchParams] = useSearchParams();
  const preselectedCompanyId = searchParams.get('companyId');

  const [tab, setTab] = useState<'clients' | 'employees'>('clients');
  const [users, setUsers] = useState<UserListItemDto[]>([]);
  const [companies, setCompanies] = useState<CompanyItemFull[]>([]);
  const [departments, setDepartments] = useState<DepartmentItemFull[]>([]);
  const [subBranchesByDept, setSubBranchesByDept] = useState<Record<string, SubBranchItemFull[]>>({});
  const [result, setResult] = useState<CreatedUserResponse | null>(null);
  const [confirmRegenerateFor, setConfirmRegenerateFor] = useState<UserListItemDto | null>(null);
  const [confirmDeactivateFor, setConfirmDeactivateFor] = useState<UserListItemDto | null>(null);
  const [editingUser, setEditingUser] = useState<UserListItemDto | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [accountType, setAccountType] = useState<'Client' | UserRole>('Client');
  const [companyId, setCompanyId] = useState(preselectedCompanyId ?? '');
  const [departmentId, setDepartmentId] = useState('');
  const [subBranchId, setSubBranchId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const needsBranch = accountType === 'Employee';
  const availableSubBranches = departmentId ? subBranchesByDept[departmentId] ?? [] : [];

  function refreshUsers() {
    usersApi.list().then(setUsers);
  }

  async function getSubBranches(deptId: string): Promise<SubBranchItemFull[]> {
    if (subBranchesByDept[deptId]) return subBranchesByDept[deptId];
    const items = await lookupsApi.subBranches(deptId);
    setSubBranchesByDept((prev) => ({ ...prev, [deptId]: items }));
    return items;
  }

  useEffect(() => {
    refreshUsers();
    lookupsApi.companies().then(setCompanies);
    lookupsApi.departments().then(setDepartments);
  }, []);

  useEffect(() => {
    if (needsBranch && departmentId) getSubBranches(departmentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, needsBranch]);

  function resetForm() {
    setEditingUser(null);
    setFirstName('');
    setLastName('');
    setEmail('');
    setAccountType('Client');
    setCompanyId('');
    setDepartmentId('');
    setSubBranchId('');
    setError(null);
  }

  function startEdit(u: UserListItemDto) {
    setEditingUser(u);
    setFirstName(u.firstName);
    setLastName(u.lastName);
    setEmail(u.email);
    setAccountType(u.role as 'Client' | UserRole);
    setCompanyId(u.companyId ?? '');
    setDepartmentId(u.departmentId ?? '');
    setSubBranchId(u.subBranchId ?? '');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (accountType === 'Client' && !companyId) {
      setError('Please select a company.');
      return;
    }
    if (needsBranch && !departmentId) {
      setError('Please select a branch.');
      return;
    }
    if (needsBranch && availableSubBranches.length > 0 && !subBranchId) {
      setError('Please select a sub-branch.');
      return;
    }

    setLoading(true);
    try {
      if (editingUser) {
        await usersApi.updateUser(editingUser.id, {
          firstName,
          lastName,
          role: accountType as UserRole,
          companyId: accountType === 'Client' ? companyId : undefined,
          departmentId: needsBranch ? departmentId : undefined,
          subBranchId: needsBranch ? subBranchId || undefined : undefined,
        });
        resetForm();
        refreshUsers();
      } else {
        let created: CreatedUserResponse;
        if (accountType === 'Client') {
          created = await usersApi.createClient(firstName, lastName, email, companyId);
        } else {
          created = await usersApi.createEmployee(
            firstName,
            lastName,
            email,
            accountType,
            needsBranch ? departmentId : undefined,
            needsBranch ? subBranchId || undefined : undefined
          );
        }
        setResult(created);
        resetForm();
        refreshUsers();
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? `Could not ${editingUser ? 'update' : 'create'} the account.`);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerateConfirmed() {
    if (!confirmRegenerateFor) return;
    const target = confirmRegenerateFor;
    setConfirmRegenerateFor(null);
    setResult(await usersApi.regenerateTempPassword(target.id));
  }

  async function handleToggleActive(u: UserListItemDto) {
    if (u.isActive) {
      setConfirmDeactivateFor(u);
      return;
    }
    try {
      await usersApi.setActive(u.id, true);
      refreshUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not reactivate this account.');
    }
  }

  async function handleConfirmDeactivate() {
    if (!confirmDeactivateFor) return;
    const target = confirmDeactivateFor;
    setConfirmDeactivateFor(null);
    try {
      await usersApi.setActive(target.id, false);
      refreshUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not deactivate this account.');
    }
  }

  const clients = users.filter((u) => u.role === 'Client');
  const employees = users.filter((u) => u.role !== 'Client');
  const activeTab = canSeeEmployees ? tab : 'clients';
  const visibleUsers = activeTab === 'clients' ? clients : employees;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">{isAdmin ? 'Users' : 'Clients'}</h1>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
          {editingUser ? `Edit account — ${editingUser.firstName} ${editingUser.lastName}` : 'Create account'}
        </h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <div>
            <Label>First name</Label>
            <Input required maxLength={25} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label>Last name</Label>
            <Input required maxLength={30} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div>
            <Label>Email{editingUser ? ' (cannot be changed)' : ''}</Label>
            <Input type="email" required maxLength={100} value={email} disabled={!!editingUser} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Account type</Label>
            <Select value={accountType} onChange={(e) => setAccountType(e.target.value as any)}>
              <option value="Client">Client</option>
              {isAdmin && (
                <>
                  <option value="Employee">Employee</option>
                  <option value="Admin">Admin</option>
                </>
              )}
            </Select>
          </div>
          {accountType === 'Client' && (
            <div>
              <Label>Company</Label>
              <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">Select a company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {needsBranch && (
            <div>
              <Label>Branch</Label>
              <Select
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  setSubBranchId('');
                }}
              >
                <option value="">Select a branch…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.email})
                  </option>
                ))}
              </Select>
            </div>
          )}
          {needsBranch && availableSubBranches.length > 0 && (
            <div>
              <Label>Sub-branch</Label>
              <Select value={subBranchId} onChange={(e) => setSubBranchId(e.target.value)}>
                <option value="">Select a sub-branch…</option>
                {availableSubBranches.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="col-span-2">
            <ErrorText>{error}</ErrorText>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? (editingUser ? 'Saving…' : 'Creating…') : editingUser ? 'Save changes' : 'Create account'}
              </Button>
              {editingUser && (
                <Button type="button" variant="secondary" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </form>
      </Card>

      {canSeeEmployees && (
        <div className="flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setTab('clients')}
            className={`px-3 py-2 text-sm font-medium ${activeTab === 'clients' ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500'}`}
          >
            Clients ({clients.length})
          </button>
          <button
            onClick={() => setTab('employees')}
            className={`px-3 py-2 text-sm font-medium ${activeTab === 'employees' ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500'}`}
          >
            Employees & Admins ({employees.length})
          </button>
        </div>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">{activeTab === 'employees' ? 'Branch' : 'Company'}</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((u) => {
              const isExpanded = expandedId === u.id;
              return (
                <Fragment key={u.id}>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      {u.firstName} {u.lastName}
                    </td>
                    <td className="px-4 py-2">{u.email}</td>
                    <td className="px-4 py-2 text-slate-500">{(activeTab === 'employees' ? u.departmentName : u.companyName) ?? '—'}</td>
                    <td className="px-4 py-2">
                      <StatusPill active={u.isActive} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        className="text-xs font-medium text-blue-700 hover:underline"
                        onClick={() => setExpandedId(isExpanded ? null : u.id)}
                      >
                        {isExpanded ? 'Hide info' : 'More info'}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-t border-slate-100 bg-slate-50/60">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-xs">
                          {activeTab === 'employees' ? (
                            <>
                              <span>
                                <span className="text-slate-400">Role:</span> <span className="text-slate-700">{u.role}</span>
                              </span>
                              <span>
                                <span className="text-slate-400">Sub-branch:</span>{' '}
                                <span className="text-slate-700">{u.subBranchName ?? '—'}</span>
                              </span>
                            </>
                          ) : (
                            <span>
                              <span className="text-slate-400">Created:</span>{' '}
                              <span className="text-slate-700">{format(new Date(u.createdAtUtc), 'dd.MM.yyyy')}</span>
                            </span>
                          )}
                          <span>
                            <span className="text-slate-400">Email verified:</span>{' '}
                            <span className="text-slate-700">{u.emailConfirmed ? 'Yes' : 'No'}</span>
                          </span>

                          <span className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
                            {isAdmin && (
                              <button className="font-medium text-slate-500 hover:underline" onClick={() => handleToggleActive(u)}>
                                {u.isActive ? 'Deactivate' : 'Reactivate'}
                              </button>
                            )}
                            {isAdmin && (
                              <button className="font-medium text-blue-700 hover:underline" onClick={() => startEdit(u)}>
                                Edit
                              </button>
                            )}
                            <button className="font-medium text-blue-700 hover:underline" onClick={() => setConfirmRegenerateFor(u)}>
                              Regenerate temp password
                            </button>
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {visibleUsers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No accounts here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {result && <TempPasswordModal result={result} onClose={() => setResult(null)} />}
      {confirmRegenerateFor && (
        <ConfirmDialog
          title="Regenerate temporary password?"
          message={`This immediately invalidates ${confirmRegenerateFor.firstName} ${confirmRegenerateFor.lastName}'s current password and emails them a new temporary one. Are you sure?`}
          confirmLabel="Regenerate"
          danger
          onConfirm={handleRegenerateConfirmed}
          onCancel={() => setConfirmRegenerateFor(null)}
        />
      )}
      {confirmDeactivateFor && (
        <ConfirmDialog
          title="Deactivate this account?"
          message={`${confirmDeactivateFor.firstName} ${confirmDeactivateFor.lastName} will no longer be able to log in and will stop receiving any emails from the app. You can reactivate this account at any time.`}
          confirmLabel="Deactivate"
          danger
          onConfirm={handleConfirmDeactivate}
          onCancel={() => setConfirmDeactivateFor(null)}
        />
      )}
    </div>
  );
}
