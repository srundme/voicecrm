import { ReactNode } from "react";
import { useGetDashboardSummary, useGetLeadFunnel, useGetRecentCalls, useGetTodayFollowUps, getGetRecentCallsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { formatPhone, formatRelativeTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PhoneCall, Users, Phone, TrendingUp, Calendar, LucideIcon,
  Activity, Clock, ChevronRight, BarChart3,
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
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto w-full">

      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-slate-800">Dashboard</h1>
          <p className="text-[13px] text-slate-500 mt-0.5">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
            style={{ background: "#dcfce7", border: "1px solid #bbf7d0", color: "#15803d" }}
          >
            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            AI Calling Active
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title="Total Leads"
          value={summary?.total_leads}
          loading={loadingSummary}
          icon={Users}
          iconBg="#dbeafe"
          iconColor="#1d4ed8"
          subtitle="Active prospects"
          accentColor="#1d4ed8"
        />
        <MetricCard
          title="Calls Today"
          value={summary?.calls_today}
          loading={loadingSummary}
          icon={PhoneCall}
          iconBg="#e0f2fe"
          iconColor="#0369a1"
          subtitle="AI-dialed today"
          accentColor="#0369a1"
        />
        <MetricCard
          title="Active Calls"
          value={summary?.active_calls}
          loading={loadingSummary}
          icon={Activity}
          iconBg="#dcfce7"
          iconColor="#15803d"
          subtitle="Live right now"
          accentColor="#15803d"
          pulse={!!(summary?.active_calls && summary.active_calls > 0)}
        />
        <MetricCard
          title="Conversion Rate"
          value={summary?.conversion_rate ? `${summary.conversion_rate}%` : "0%"}
          loading={loadingSummary}
          icon={TrendingUp}
          iconBg="#fff7ed"
          iconColor="#c2410c"
          subtitle="Leads to policy"
          accentColor="#c2410c"
        />
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Recent Calls */}
        <DashCard
          className="lg:col-span-2"
          title="Recent AI Calls"
          icon={<PhoneCall className="h-4 w-4 text-blue-600" />}
          action={
            <Link href="/calls">
              <span className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 transition-colors">
                View all <ChevronRight className="h-3 w-3" />
              </span>
            </Link>
          }
        >
          {loadingCalls ? (
            <div className="space-y-2.5 p-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
            </div>
          ) : recentCalls?.length === 0 ? (
            <EmptyState icon={<Phone className="h-8 w-8" />} label="No calls yet" />
          ) : (
            <div className="divide-y divide-slate-100">
              {recentCalls?.slice(0, 8).map(call => (
                <Link key={call.id} href={`/calls/${call.id}`}>
                  <div
                    className="group flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors duration-100"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                        style={{
                          background:
                            call.status === "COMPLETED" ? "#dcfce7"
                            : call.status === "FAILED" ? "#fee2e2"
                            : "#dbeafe",
                        }}
                      >
                        <PhoneCall
                          className="h-4 w-4"
                          style={{
                            color:
                              call.status === "COMPLETED" ? "#15803d"
                              : call.status === "FAILED" ? "#b91c1c"
                              : "#1d4ed8",
                          }}
                        />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-slate-700 group-hover:text-blue-700 transition-colors">
                          {call.lead_name || formatPhone(call.phone_number)}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Clock className="h-3 w-3 text-slate-300" />
                          <span className="text-[11px] text-slate-400">{formatRelativeTime(call.started_at)}</span>
                          <span className="text-slate-300">·</span>
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
          <DashCard
            title="Lead Funnel"
            icon={<BarChart3 className="h-4 w-4 text-blue-600" />}
          >
            {loadingFunnel ? (
              <div className="space-y-2.5 p-4">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
              </div>
            ) : (
              <div className="space-y-2 px-4 pb-4">
                {funnel?.map((stage, i) => {
                  const total = funnel.reduce((s, x) => s + x.count, 0);
                  const pct = total > 0 ? Math.round((stage.count / total) * 100) : 0;
                  const colors = ["#1d4ed8","#0369a1","#15803d","#b45309","#b91c1c","#6d28d9","#0891b2","#065f46"];
                  const label = stage.stage.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
                  return (
                    <div key={stage.stage}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-medium text-slate-600">{label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400">{pct}%</span>
                          <span className="text-[12px] font-bold text-slate-700 w-4 text-right">{stage.count}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden bg-slate-100">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(pct, stage.count > 0 ? 4 : 0)}%`,
                            background: colors[i % colors.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DashCard>

          {/* Today's Follow-ups */}
          <DashCard
            title="Today's Follow-ups"
            icon={<Calendar className="h-4 w-4 text-amber-500" />}
            action={
              <Link href="/follow-ups">
                <span className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 transition-colors">
                  All <ChevronRight className="h-3 w-3" />
                </span>
              </Link>
            }
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
                    <div
                      className="cursor-pointer rounded-xl px-3 py-2.5 hover:bg-slate-50 border border-slate-100 transition-colors duration-100"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-[12px] font-semibold text-slate-700">{fu.lead_name}</div>
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{
                            background: fu.status === "PENDING" ? "#fef3c7" : "#f1f5f9",
                            color: fu.status === "PENDING" ? "#b45309" : "#94a3b8",
                          }}
                        >
                          {fu.status}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400 capitalize">
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
      <DashCard
        title="Activity — Last 14 Days"
        icon={<TrendingUp className="h-4 w-4 text-blue-600" />}
      >
        {loadingTrends ? (
          <div className="p-4"><Skeleton className="h-52 w-full rounded-xl" /></div>
        ) : (
          <div className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="callsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#15803d" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#15803d" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickFormatter={(v: string) => v.slice(5)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  width={26}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    fontSize: 12,
                    color: "#1e293b",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                  }}
                  cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8", paddingTop: 8 }} />
                <Area
                  type="monotone"
                  dataKey="calls"
                  stroke="#1d4ed8"
                  strokeWidth={2}
                  fill="url(#callsGrad)"
                  dot={false}
                  name="Calls"
                  activeDot={{ r: 4, fill: "#1d4ed8", strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="leads"
                  stroke="#15803d"
                  strokeWidth={2}
                  fill="url(#leadsGrad)"
                  dot={false}
                  name="New Leads"
                  activeDot={{ r: 4, fill: "#15803d", strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </DashCard>
    </div>
  );
}

/* ─── Card shell ─────────────────────────────── */
function DashCard({
  children, title, icon, action, className = "",
}: {
  children: ReactNode; title: string; icon?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div
      className={`rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm ${className}`}
    >
      <div
        className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100"
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

/* ─── Metric Card ────────────────────────────── */
interface MetricCardProps {
  title: string;
  value: string | number | undefined;
  loading: boolean;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  accentColor: string;
  subtitle: string;
  pulse?: boolean;
}

function MetricCard({ title, value, loading, icon: Icon, iconBg, iconColor, accentColor, subtitle, pulse = false }: MetricCardProps) {
  return (
    <div
      className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm"
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-2">
            {title}
          </div>
          {loading ? (
            <Skeleton className="h-9 w-20 rounded-lg" />
          ) : (
            <div className="text-[32px] font-black tracking-tight text-slate-800 leading-none">
              {value ?? "—"}
            </div>
          )}
          <div className="mt-2 text-[11px] text-slate-400">{subtitle}</div>
        </div>
        <div
          className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: iconBg }}
        >
          <Icon className="h-5 w-5" style={{ color: iconColor }} />
          {pulse && (
            <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-400 border-2 border-white animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}

function CallStatusBadge({ status }: { status: string }) {
  if (status === "COMPLETED")
    return (
      <span className="rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ background: "#dcfce7", color: "#15803d" }}>
        Completed
      </span>
    );
  if (status === "FAILED")
    return (
      <span className="rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ background: "#fee2e2", color: "#b91c1c" }}>
        Failed
      </span>
    );
  return (
    <span className="rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ background: "#dbeafe", color: "#1d4ed8" }}>
      {status}
    </span>
  );
}
