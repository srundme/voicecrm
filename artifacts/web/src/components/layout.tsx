import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Phone,
  ShieldAlert,
  CalendarDays,
  Settings,
  Bot,
  Link as LinkIcon,
  Users2,
  PhoneCall,
  Megaphone,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard",    href: "/",            icon: LayoutDashboard, color: "#818cf8" },
  { label: "Leads",        href: "/leads",        icon: Users,           color: "#34d399" },
  { label: "Calls",        href: "/calls",        icon: Phone,           color: "#60a5fa" },
  { label: "Policies",     href: "/policies",     icon: ShieldAlert,     color: "#f472b6" },
  { label: "Follow-ups",   href: "/follow-ups",   icon: CalendarDays,    color: "#fbbf24" },
  { label: "AI Agents",    href: "/agents",       icon: Bot,             color: "#a78bfa" },
  { label: "Campaigns",    href: "/campaigns",    icon: Megaphone,       color: "#fb923c" },
  { label: "Lead Sources", href: "/lead-sources", icon: LinkIcon,        color: "#22d3ee" },
  { label: "Team",         href: "/team",         icon: Users2,          color: "#86efac" },
];

function Sidebar() {
  const [location] = useLocation();

  function isActive(href: string) {
    if (href === "/") return location === "/";
    return location === href || location.startsWith(href + "/");
  }

  return (
    <aside className="relative z-20 flex h-screen w-[220px] flex-shrink-0 flex-col"
      style={{
        background: "linear-gradient(180deg, #0d0e1a 0%, #0b0c16 60%, #090a14 100%)",
        borderRight: "1px solid rgba(99,102,241,0.14)",
        boxShadow: "4px 0 40px rgba(0,0,0,0.45)",
      }}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: "linear-gradient(90deg, transparent, #6366f1, #8b5cf6, #06b6d4, transparent)" }}
      />

      {/* Logo */}
      <div className="flex h-16 flex-shrink-0 items-center gap-3 px-5 mt-0.5">
        <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
          style={{
            background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #06b6d4 100%)",
            boxShadow: "0 0 20px rgba(99,102,241,0.5), 0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          <Zap className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
        </div>
        <div>
          <div className="text-[14px] font-bold tracking-tight text-white leading-tight">VoiceCRM</div>
          <div className="text-[9px] font-medium uppercase tracking-widest mt-0.5"
            style={{ color: "rgba(99,102,241,0.7)" }}
          >by Policyfy</div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 mb-3" style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

      {/* Nav label */}
      <div className="px-5 pb-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{ color: "rgba(148,163,184,0.45)" }}
        >Main Menu</span>
      </div>

      {/* Nav Items */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-4">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                "group relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
                active ? "text-white" : "text-slate-400 hover:text-slate-200"
              )}
                style={active ? {
                  background: "linear-gradient(135deg, rgba(99,102,241,0.22) 0%, rgba(139,92,246,0.14) 100%)",
                  border: "1px solid rgba(99,102,241,0.28)",
                  boxShadow: "0 2px 16px rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.08)",
                } : {
                  border: "1px solid transparent",
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                {/* Active left bar */}
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full"
                    style={{ background: "linear-gradient(180deg, #6366f1, #8b5cf6)", boxShadow: "0 0 8px rgba(99,102,241,0.8)" }}
                  />
                )}

                {/* Icon chip */}
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-200"
                  style={{
                    background: active
                      ? `${item.color}22`
                      : "rgba(255,255,255,0.05)",
                    border: active
                      ? `1px solid ${item.color}44`
                      : "1px solid rgba(255,255,255,0.07)",
                    boxShadow: active ? `0 0 12px ${item.color}22` : "none",
                  }}
                >
                  <item.icon className="h-3.5 w-3.5 transition-colors duration-200"
                    style={{ color: active ? item.color : "rgba(148,163,184,0.6)" }}
                  />
                </div>

                <span className="flex-1 leading-none">{item.label}</span>

                {active && (
                  <div className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                    style={{ background: item.color, boxShadow: `0 0 6px ${item.color}` }}
                  />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-4" style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

      {/* Bottom */}
      <div className="flex-shrink-0 px-2.5 py-3 space-y-1">
        <Link href="/settings">
          <div className={cn(
            "group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
            isActive("/settings") ? "text-white" : "text-slate-400 hover:text-slate-200"
          )}
            style={isActive("/settings") ? {
              background: "linear-gradient(135deg, rgba(99,102,241,0.22), rgba(139,92,246,0.14))",
              border: "1px solid rgba(99,102,241,0.28)",
            } : { border: "1px solid transparent" }}
            onMouseEnter={e => { if (!isActive("/settings")) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.05)"; }}
            onMouseLeave={e => { if (!isActive("/settings")) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <Settings className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <span>Settings</span>
          </div>
        </Link>

        {/* User */}
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 mt-1"
          style={{
            background: "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.16)",
          }}
        >
          <div className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
          >
            A
            <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 bg-emerald-400"
              style={{ borderColor: "#0d0e1a" }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold text-slate-200">Agency Admin</div>
            <div className="text-[10px] text-slate-500">policyfy.com</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-screen overflow-hidden"
      style={{ background: "#f0f1f8" }}
    >
      {/* Background mesh */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {/* Rich indigo blob top-right */}
        <div className="animate-blob-1 absolute -top-64 right-0 rounded-full"
          style={{
            width: 900, height: 900,
            background: "radial-gradient(circle at center, rgba(99,102,241,0.13) 0%, rgba(139,92,246,0.07) 45%, transparent 70%)",
            filter: "blur(72px)",
          }}
        />
        {/* Purple blob bottom-left */}
        <div className="animate-blob-2 absolute -bottom-72 -left-48 rounded-full"
          style={{
            width: 900, height: 900,
            background: "radial-gradient(circle at center, rgba(168,85,247,0.10) 0%, rgba(99,102,241,0.06) 50%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
        {/* Cyan accent center */}
        <div className="animate-blob-3 absolute top-1/3 left-1/2 -translate-x-1/2 rounded-full"
          style={{
            width: 600, height: 600,
            background: "radial-gradient(circle at center, rgba(6,182,212,0.07) 0%, transparent 65%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      <Sidebar />

      <main className="relative z-10 flex min-h-screen flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
