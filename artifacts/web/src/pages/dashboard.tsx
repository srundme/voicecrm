import { useGetDashboardSummary, useGetLeadFunnel, useGetRecentCalls, useGetTodayFollowUps, getGetRecentCallsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPhone, formatRelativeTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { PhoneCall, Users, Phone, TrendingUp, Calendar, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
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

    eventSource.onmessage = (event) => {
      try {
        queryClient.invalidateQueries({ queryKey: getGetRecentCallsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      } catch (err) {
        console.error("SSE parse error", err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [queryClient]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your agency's performance today.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Leads"
          value={summary?.total_leads}
          loading={loadingSummary}
          icon={Users}
        />
        <MetricCard
          title="Calls Today"
          value={summary?.calls_today}
          loading={loadingSummary}
          icon={PhoneCall}
        />
        <MetricCard
          title="Active Calls"
          value={summary?.active_calls}
          loading={loadingSummary}
          icon={Phone}
          highlight={summary?.active_calls ? summary.active_calls > 0 : false}
        />
        <MetricCard
          title="Conversion Rate"
          value={summary?.conversion_rate ? `${summary.conversion_rate}%` : "0%"}
          loading={loadingSummary}
          icon={TrendingUp}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent AI Calls</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCalls ? (
              <div className="space-y-4">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentCalls?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="w-12 h-12 mx-auto text-muted/50 mb-3" />
                <p>No recent calls</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentCalls?.map(call => (
                  <Link key={call.id} href={`/calls/${call.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center
                          ${call.status === 'COMPLETED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30' : 
                            call.status === 'FAILED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30' : 
                            'bg-blue-100 text-blue-700 dark:bg-blue-900/30'}`}>
                          <PhoneCall className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-medium group-hover:text-primary transition-colors">
                            {call.lead_name || formatPhone(call.phone_number)}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <span>{call.agent_name || 'Agent'}</span>
                            <span>•</span>
                            <span>{formatRelativeTime(call.started_at)}</span>
                          </div>
                        </div>
                      </div>
                      <Badge variant={
                        call.status === 'COMPLETED' ? 'default' :
                        call.status === 'FAILED' ? 'destructive' : 'secondary'
                      }>
                        {call.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Lead Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingFunnel ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {funnel?.map(stage => (
                    <div key={stage.stage} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{stage.stage.replace(/_/g, ' ')}</span>
                      <Badge variant="outline">{stage.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Today's Follow-ups
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingFollowUps ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : followUps?.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No follow-ups scheduled for today.
                </div>
              ) : (
                <div className="space-y-3">
                  {followUps?.map(fu => (
                    <Link key={fu.id} href={`/leads/${fu.lead_id}`}>
                      <div className="p-3 rounded-lg border text-sm hover:bg-accent cursor-pointer transition-colors">
                        <div className="font-medium">{fu.lead_name}</div>
                        <div className="text-muted-foreground mt-1 flex justify-between">
                          <span className="capitalize">{fu.type.replace(/_/g, ' ').toLowerCase()}</span>
                          <span className={fu.status === 'PENDING' ? 'text-amber-600 dark:text-amber-400' : ''}>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Activity — Last 14 Days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTrends ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trends} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  width={28}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="calls"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                  name="Calls"
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="leads"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  name="New Leads"
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ title, value, loading, icon: Icon, highlight = false }: any) {
  return (
    <Card className={highlight ? 'border-primary ring-1 ring-primary/20 shadow-md' : ''}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`w-4 h-4 ${highlight ? 'text-primary' : 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className={`text-2xl font-bold ${highlight ? 'text-primary' : ''}`}>
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
