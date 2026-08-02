import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuthStore } from '../../store/authStore';
import { usersApi } from '../../api/users';
import { lookupsApi } from '../../api/lookups';
import type { CompanyItemFull, CreatedUserResponse, DepartmentItemFull, LookupItem, SubBranchItemFull, UserListItemDto, UserRole } from '../../types';
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
  const [staffPositions, setStaffPositions] = useState<LookupItem[]>([]);
  const [result, setResult] = useState<CreatedUserResponse | null>(null);
  const [confirmRegenerateFor, setConfirmRegenerateFor] = useState<UserListItemDto | null>(null);
  const [confirmDeactivateFor, setConfirmDeactivateFor] = useState<UserListItemDto | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [accountType, setAccountType] = useState<'Client' | UserRole>('Client');
  const [companyId, setCompanyId] = useState(preselectedCompanyId ?? '');
  const [departmentId, setDepartmentId] = useState('');
  const [subBranchId, setSubBranchId] = useState('');
  const [staffPositionId, setStaffPositionId] = useState('');
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
    lookupsApi.staffPositions().then(setStaffPositions);
  }, []);

  useEffect(() => {
    if (needsBranch && departmentId) getSubBranches(departmentId);
    setSubBranchId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, needsBranch]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let created: CreatedUserResponse;
      if (accountType === 'Client') {
        if (!companyId) {
          setError('Please select a company.');
          setLoading(false);
          return;
        }
        created = await usersApi.createClient(firstName, lastName, email, companyId);
      } else {
        if (needsBranch && !departmentId) {
          setError('Please select a branch.');
          setLoading(false);
          return;
        }
        if (needsBranch && availableSubBranches.length > 0 && !subBranchId) {
          setError('Please select a sub-branch.');
          setLoading(false);
          return;
        }
        created = await usersApi.createEmployee(
          firstName,
          lastName,
          email,
          accountType,
          needsBranch ? departmentId : undefined,
          needsBranch ? subBranchId || undefined : undefined,
          needsBranch ? staffPositionId || undefined : undefined
        );
      }
      setResult(created);
      setFirstName('');
      setLastName('');
      setEmail('');
      setCompanyId('');
      setDepartmentId('');
      setSubBranchId('');
      setStaffPositionId('');
      refreshUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not create the account.');
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
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Create account</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
          <div>
            <Label>First name</Label>
            <Input required maxLength={25} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label>Last name</Label>
            <Input required maxLength={30} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" required maxLength={100} value={email} onChange={(e) => setEmail(e.target.value)} />
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
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
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
          {needsBranch && (
            <div>
              <Label>Position (optional)</Label>
              <Select value={staffPositionId} onChange={(e) => setStaffPositionId(e.target.value)}>
                <option value="">No position</option>
                {staffPositions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="col-span-2">
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating…' : 'Create account'}
            </Button>
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
        <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              {activeTab === 'employees' ? (
                <>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Position</th>
                  <th className="px-4 py-2">Branch</th>
                  <th className="px-4 py-2">Sub-branch</th>
                </>
              ) : (
                <>
                  <th className="px-4 py-2">Company</th>
                  <th className="px-4 py-2">Created</th>
                </>
              )}
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Email verified</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  {u.firstName} {u.lastName}
                </td>
                <td className="px-4 py-2">{u.email}</td>
                {activeTab === 'employees' ? (
                  <>
                    <td className="px-4 py-2">{u.role}</td>
                    <td className="px-4 py-2">
                      {isAdmin && u.role === 'Employee' ? (
                        <Select
                          value={u.staffPositionId ?? ''}
                          onChange={async (e) => {
                            try {
                              await usersApi.setStaffPosition(u.id, e.target.value || null);
                              refreshUsers();
                            } catch (err: any) {
                              setError(err?.response?.data?.message ?? "Could not update this user's position.");
                            }
                          }}
                          className="w-36 py-1 text-xs"
                        >
                          <option value="">No position</option>
                          {staffPositions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        u.staffPositionName ?? '—'
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {isAdmin && u.role === 'Employee' ? (
                        <Select
                          value={u.departmentId ?? ''}
                          onChange={async (e) => {
                            try {
                              await usersApi.setBranch(u.id, e.target.value || null, null);
                              refreshUsers();
                            } catch (err: any) {
                              setError(err?.response?.data?.message ?? "Could not update this user's branch.");
                            }
                          }}
                          className="w-40 py-1 text-xs"
                        >
                          <option value="">No branch</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        u.departmentName ?? '—'
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {isAdmin && u.departmentId && u.role === 'Employee' ? (
                        <SubBranchInlineSelect
                          departmentId={u.departmentId}
                          value={u.subBranchId}
                          onChange={async (newSubBranchId) => {
                            try {
                              await usersApi.setBranch(u.id, u.departmentId, newSubBranchId);
                              refreshUsers();
                            } catch (err: any) {
                              setError(err?.response?.data?.message ?? "Could not update this user's sub-branch.");
                            }
                          }}
                        />
                      ) : (
                        u.subBranchName ?? '—'
                      )}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2">{u.companyName ?? '—'}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-slate-500">{format(new Date(u.createdAtUtc), 'dd.MM.yyyy')}</td>
                  </>
                )}
                <td className="px-4 py-2">
                  {isAdmin ? (
                    <div className="flex items-center gap-2">
                      <StatusPill active={u.isActive} />
                      <button className="text-xs text-slate-500 hover:underline" onClick={() => handleToggleActive(u)}>
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  ) : (
                    <StatusPill active={u.isActive} />
                  )}
                </td>
                <td className="px-4 py-2">{u.emailConfirmed ? 'Yes' : 'No'}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    className="text-xs font-medium text-blue-700 hover:underline"
                    onClick={() => setConfirmRegenerateFor(u)}
                  >
                    Regenerate temp password
                  </button>
                </td>
              </tr>
            ))}
            {visibleUsers.length === 0 && (
              <tr>
                <td colSpan={activeTab === 'employees' ? 9 : 7} className="px-4 py-8 text-center text-slate-400">
                  No accounts here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
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

function SubBranchInlineSelect({
  departmentId,
  value,
  onChange,
}: {
  departmentId: string;
  value: string | null;
  onChange: (subBranchId: string | null) => void;
}) {
  const [options, setOptions] = useState<SubBranchItemFull[] | null>(null);

  useEffect(() => {
    lookupsApi.subBranches(departmentId).then(setOptions);
  }, [departmentId]);

  if (options === null) return <span className="text-xs text-slate-400">…</span>;
  if (options.length === 0) return <span className="text-xs text-slate-400">—</span>;

  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className="w-36 py-1 text-xs">
      <option value="">No sub-branch</option>
      {options.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}
