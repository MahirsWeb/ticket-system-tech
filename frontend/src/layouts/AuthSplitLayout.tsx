import type { ReactNode } from 'react';

export function AuthSplitLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      {/* Decorative brand panel */}
      <div className="relative hidden w-1/2 overflow-hidden bg-[#132038] lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(135deg, #1a2b4c 0%, #2f5ea8 100%)' }}
        />
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-white/10" />
        <div className="absolute bottom-24 left-16 h-40 w-40 rounded-full bg-white/10" />

        <div className="relative z-10 px-14 pt-14">
          <span className="text-lg font-bold tracking-tight text-white">Ticket System Tech</span>
        </div>

        <div className="relative z-10 px-14 pb-20">
          <h1 className="mb-4 text-5xl font-bold leading-tight text-white">
            Support,
            <br />
            organized.
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-blue-100">
            One place for your team to track, resolve, and learn from every client ticket — with an AI assistant
            that already knows your history.
          </p>
        </div>
      </div>

      {/* Content panel */}
      <div className="flex w-full flex-col items-center justify-center bg-slate-50 px-6 py-12 lg:w-1/2">
        {children}
      </div>
    </div>
  );
}
