import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { Button, Card, ErrorText, Input, Label } from '../../components/ui';

export default function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      if (res.requiresPasswordChange) {
        navigate('/set-new-password', { state: { email, temporaryPassword: password } });
        return;
      }
      if (res.accessToken && res.user) {
        setSession(res.accessToken, res.user);
        navigate('/');
      }
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === 'EMAIL_NOT_VERIFIED') {
        setError('Please verify your email address before logging in. Check your inbox for the verification link.');
      } else if (code === 'TEMP_PASSWORD_EXPIRED') {
        setError('Your temporary password has expired. Please ask an admin or consultant to generate a new one.');
      } else {
        setError(err?.response?.data?.message ?? 'Invalid email or password.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-1 text-xl font-bold text-slate-900">Ticket System Tech</h1>
        <p className="mb-6 text-sm text-slate-500">Sign in to your account</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          <Link to="/forgot-password" className="text-blue-700 hover:underline">
            Forgot your password?
          </Link>
        </div>
      </Card>
    </div>
  );
}
