import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { Button, ErrorText, IconInput } from '../../components/ui';
import { AuthSplitLayout } from '../../layouts/AuthSplitLayout';

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

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
      } else if (code === 'ACCOUNT_LOCKED') {
        setError('Too many failed sign-in attempts. Please try again in a few minutes, or reset your password.');
      } else {
        setError(err?.response?.data?.message ?? 'Invalid email or password.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplitLayout>
      <div className="w-full max-w-sm">
        <div className="mb-8 lg:hidden">
          <span className="text-lg font-bold text-[#1a2b4c]">Ticket System Tech</span>
        </div>
        <h1 className="mb-1 text-2xl font-bold text-slate-900">Welcome back</h1>
        <p className="mb-8 text-sm text-slate-500">Sign in to your account to continue</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <IconInput
            icon={<UserIcon />}
            type="email"
            placeholder="Enter your email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <IconInput
            icon={<LockIcon />}
            type="password"
            placeholder="Enter your password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <div className="text-right">
            <Link to="/forgot-password" className="text-xs font-medium text-blue-700 hover:underline">
              Forgot your password?
            </Link>
          </div>

          <ErrorText>{error}</ErrorText>

          <Button type="submit" variant="pill" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </AuthSplitLayout>
  );
}
