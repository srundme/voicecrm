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
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Calls", href: "/calls", icon: Phone },
  { label: "Policies", href: "/policies", icon: ShieldAlert },
  { label: "Follow-ups", href: "/follow-ups", icon: CalendarDays },
  { label: "AI Agents", href: "/agents", icon: Bot },
  { label: "Campaigns", href: "/campaigns", icon: Megaphone },
  { label: "Lead Sources", href: "/lead-sources", icon: LinkIcon },
  { label: "Team", href: "/team", icon: Users2 },
];

function GlassSidebar() {
  const [location] = useLocation();

  function isActive(href: string) {
    if (href === "/") return location === "/";
    return location === href || location.startsWith(href + "/");
  }

  return (
    <aside
      className="relative z-20 flex h-screen w-60 flex-shrink-0 flex-col"
      style={{
        background: "rgba(255,255,255,0.72)",
        backdropFilter: "blur(32px)",
        WebkitBackdropFilter: "blur(32px)",
        borderRight: "1px solid rgba(255,255,255,0.9)",
        boxShadow: "2px 0 24px rgba(99,102,241,0.06)",
      }}
    >
      {/* Logo */}
      <div
        className="flex h-16 flex-shrink-0 items-center gap-3 px-5"
        style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-xl shadow-md"
          style={{
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            boxShadow: "0 4px 12px rgba(99,102,241,0.35)",
          }}
        >
          <PhoneCall className="h-4 w-4 text-white" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-slate-800">VoiceCRM</span>
      </div>

      {/* Nav label */}
      <div className="px-5 pt-6 pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Navigation
        </span>
      </div>

      {/* Nav Items */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  active ? "text-indigo-700" : "text-slate-500 hover:text-slate-700"
                )}
                style={
                  active
                    ? {
                        background: "linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(139,92,246,0.07) 100%)",
                        border: "1px solid rgba(99,102,241,0.18)",
                        boxShadow: "0 2px 8px rgba(99,102,241,0.08), inset 0 1px 0 rgba(255,255,255,0.8)",
                      }
                    : {
                        border: "1px solid transparent",
                      }
                }
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,0.04)";
                    (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,0,0,0.06)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLDivElement).style.background = "transparent";
                    (e.currentTarget as HTMLDivElement).style.borderColor = "transparent";
                  }
                }}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4 flex-shrink-0 transition-colors duration-200",
                    active ? "text-indigo-500" : "text-slate-400 group-hover:text-slate-500"
                  )}
                />
                <span>{item.label}</span>
                {active && (
                  <div
                    className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-500"
                    style={{ boxShadow: "0 0 6px rgba(99,102,241,0.6)" }}
                  />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom — Settings */}
      <div
        className="flex-shrink-0 px-3 pb-4"
        style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
      >
        <div className="pt-3">
          <Link href="/settings">
            <div
              className={cn(
                "group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive("/settings") ? "text-indigo-700" : "text-slate-500 hover:text-slate-700"
              )}
              style={
                isActive("/settings")
                  ? {
                      background: "linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(139,92,246,0.07) 100%)",
                      border: "1px solid rgba(99,102,241,0.18)",
                      boxShadow: "0 2px 8px rgba(99,102,241,0.08), inset 0 1px 0 rgba(255,255,255,0.8)",
                    }
                  : { border: "1px solid transparent" }
              }
              onMouseEnter={(e) => {
                if (!isActive("/settings")) {
                  (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,0.04)";
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,0,0,0.06)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive("/settings")) {
                  (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  (e.currentTarget as HTMLDivElement).style.borderColor = "transparent";
                }
              }}
            >
              <Settings
                className={cn(
                  "h-4 w-4 flex-shrink-0",
                  isActive("/settings") ? "text-indigo-500" : "text-slate-400 group-hover:text-slate-500"
                )}
              />
              <span>Settings</span>
            </div>
          </Link>
        </div>

        {/* User badge */}
        <div
          className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5"
          style={{
            background: "rgba(99,102,241,0.06)",
            border: "1px solid rgba(99,102,241,0.12)",
          }}
        >
          <div
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            A
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-medium text-slate-700">Agency Admin</div>
            <div className="text-[10px] text-slate-400">policyfy.com</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative flex h-screen overflow-hidden"
      style={{ background: "hsl(230 40% 96%)" }}
    >
      {/* Animated background blobs — soft pastels for light mode */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {/* Indigo blob — top left */}
        <div
          className="animate-blob-1 absolute -left-48 -top-48 rounded-full"
          style={{
            width: "700px",
            height: "700px",
            background: "radial-gradient(circle at center, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.10) 50%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        {/* Purple blob — bottom right */}
        <div
          className="animate-blob-2 absolute -bottom-60 -right-48 rounded-full"
          style={{
            width: "800px",
            height: "800px",
            background: "radial-gradient(circle at center, rgba(168,85,247,0.14) 0%, rgba(99,102,241,0.08) 50%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
        {/* Cyan blob — center upper-right */}
        <div
          className="animate-blob-3 absolute right-1/4 top-1/4 rounded-full"
          style={{
            width: "500px",
            height: "500px",
            background: "radial-gradient(circle at center, rgba(6,182,212,0.10) 0%, rgba(99,102,241,0.06) 50%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      {/* Glass Sidebar */}
      <GlassSidebar />

      {/* Main content */}
      <main className="relative z-10 flex min-h-screen flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
