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
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard",    href: "/",            icon: LayoutDashboard, color: "#60a5fa" },
  { label: "Leads",        href: "/leads",        icon: Users,           color: "#34d399" },
  { label: "Calls",        href: "/calls",        icon: Phone,           color: "#38bdf8" },
  { label: "Policies",     href: "/policies",     icon: ShieldAlert,     color: "#fb923c" },
  { label: "Follow-ups",   href: "/follow-ups",   icon: CalendarDays,    color: "#fbbf24" },
  { label: "AI Agents",    href: "/agents",       icon: Bot,             color: "#a3e635" },
  { label: "Campaigns",    href: "/campaigns",    icon: Megaphone,       color: "#f472b6" },
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
    <aside
      className="relative z-20 flex h-screen w-[220px] flex-shrink-0 flex-col"
      style={{
        background: "#111827",
        borderRight: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "2px 0 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* Logo */}
      <div className="flex h-16 flex-shrink-0 items-center gap-3 px-5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: "#1d4ed8", boxShadow: "0 2px 8px rgba(29,78,216,0.4)" }}
        >
          <PhoneCall className="h-4 w-4 text-white" />
        </div>
        <span className="text-[16px] font-bold tracking-tight text-white">VoiceCRM</span>
      </div>

      {/* Nav label */}
      <div className="px-5 pt-5 pb-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "rgba(156,163,175,0.5)" }}
        >
          Main Menu
        </span>
      </div>

      {/* Nav Items */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-4">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "group relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                  active ? "text-white" : "text-gray-400 hover:text-gray-200"
                )}
                style={
                  active
                    ? { background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.10)" }
                    : { border: "1px solid transparent" }
                }
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.05)";
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                }}
              >
                {/* Active left indicator */}
                {active && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full"
                    style={{ background: item.color }}
                  />
                )}

                {/* Icon */}
                <div
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: active ? `${item.color}20` : "rgba(255,255,255,0.06)",
                    border: active ? `1px solid ${item.color}40` : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <item.icon
                    className="h-3.5 w-3.5"
                    style={{ color: active ? item.color : "rgba(156,163,175,0.7)" }}
                  />
                </div>

                <span className="flex-1 leading-none">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom divider */}
      <div className="mx-4" style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />

      {/* Settings + User */}
      <div className="flex-shrink-0 px-2.5 py-3 space-y-1">
        <Link href="/settings">
          <div
            className={cn(
              "group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
              isActive("/settings") ? "text-white" : "text-gray-400 hover:text-gray-200"
            )}
            style={
              isActive("/settings")
                ? { background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.10)" }
                : { border: "1px solid transparent" }
            }
            onMouseEnter={e => {
              if (!isActive("/settings")) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.05)";
            }}
            onMouseLeave={e => {
              if (!isActive("/settings")) (e.currentTarget as HTMLDivElement).style.background = "transparent";
            }}
          >
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <Settings className="h-3.5 w-3.5 text-gray-500" />
            </div>
            <span>Settings</span>
          </div>
        </Link>

        {/* User */}
        <div
          className="flex items-center gap-3 rounded-xl px-3 py-2.5"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-[11px] font-bold text-white">
            A
            <div
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 bg-emerald-400"
              style={{ borderColor: "#111827" }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold text-gray-200">Agency Admin</div>
            <div className="text-[10px] text-gray-500">policyfy.com</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-screen overflow-hidden" style={{ background: "#f1f5f9" }}>
      {/* Subtle background — no blobs, clean */}
      <Sidebar />
      <main className="relative z-10 flex min-h-screen flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
