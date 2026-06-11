import { useGetDashboardSummary, useGetLeadFunnel, useGetRecentCalls, useGetTodayFollowUps, getGetRecentCallsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { formatPhone, formatRelativeTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PhoneCall, Users, Phone, TrendingUp, Calendar, LucideIcon,
  ArrowUpRight, Sparkles, Activity, Clock, ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import { useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

type TrendPoint = { date: string; calls: number; leads: number };

function useDashboardTrends() {
  return useQuery<TrendPoint[]>({
    queryKey: ["dashboard-trends"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/dashboard/trends`);
      if (!res.ok) throw new Error("Failed to load trends");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: funnel, isLoading: loadingFunnel } = useGetLeadFunnel();
  const { data: recentCalls, isLoading: loadingCalls } = useGetRecentCalls();
  const { data: followUps, isLoading: loadingFollowUps } = useGetTodayFollowUps();
  const { data: trends, isLoading: loadingTrends } = useDashboardTrends();
  const queryClient = useQueryClient();

  useEffect(() => {
    const sseUrl = `${import.meta.env.BASE_URL}api/live-feed`;
    const eventSource = new EventSource(sseUrl);
    eventSource.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: getGetRecentCallsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    };
    return () => eventSource.close();
  }, [queryClient]);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto w-full">

      {/* Page header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4" style={{ color: "#818cf8" }} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#818cf8" }}>
              AI-Powered Insurance CRM
            </span>
          </div>
          <h1 className="text-[28px] font-bold tracking-tight" style={{ color: "#0f172a" }}>
            Agency Dashboard
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "#64748b" }}>
            Real-time overview · AI calling active · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
            style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.22)", color: "#059669" }}
          >
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            System Live
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <GradientMetricCard
          title="Total Leads"
          value={summary?.total_leads}
          loading={loadingSummary}
          icon={Users}
          gradient="linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)"
          glowColor="rgba(79,70,229,0.3)"
          bgAccent="rgba(79,70,229,0.08)"
          borderColor="rgba(79,70,229,0.2)"
          subtitle="Active prospects"
        />
        <GradientMetricCard
          title="Calls Today"
          value={summary?.calls_today}
          loading={loadingSummary}
          icon={PhoneCall}
          gradient="linear-gradient(135deg, #0891b2 0%, #6366f1 100%)"
          glowColor="rgba(8,145,178,0.3)"
          bgAccent="rgba(8,145,178,0.08)"
          borderColor="rgba(8,145,178,0.2)"
          subtitle="AI-dialed today"
        />
        <GradientMetricCard
          title="Active Calls"
          value={summary?.active_calls}
          loading={loadingSummary}
          icon={Activity}
          gradient="linear-gradient(135deg, #059669 0%, #0891b2 100%)"
          glowColor="rgba(5,150,105,0.3)"
          bgAccent="rgba(5,150,105,0.08)"
          borderColor="rgba(5,150,105,0.2)"
          subtitle="Live right now"
          pulse={!!(summary?.active_calls && summary.active_calls > 0)}
        />
        <GradientMetricCard
          title="Conversion Rate"
          value={summary?.conversion_rate ? `${summary.conversion_rate}%` : "0%"}
          loading={loadingSummary}
          icon={TrendingUp}
          gradient="linear-gradient(135deg, #d97706 0%, #dc2626 100%)"
          glowColor="rgba(217,119,6,0.3)"
          bgAccent="rgba(217,119,6,0.08)"
          borderColor="rgba(217,119,6,0.2)"
          subtitle="Leads → Policy"
        />
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Recent calls */}
        <DashCard className="lg:col-span-2" title="Recent AI Calls" icon={<PhoneCall className="h-4 w-4" style={{ color: "#818cf8" }} />}
          action={<Link href="/calls"><span className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 flex items-center gap-0.5 transition-colors">View all <ChevronRight className="h-3 w-3" /></span></Link>}
        >
          {loadingCalls ? (
            <div className="space-y-2.5 p-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
            </div>
          ) : recentCalls?.length === 0 ? (
            <EmptyState icon={<Phone className="h-8 w-8" />} label="No calls yet" />
          ) : (
            <div className="divide-y" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
              {recentCalls?.slice(0, 8).map(call => (
                <Link key={call.id} href={`/calls/${call.id}`}>
                  <div className="group flex items-center justify-between px-4 py-3 transition-all duration-150 cursor-pointer"
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(99,102,241,0.04)"}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                        style={{
                          background: call.status === "COMPLETED" ? "rgba(16,185,129,0.10)"
                            : call.status === "FAILED" ? "rgba(239,68,68,0.10)" : "rgba(99,102,241,0.10)",
                          border: call.status === "COMPLETED" ? "1px solid rgba(16,185,129,0.2)"
                            : call.status === "FAILED" ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(99,102,241,0.2)",
                        }}
                      >
                        <PhoneCall className="h-4 w-4" style={{
                          color: call.status === "COMPLETED" ? "#10b981"
                            : call.status === "FAILED" ? "#ef4444" : "#6366f1",
                        }} />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-slate-700 group-hover:text-indigo-700 transition-colors">
                          {call.lead_name || formatPhone(call.phone_number)}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Clock className="h-3 w-3 text-slate-300" />
                          <span className="text-[11px] text-slate-400">{formatRelativeTime(call.started_at)}</span>
                          <span className="text-slate-300 text-[10px]">·</span>
                          <span className="text-[11px] text-slate-400">{call.agent_name || "AI Agent"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CallStatusBadge status={call.status} />
                      <ChevronRight className="h-3.5 w-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </DashCard>

        {/* Right column */}
        <div className="space-y-5">

          {/* Lead Funnel */}
          <DashCard title="Lead Funnel" icon={<TrendingUp className="h-4 w-4" style={{ color: "#818cf8" }} />}>
            {loadingFunnel ? (
              <div className="space-y-2.5 p-4">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
              </div>
            ) : (
              <div className="space-y-1.5 px-4 pb-4">
                {funnel?.map((stage, i) => {
                  const total = funnel.reduce((s, x) => s + x.count, 0);
                  const pct = total > 0 ? Math.round((stage.count / total) * 100) : 0;
                  const gradients = [
                    "linear-gradient(90deg, #4f46e5, #7c3aed)",
                    "linear-gradient(90deg, #0891b2, #4f46e5)",
                    "linear-gradient(90deg, #059669, #0891b2)",
                    "linear-gradient(90deg, #d97706, #059669)",
                    "linear-gradient(90deg, #dc2626, #d97706)",
                    "linear-gradient(90deg, #7c3aed, #4f46e5)",
                    "linear-gradient(90deg, #0891b2, #059669)",
                    "linear-gradient(90deg, #4f46e5, #0891b2)",
                  ];
                  const label = stage.stage.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
                  return (
                    <div key={stage.stage}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-medium text-slate-600">{label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400">{pct}%</span>
                          <span className="text-[12px] font-bold text-slate-700">{stage.count}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.max(pct, stage.count > 0 ? 4 : 0)}%`, background: gradients[i % gradients.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DashCard>

          {/* Today's Follow-ups */}
          <DashCard title="Today's Follow-ups" icon={<Calendar className="h-4 w-4" style={{ color: "#fbbf24" }} />}
            action={<Link href="/follow-ups"><span className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 flex items-center gap-0.5 transition-colors">All <ChevronRight className="h-3 w-3" /></span></Link>}
          >
            {loadingFollowUps ? (
              <div className="space-y-2 p-4">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
              </div>
            ) : followUps?.length === 0 ? (
              <EmptyState icon={<Calendar className="h-7 w-7" />} label="No follow-ups today" small />
            ) : (
              <div className="space-y-1.5 px-3 pb-3">
                {followUps?.map(fu => (
                  <Link key={fu.id} href={`/leads/${fu.lead_id}`}>
                    <div className="group cursor-pointer rounded-xl px-3 py-2.5 transition-all duration-150"
                      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(99,102,241,0.05)"}
                      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,0.02)"}
                      style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.05)" }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-[12px] font-semibold text-slate-700 group-hover:text-indigo-700 transition-colors">
                          {fu.lead_name}
                        </div>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{
                            background: fu.status === "PENDING" ? "rgba(245,158,11,0.12)" : "rgba(0,0,0,0.06)",
                            color: fu.status === "PENDING" ? "#d97706" : "#94a3b8",
                          }}
                        >
                          {fu.status}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] capitalize" style={{ color: "#94a3b8" }}>
                        {fu.type.replace(/_/g, " ").toLowerCase()}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </DashCard>
        </div>
      </div>

      {/* Trend chart */}
      <DashCard title="Activity — Last 14 Days" icon={<ArrowUpRight className="h-4 w-4" style={{ color: "#818cf8" }} />}>
        {loadingTrends ? (
          <div className="p-4"><Skeleton className="h-52 w-full rounded-xl" /></div>
        ) : (
          <div className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="callsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.20} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickFormatter={(v: string) => v.slice(5)} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }}
                  width={26} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{
                  background: "rgba(255,255,255,0.96)", backdropFilter: "blur(12px)",
                  border: "1px solid rgba(0,0,0,0.08)", borderRadius: "12px",
                  fontSize: 12, color: "#1e293b", boxShadow: "0 8px 32px rgba(99,102,241,0.12)",
                }} cursor={{ stroke: "rgba(99,102,241,0.15)", strokeWidth: 1.5 }} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8", paddingTop: 8 }} />
                <Area type="monotone" dataKey="calls" stroke="#6366f1" strokeWidth={2.5}
                  fill="url(#callsGrad)" dot={false} name="Calls"
                  activeDot={{ r: 5, fill: "#6366f1", stroke: "rgba(99,102,241,0.3)", strokeWidth: 4 }} />
                <Area type="monotone" dataKey="leads" stroke="#10b981" strokeWidth={2.5}
                  fill="url(#leadsGrad)" dot={false} name="New Leads"
                  activeDot={{ r: 5, fill: "#10b981", stroke: "rgba(16,185,129,0.3)", strokeWidth: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </DashCard>
    </div>
  );
}

/* ─── Shared card shell ─────────────────────────── */
function DashCard({
  children, title, icon, action, className = "",
}: {
  children: ReactNode; title: string; icon?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-2xl overflow-hidden ${className}`}
      style={{
        background: "rgba(255,255,255,0.80)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.9)",
        boxShadow: "0 2px 16px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,1)",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3.5"
        style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[13px] font-bold text-slate-700">{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon, label, small = false }: { icon: ReactNode; label: string; small?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center ${small ? "py-6" : "py-10"} text-slate-300`}>
      {icon}
      <p className="mt-2 text-[12px] text-slate-400">{label}</p>
    </div>
  );
}

/* ─── Gradient Metric Card ──────────────────────── */
interface GradientMetricCardProps {
  title: string;
  value: string | number | undefined;
  loading: boolean;
  icon: LucideIcon;
  gradient: string;
  glowColor: string;
  bgAccent: string;
  borderColor: string;
  subtitle: string;
  pulse?: boolean;
}

function GradientMetricCard({
  title, value, loading, icon: Icon, gradient, glowColor, bgAccent, borderColor, subtitle, pulse = false,
}: GradientMetricCardProps) {
  return (
    <div className="relative rounded-2xl overflow-hidden group"
      style={{
        background: "rgba(255,255,255,0.80)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: `1px solid ${borderColor}`,
        boxShadow: `0 4px 24px ${glowColor.replace("0.3", "0.10")}, 0 1px 4px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,1)`,
      }}
    >
      {/* Top gradient bar */}
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: gradient }} />

      {/* Subtle bg tint */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: bgAccent }} />

      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: "#94a3b8" }}>
              {title}
            </div>
            {loading ? (
              <Skeleton className="h-10 w-20 rounded-lg" />
            ) : (
              <div className="text-[32px] font-black tracking-tight leading-none" style={{ color: "#0f172a" }}>
                {value ?? "—"}
              </div>
            )}
            <div className="mt-2 text-[11px] font-medium" style={{ color: "#94a3b8" }}>{subtitle}</div>
          </div>

          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl relative"
            style={{
              background: gradient,
              boxShadow: `0 4px 16px ${glowColor}, 0 2px 6px rgba(0,0,0,0.15)`,
            }}
          >
            <Icon className="h-5 w-5 text-white" />
            {pulse && (
              <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 border-2 border-white animate-pulse" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CallStatusBadge({ status }: { status: string }) {
  if (status === "COMPLETED")
    return (
      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
        style={{ background: "rgba(16,185,129,0.10)", color: "#059669", border: "1px solid rgba(16,185,129,0.2)" }}
      >Completed</span>
    );
  if (status === "FAILED")
    return (
      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
        style={{ background: "rgba(239,68,68,0.10)", color: "#dc2626", border: "1px solid rgba(239,68,68,0.2)" }}
      >Failed</span>
    );
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: "rgba(99,102,241,0.10)", color: "#4f46e5", border: "1px solid rgba(99,102,241,0.2)" }}
    >{status}</span>
  );
}

import { ReactNode } from "react";
