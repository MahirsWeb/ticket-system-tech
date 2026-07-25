import { useEffect, useState } from 'react';
import { lookupsApi } from '../../api/lookups';
import type { LookupItem } from '../../types';
import { Button, Card, ErrorText, Input, Label } from '../../components/ui';

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<LookupItem[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function refresh() {
    lookupsApi.companies().then(setCompanies);
  }

  useEffect(refresh, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Company name is required.');
      return;
    }
    setLoading(true);
    try {
      await lookupsApi.createCompany(name, address || undefined, contactInfo || undefined);
      setName('');
      setAddress('');
      setContactInfo('');
      refresh();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not create the company.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Client companies</h1>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Add a company</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-3 gap-4">
          <div>
            <Label>Name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Address (optional)</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <Label>Contact info (optional)</Label>
            <Input value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} />
          </div>
          <div className="col-span-3">
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding…' : 'Add company'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="divide-y divide-slate-100">
        {companies.map((c) => (
          <div key={c.id} className="px-4 py-3 text-sm">
            {c.name}
          </div>
        ))}
        {companies.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-400">No companies yet.</div>}
      </Card>
    </div>
  );
}
