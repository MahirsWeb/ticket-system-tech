import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { NotificationBell } from '../components/NotificationBell';
import { PhoneNumberBanner } from '../components/PhoneNumberBanner';
import clsx from 'clsx';

const NAV_BY_ROLE: Record<string, { to: string; label: string }[]> = {
  Admin: [
    { to: '/', label: 'Dashboard' },
    { to: '/tickets', label: 'Tickets' },
    { to: '/users', label: 'Users' },
    { to: '/companies', label: 'Companies' },
    { to: '/settings', label: 'Settings' },
  ],
  Consultant: [
    { to: '/', label: 'Dashboard' },
    { to: '/tickets', label: 'Tickets' },
    { to: '/emails', label: 'Emails' },
    { to: '/users', label: 'Clients' },
    { to: '/companies', label: 'Companies' },
  ],
  SupportAgent: [
    { to: '/', label: 'Dashboard' },
    { to: '/tickets', label: 'Tickets' },
    { to: '/emails', label: 'Emails' },
    { to: '/users', label: 'Clients' },
    { to: '/companies', label: 'Companies' },
  ],
  Client: [
    { to: '/tickets', label: 'My Tickets' },
    { to: '/tickets/new', label: 'Submit a Ticket' },
  ],
};

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  if (!user) return null;
  const nav = NAV_BY_ROLE[user.role] ?? [];

  return (
    <div className="min-h-screen bg-slate-200">
      <header className="border-b border-slate-300 bg-[#1a2b4c]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="text-lg font-bold text-white">Ticket System Tech</div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right text-xs text-slate-300 sm:block">
              <div className="font-semibold text-white">
                {user.firstName} {user.lastName}
              </div>
              <div>{user.role}</div>
            </div>
            <NotificationBell />
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="rounded-md border border-white/20 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-5xl gap-1 px-4">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'border-b-2 px-4 py-2.5 text-sm font-semibold transition',
                  isActive
                    ? 'border-blue-400 bg-slate-200 text-[#1a2b4c]'
                    : 'border-transparent text-slate-200 hover:bg-white/10 hover:text-white'
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {user.role === 'Client' && <PhoneNumberBanner />}

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
