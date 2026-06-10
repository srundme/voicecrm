import { useGetDashboardSummary, useGetLeadFunnel, useGetRecentCalls, useGetTodayFollowUps, getGetRecentCallsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPhone, formatRelativeTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { PhoneCall, Users, Phone, TrendingUp, Calendar, LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
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
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Page header */}
      <div className="flex flex-col gap-1 pt-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500">Overview of your agency's performance today.</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Leads"
          value={summary?.total_leads}
          loading={loadingSummary}
          icon={Users}
          accent={{ bg: "rgba(99,102,241,0.10)", icon: "#6366f1", border: "rgba(99,102,241,0.15)" }}
        />
        <MetricCard
          title="Calls Today"
          value={summary?.calls_today}
          loading={loadingSummary}
          icon={PhoneCall}
          accent={{ bg: "rgba(139,92,246,0.10)", icon: "#8b5cf6", border: "rgba(139,92,246,0.15)" }}
        />
        <MetricCard
          title="Active Calls"
          value={summary?.active_calls}
          loading={loadingSummary}
          icon={Phone}
          highlight={!!(summary?.active_calls && summary.active_calls > 0)}
          accent={{ bg: "rgba(6,182,212,0.10)", icon: "#06b6d4", border: "rgba(6,182,212,0.15)" }}
        />
        <MetricCard
          title="Conversion Rate"
          value={summary?.conversion_rate ? `${summary.conversion_rate}%` : "0%"}
          loading={loadingSummary}
          icon={TrendingUp}
          accent={{ bg: "rgba(16,185,129,0.10)", icon: "#10b981", border: "rgba(16,185,129,0.15)" }}
        />
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Recent calls */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <PhoneCall className="h-4 w-4 text-indigo-500" />
              Recent AI Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCalls ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
              </div>
            ) : recentCalls?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <Phone className="mb-3 h-10 w-10" />
                <p className="text-sm">No recent calls</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentCalls?.map(call => (
                  <Link key={call.id} href={`/calls/${call.id}`}>
                    <div
                      className="group flex cursor-pointer items-center justify-between rounded-xl px-4 py-3 transition-all duration-200"
                      style={{
                        background: "rgba(0,0,0,0.02)",
                        border: "1px solid rgba(0,0,0,0.06)",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(99,102,241,0.04)";
                        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(99,102,241,0.12)";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,0.02)";
                        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,0,0,0.06)";
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                          style={{
                            background:
                              call.status === "COMPLETED"
                                ? "rgba(16,185,129,0.10)"
                                : call.status === "FAILED"
                                ? "rgba(239,68,68,0.10)"
                                : "rgba(99,102,241,0.10)",
                            border:
                              call.status === "COMPLETED"
                                ? "1px solid rgba(16,185,129,0.18)"
                                : call.status === "FAILED"
                                ? "1px solid rgba(239,68,68,0.18)"
                                : "1px solid rgba(99,102,241,0.18)",
                          }}
                        >
                          <PhoneCall
                            className="h-4 w-4"
                            style={{
                              color:
                                call.status === "COMPLETED"
                                  ? "#10b981"
                                  : call.status === "FAILED"
                                  ? "#ef4444"
                                  : "#6366f1",
                            }}
                          />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-700 group-hover:text-indigo-700 transition-colors">
                            {call.lead_name || formatPhone(call.phone_number)}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            <span>{call.agent_name || "Agent"}</span>
                            <span>·</span>
                            <span>{formatRelativeTime(call.started_at)}</span>
                          </div>
                        </div>
                      </div>
                      <CallStatusBadge status={call.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="space-y-5">

          {/* Lead Funnel */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Lead Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingFunnel ? (
                <div className="space-y-2.5">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-7 w-full rounded-lg" />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {funnel?.map((stage, i) => {
                    const total = funnel.reduce((s, x) => s + x.count, 0);
                    const pct = total > 0 ? Math.round((stage.count / total) * 100) : 0;
                    const gradients = [
                      "linear-gradient(90deg, #6366f1, #8b5cf6)",
                      "linear-gradient(90deg, #8b5cf6, #a855f7)",
                      "linear-gradient(90deg, #06b6d4, #6366f1)",
                      "linear-gradient(90deg, #10b981, #06b6d4)",
                      "linear-gradient(90deg, #f59e0b, #10b981)",
                      "linear-gradient(90deg, #ef4444, #f59e0b)",
                      "linear-gradient(90deg, #6366f1, #06b6d4)",
                      "linear-gradient(90deg, #8b5cf6, #6366f1)",
                    ];
                    return (
                      <div key={stage.stage} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-600 capitalize">
                            {stage.stage.replace(/_/g, " ").toLowerCase()}
                          </span>
                          <span className="text-xs font-semibold text-slate-700">{stage.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden bg-slate-100">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: gradients[i % gradients.length] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today's Follow-ups */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4 text-indigo-500" />
                Today's Follow-ups
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingFollowUps ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
                </div>
              ) : followUps?.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center text-xs text-slate-400">
                  <Calendar className="mb-2 h-7 w-7" />
                  No follow-ups today
                </div>
              ) : (
                <div className="space-y-2">
                  {followUps?.map(fu => (
                    <Link key={fu.id} href={`/leads/${fu.lead_id}`}>
                      <div
                        className="cursor-pointer rounded-xl px-3 py-2.5 transition-all duration-200"
                        style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)" }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLDivElement).style.background = "rgba(99,102,241,0.04)";
                          (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(99,102,241,0.12)";
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,0.02)";
                          (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,0,0,0.06)";
                        }}
                      >
                        <div className="text-sm font-medium text-slate-700">{fu.lead_name}</div>
                        <div className="mt-0.5 flex items-center justify-between text-xs text-slate-400">
                          <span className="capitalize">{fu.type.replace(/_/g, " ").toLowerCase()}</span>
                          <span style={{ color: fu.status === "PENDING" ? "#f59e0b" : "#94a3b8" }}>
                            {fu.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Trend chart */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            Activity — Last 14 Days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTrends ? (
            <Skeleton className="h-52 w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trends} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickFormatter={(v: string) => v.slice(5)}
                  axisLine={{ stroke: "rgba(0,0,0,0.06)" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  width={28}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(255,255,255,0.95)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: "12px",
                    fontSize: 12,
                    color: "#1e293b",
                    boxShadow: "0 8px 24px rgba(99,102,241,0.10)",
                  }}
                  cursor={{ stroke: "rgba(99,102,241,0.12)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
                <Line
                  type="monotone"
                  dataKey="calls"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                  name="Calls"
                  activeDot={{ r: 4, fill: "#6366f1", stroke: "rgba(99,102,241,0.3)", strokeWidth: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="leads"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  name="New Leads"
                  activeDot={{ r: 4, fill: "#10b981", stroke: "rgba(16,185,129,0.3)", strokeWidth: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CallStatusBadge({ status }: { status: string }) {
  if (status === "COMPLETED")
    return (
      <span
        className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
        style={{ background: "rgba(16,185,129,0.10)", color: "#059669", border: "1px solid rgba(16,185,129,0.18)" }}
      >
        Completed
      </span>
    );
  if (status === "FAILED")
    return (
      <span
        className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
        style={{ background: "rgba(239,68,68,0.10)", color: "#dc2626", border: "1px solid rgba(239,68,68,0.18)" }}
      >
        Failed
      </span>
    );
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: "rgba(99,102,241,0.10)", color: "#4f46e5", border: "1px solid rgba(99,102,241,0.18)" }}
    >
      {status}
    </span>
  );
}

interface AccentConfig {
  bg: string;
  icon: string;
  border: string;
}

interface MetricCardProps {
  title: string;
  value: string | number | undefined;
  loading: boolean;
  icon: LucideIcon;
  accent: AccentConfig;
  highlight?: boolean;
}

function MetricCard({ title, value, loading, icon: Icon, accent, highlight = false }: MetricCardProps) {
  return (
    <Card
      style={
        highlight
          ? {
              background: "rgba(255,255,255,0.82)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(6,182,212,0.25)",
              boxShadow: "0 4px 20px rgba(6,182,212,0.12), 0 1px 4px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,1)",
            }
          : undefined
      }
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-3">
              {title}
            </div>
            {loading ? (
              <Skeleton className="h-9 w-24 rounded-lg" />
            ) : (
              <div
                className="text-3xl font-bold tracking-tight"
                style={{ color: highlight ? "#0891b2" : "#1e293b" }}
              >
                {value ?? "—"}
              </div>
            )}
          </div>
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
            style={{
              background: accent.bg,
              border: `1px solid ${accent.border}`,
              boxShadow: `0 2px 8px ${accent.bg}`,
            }}
          >
            <Icon className="h-5 w-5" style={{ color: accent.icon }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
