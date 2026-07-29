import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { NotificationBell } from '../components/NotificationBell';
import { PhoneNumberBanner } from '../components/PhoneNumberBanner';
import { ticketsApi } from '../api/tickets';
import type { TicketCountsDto } from '../types';
import clsx from 'clsx';

const NAV_BY_ROLE: Record<string, { to: string; label: string; ticketsDropdown?: boolean }[]> = {
  Admin: [
    { to: '/', label: 'Dashboard' },
    { to: '/tickets', label: 'Tickets', ticketsDropdown: true },
    { to: '/tasks', label: 'Task' },
    { to: '/users', label: 'Users' },
    { to: '/companies', label: 'Companies' },
    { to: '/settings', label: 'Settings' },
  ],
  Consultant: [
    { to: '/', label: 'Dashboard' },
    { to: '/tickets', label: 'Tickets', ticketsDropdown: true },
    { to: '/tasks', label: 'Task' },
    { to: '/emails', label: 'Emails' },
    { to: '/users', label: 'Clients' },
    { to: '/companies', label: 'Companies' },
  ],
  SupportAgent: [
    { to: '/', label: 'Dashboard' },
    { to: '/tickets', label: 'Tickets', ticketsDropdown: true },
    { to: '/tasks', label: 'Task' },
    { to: '/emails', label: 'Emails' },
    { to: '/users', label: 'Clients' },
    { to: '/companies', label: 'Companies' },
  ],
  Client: [
    { to: '/tickets', label: 'My Tickets', ticketsDropdown: true },
    { to: '/tickets/new', label: 'Submit a Ticket' },
  ],
};

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'border-b-2 px-4 py-2.5 text-sm font-semibold transition',
    isActive ? 'border-blue-400 bg-slate-200 text-[#1a2b4c]' : 'border-transparent text-slate-200 hover:bg-white/10 hover:text-white'
  );

function TicketsNavItem({ to, label }: { to: string; label: string }) {
  const [counts, setCounts] = useState<TicketCountsDto | null>(null);

  function load() {
    ticketsApi.counts().then(setCounts).catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  const rows: { label: string; value: number | undefined; status?: string }[] = [
    { label, value: counts?.total },
    { label: 'Opened', value: counts?.opened, status: 'Open,InProgress,Resolved' },
    { label: 'Closed', value: counts?.closed, status: 'Closed' },
    { label: 'New', value: counts?.new, status: 'New' },
  ];

  return (
    <div className="group relative" onMouseEnter={load}>
      <NavLink to={to} end className={navLinkClass}>
        <span className="inline-flex items-center gap-1">
          {label}
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 opacity-60">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </span>
      </NavLink>
      <div
        className={clsx(
          'absolute left-0 top-full z-30 w-48 -translate-y-1 opacity-0 pointer-events-none',
          'transition-all duration-200 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-hover:pointer-events-auto'
        )}
      >
        <div className="mt-1 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {rows.map((r) => (
            <Link
              key={r.label}
              to={r.status ? `/tickets?status=${encodeURIComponent(r.status)}` : '/tickets'}
              className="flex items-center justify-between px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <span>{r.label}</span>
              <span className="font-semibold text-slate-500">{r.value ?? '—'}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

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
          {nav.map((item) =>
            item.ticketsDropdown ? (
              <TicketsNavItem key={item.to} to={item.to} label={item.label} />
            ) : (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={navLinkClass}>
                {item.label}
              </NavLink>
            )
          )}
        </nav>
      </header>

      {user.role === 'Client' && <PhoneNumberBanner />}

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
