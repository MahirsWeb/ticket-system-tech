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
  ],
  Consultant: [
    { to: '/', label: 'Dashboard' },
    { to: '/tickets', label: 'Tickets' },
    { to: '/users', label: 'Clients' },
    { to: '/companies', label: 'Companies' },
  ],
  SupportAgent: [
    { to: '/', label: 'Dashboard' },
    { to: '/tickets', label: 'My Tickets' },
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
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-56 flex-col bg-[#1a2b4c] text-white">
        <div className="px-5 py-5 text-lg font-bold">Ticket System Tech</div>
        <nav className="flex-1 px-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'mb-1 block rounded-md px-3 py-2 text-sm font-medium',
                  isActive ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-xs text-slate-400">
          Signed in as
          <div className="font-semibold text-white">
            {user.firstName} {user.lastName}
          </div>
          <div>{user.role}</div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-6 py-3">
          <NotificationBell />
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            Sign out
          </button>
        </header>
        {user.role === 'Client' && <PhoneNumberBanner />}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
