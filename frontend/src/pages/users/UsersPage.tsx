import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { usersApi } from '../../api/users';
import { lookupsApi } from '../../api/lookups';
import type { CreatedUserResponse, DepartmentItemFull, LookupItem, UserListItemDto, UserRole } from '../../types';
import { Button, Card, ErrorText, Input, Label, Select } from '../../components/ui';
import { TempPasswordModal } from './TempPasswordModal';

export default function UsersPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'Admin';

  const [users, setUsers] = useState<UserListItemDto[]>([]);
  const [companies, setCompanies] = useState<LookupItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItemFull[]>([]);
  const [result, setResult] = useState<CreatedUserResponse | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [accountType, setAccountType] = useState<'Client' | UserRole>('Client');
  const [companyId, setCompanyId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const needsBranch = accountType === 'Consultant' || accountType === 'SupportAgent';

  function refreshUsers() {
    usersApi.list().then(setUsers);
  }

  useEffect(() => {
    refreshUsers();
    lookupsApi.companies().then(setCompanies);
    lookupsApi.departments().then(setDepartments);
  }, []);

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
        created = await usersApi.createEmployee(firstName, lastName, email, accountType, needsBranch ? departmentId : undefined);
      }
      setResult(created);
      setFirstName('');
      setLastName('');
      setEmail('');
      setCompanyId('');
      setDepartmentId('');
      refreshUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not create the account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">{isAdmin ? 'Users' : 'Clients'}</h1>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Create account</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
          <div>
            <Label>First name</Label>
            <Input required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label>Last name</Label>
            <Input required value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Account type</Label>
            <Select value={accountType} onChange={(e) => setAccountType(e.target.value as any)}>
              <option value="Client">Client</option>
              {isAdmin && (
                <>
                  <option value="Consultant">Consultant</option>
                  <option value="SupportAgent">Support Agent</option>
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
          <div className="col-span-2">
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating…' : 'Create account'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Branch</th>
              <th className="px-4 py-2">Company</th>
              <th className="px-4 py-2">Email verified</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  {u.firstName} {u.lastName}
                </td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{u.role}</td>
                <td className="px-4 py-2">
                  {isAdmin && (u.role === 'Consultant' || u.role === 'SupportAgent') ? (
                    <Select
                      value={u.departmentId ?? ''}
                      onChange={async (e) => {
                        try {
                          await usersApi.setDepartment(u.id, e.target.value || null);
                          refreshUsers();
                        } catch (err: any) {
                          setError(err?.response?.data?.message ?? 'Could not update this user\'s branch.');
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
                <td className="px-4 py-2">{u.companyName ?? '—'}</td>
                <td className="px-4 py-2">{u.emailConfirmed ? 'Yes' : 'No'}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    className="text-xs font-medium text-blue-700 hover:underline"
                    onClick={async () => setResult(await usersApi.regenerateTempPassword(u.id))}
                  >
                    Regenerate temp password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {result && <TempPasswordModal result={result} onClose={() => setResult(null)} />}
    </div>
  );
}
