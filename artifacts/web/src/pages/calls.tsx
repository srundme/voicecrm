import { useListCallLogs, useGetCallLog, useListAgents, useListDispositions, useRetryCall, useUpdateCallLogDisposition, listCallLogs, getListCallLogsQueryKey, CallStatus, CallDir } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Link } from "wouter";
import { formatPhone, formatDateTime, formatDuration } from "@/lib/format";
import { Search, Loader2, ChevronDown, ChevronRight, Download, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, Shield, CheckCircle2, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

type ComplianceStatus = "PASS" | "WARNING" | "FAIL" | "PENDING" | "SKIPPED";

function ComplianceBadge({ status, score }: { status?: string | null; score?: number | null }) {
  if (!status || status === "SKIPPED") return null;
  if (status === "PENDING") return <Badge variant="secondary" className="text-[10px] gap-1"><Loader2 className="w-3 h-3 animate-spin" />Checking</Badge>;
  const cfg: Record<ComplianceStatus, { label: string; icon: ReactNode; className: string }> = {
    PASS: { label: `PASS${score != null ? ` ${score}%` : ""}`, icon: <ShieldCheck className="w-3 h-3" />, className: "bg-emerald-500/15 text-emerald-700 border-emerald-300 dark:text-emerald-400" },
    WARNING: { label: `WARN${score != null ? ` ${score}%` : ""}`, icon: <ShieldAlert className="w-3 h-3" />, className: "bg-amber-500/15 text-amber-700 border-amber-300 dark:text-amber-400" },
    FAIL: { label: `FAIL${score != null ? ` ${score}%` : ""}`, icon: <ShieldX className="w-3 h-3" />, className: "bg-red-500/15 text-red-700 border-red-300 dark:text-red-400" },
    PENDING: { label: "Checking", icon: <Loader2 className="w-3 h-3 animate-spin" />, className: "" },
    SKIPPED: { label: "Skipped", icon: <Shield className="w-3 h-3" />, className: "" },
  };
  const c = cfg[status as ComplianceStatus] ?? cfg.SKIPPED;
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${c.className}`}>
      {c.icon}{c.label}
    </Badge>
  );
}

function CompliancePanel({ call }: { call: any }) {
  const data = call.compliance_data as any;
  const status = call.compliance_status as ComplianceStatus | null;

  if (!status || status === "SKIPPED") {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground flex items-center gap-2">
        <Shield className="w-4 h-4" /> Compliance check skipped (transcript too short or call incomplete).
      </div>
    );
  }
  if (status === "PENDING") {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Running compliance analysis...
      </div>
    );
  }
  if (!data) return null;

  const statusColor = status === "PASS" ? "text-emerald-600" : status === "WARNING" ? "text-amber-600" : "text-red-600";
  const barColor = status === "PASS" ? "bg-emerald-500" : status === "WARNING" ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          {status === "PASS" ? <ShieldCheck className={`w-5 h-5 ${statusColor}`} /> : status === "WARNING" ? <ShieldAlert className={`w-5 h-5 ${statusColor}`} /> : <ShieldX className={`w-5 h-5 ${statusColor}`} />}
          <span className={`font-semibold text-sm ${statusColor}`}>{status}</span>
          <span className="text-2xl font-bold tabular-nums">{data.overall_score}%</span>
        </div>
        <div className="flex-1 min-w-[160px] space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>IRDAI {data.irdai_score}%</span>
            <span>DPDP {data.dpdp_score}%</span>
          </div>
          <div className="flex gap-1 h-2">
            <div className="flex-[3] rounded-sm bg-muted overflow-hidden">
              <div className={`h-full ${barColor}`} style={{ width: `${data.irdai_score}%` }} />
            </div>
            <div className="flex-[2] rounded-sm bg-muted overflow-hidden">
              <div className={`h-full ${status === "PASS" ? "bg-emerald-400" : status === "WARNING" ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${data.dpdp_score}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">IRDAI Checks</div>
          <div className="space-y-1.5">
            {(data.irdai_checks || []).map((c: any) => (
              <div key={c.id} className="flex items-start gap-2 text-sm">
                {c.passed
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  : <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />}
                <div className="flex-1">
                  <span className={c.passed ? "" : "text-red-600 dark:text-red-400"}>{c.label}</span>
                  {c.note && <div className="text-xs text-muted-foreground">{c.note}</div>}
                </div>
                <span className="text-xs tabular-nums text-muted-foreground shrink-0">{c.score}/10</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">DPDP Checks</div>
          <div className="space-y-1.5">
            {(data.dpdp_checks || []).map((c: any) => (
              <div key={c.id} className="flex items-start gap-2 text-sm">
                {c.passed
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  : <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />}
                <div className="flex-1">
                  <span className={c.passed ? "" : "text-red-600 dark:text-red-400"}>{c.label}</span>
                  {c.note && <div className="text-xs text-muted-foreground">{c.note}</div>}
                </div>
                <span className="text-xs tabular-nums text-muted-foreground shrink-0">{c.score}/10</span>
              </div>
            ))}
          </div>
          {data.flags?.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-red-600 mb-1">Flags</div>
              <ul className="text-xs text-red-600 dark:text-red-400 space-y-0.5 list-disc list-inside">
                {data.flags.map((f: string, i: number) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground">Thresholds: PASS ≥80% · WARNING ≥60% · FAIL &lt;60% · IRDAI weight 60% · DPDP weight 40%</div>
    </div>
  );
}

function CallRowDetail({ id, agentId, status, dropDetected }: { id: string; agentId: string; status: string; dropDetected: boolean }) {
  const { data: call, isLoading } = useGetCallLog(id);
  const { data: dispositions } = useListDispositions(agentId ? { agentId } : undefined);
  const updateDisposition = useUpdateCallLogDisposition();
  const retryCall = useRetryCall();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showRaw, setShowRaw] = useState(false);
  const [tab, setTab] = useState<"details" | "compliance">("details");

  if (isLoading || !call) {
    return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListCallLogsQueryKey() });
  const canRetry = call.status === "FAILED" || call.drop_detected;
  const hasCompliance = call.compliance_status && call.compliance_status !== "SKIPPED";

  return (
    <div className="bg-muted/30 p-4 space-y-4">
      <div className="flex gap-2 border-b pb-2">
        <button onClick={() => setTab("details")} className={`text-xs font-medium px-3 py-1 rounded-md transition-colors ${tab === "details" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          Call Details
        </button>
        <button onClick={() => setTab("compliance")} className={`text-xs font-medium px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${tab === "compliance" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <Shield className="w-3.5 h-3.5" /> Compliance
          {hasCompliance && <ComplianceBadge status={call.compliance_status} score={(call as any).compliance_score} />}
        </button>
      </div>

      {tab === "details" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transcript</div>
            {call.transcript ? (
              <ScrollArea className="h-48 rounded-md border bg-card p-3 text-sm whitespace-pre-wrap">{call.transcript}</ScrollArea>
            ) : (
              <div className="rounded-md border bg-card p-3 text-sm text-muted-foreground">No transcript available.</div>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Summary</div>
              <div className="rounded-md border bg-card p-3 text-sm">{call.summary || <span className="text-muted-foreground">No summary.</span>}</div>
            </div>
            {call.recording_url && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Recording</div>
                <audio controls src={call.recording_url} className="w-full" />
              </div>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Disposition</Label>
                <Select
                  value={call.disposition_id || "__none__"}
                  onValueChange={(v) => {
                    if (v === "__none__") return;
                    updateDisposition.mutate({ id: call.id, data: { disposition_id: v } }, {
                      onSuccess: () => { invalidate(); toast({ title: "Disposition updated" }); },
                      onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
                    });
                  }}
                >
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="Set disposition" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {(dispositions || []).map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {canRetry && (
                <Button variant="outline" size="sm" disabled={retryCall.isPending} onClick={() => {
                  retryCall.mutate({ id: call.id }, {
                    onSuccess: (res: any) => { invalidate(); toast({ title: res?.success ? "Retry triggered" : "Retry not started", description: res?.message || res?.error }); },
                    onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
                  });
                }}>
                  <RefreshCw className="w-4 h-4 mr-1.5" /> Retry Call
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "compliance" && (
        <CompliancePanel call={call} />
      )}

      <div>
        <Button variant="ghost" size="sm" onClick={() => setShowRaw((s) => !s)}>
          {showRaw ? <ChevronDown className="w-4 h-4 mr-1.5" /> : <ChevronRight className="w-4 h-4 mr-1.5" />} Raw logs
        </Button>
        {showRaw && (
          <ScrollArea className="h-48 rounded-md border bg-card p-3 mt-2">
            <pre className="text-xs">{JSON.stringify(call, null, 2)}</pre>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

export default function Calls() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CallStatus | "ALL">("ALL");
  const [agentId, setAgentId] = useState("ALL");
  const [dispositionId, setDispositionId] = useState("ALL");
  const [direction, setDirection] = useState<CallDir | "ALL">("ALL");
  const [hasRecording, setHasRecording] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const pageSize = 20;
  const { toast } = useToast();

  const { data: agentsRes } = useListAgents();
  const { data: dispositions } = useListDispositions();
  const agents = agentsRes?.data || [];

  const queryParams: any = {
    search: search || undefined,
    status: status !== "ALL" ? status : undefined,
    agentId: agentId !== "ALL" ? agentId : undefined,
    dispositionId: dispositionId !== "ALL" ? dispositionId : undefined,
    direction: direction !== "ALL" ? direction : undefined,
    hasRecording: hasRecording || undefined,
    dateFrom: dateFrom ? new Date(dateFrom + "T00:00:00").toISOString() : undefined,
    dateTo: dateTo ? new Date(dateTo + "T23:59:59").toISOString() : undefined,
    page,
    pageSize,
  };

  const { data, isLoading } = useListCallLogs(queryParams);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await listCallLogs({ ...queryParams, page: 1, pageSize: 10000 });
      const rows = res.data;
      const headers = ["Lead", "Phone", "Agent", "Direction", "Duration", "Status", "Compliance", "Compliance Score", "Disposition", "Call Type", "Started At"];
      const escape = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
      const lines = [headers.map(escape).join(",")];
      for (const c of rows) {
        lines.push([
          c.lead_name || "",
          formatPhone(c.phone_number),
          c.agent_name || "",
          c.direction,
          formatDuration(c.duration_seconds),
          c.status,
          (c as any).compliance_status || "",
          (c as any).compliance_score != null ? String((c as any).compliance_score) : "",
          c.disposition?.label || "",
          c.call_type || "",
          formatDateTime(c.started_at),
        ].map(escape).join(","));
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `call-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Exported ${rows.length} calls` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Export failed", description: err.message });
    } finally {
      setExporting(false);
    }
  };

  const resetPage = () => setPage(1);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Call Logs</h1>
          <p className="text-muted-foreground mt-1">Review AI voice calls, transcripts, and compliance status.</p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          Export CSV
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by lead name or phone..." value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} className="pl-9" />
          </div>
          <Select value={agentId} onValueChange={(v) => { setAgentId(v); resetPage(); }}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Agent" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Agents</SelectItem>
              {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v: any) => { setStatus(v); resetPage(); }}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              {Object.keys(CallStatus).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={dispositionId} onValueChange={(v) => { setDispositionId(v); resetPage(); }}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Disposition" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Dispositions</SelectItem>
              {(dispositions || []).map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={direction} onValueChange={(v: any) => { setDirection(v); resetPage(); }}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Direction" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Directions</SelectItem>
              {Object.keys(CallDir).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); resetPage(); }} className="w-[150px]" />
            <span className="text-muted-foreground text-sm">to</span>
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); resetPage(); }} className="w-[150px]" />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={hasRecording} onCheckedChange={(c) => { setHasRecording(!!c); resetPage(); }} />
            Has recording
          </label>
        </div>

        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Compliance</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Date & Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="h-32 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : data?.data.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">No calls found matching your criteria.</TableCell></TableRow>
              ) : (
                data?.data.map((call) => (
                  <>
                    <TableRow key={call.id} className="group hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setExpanded(expanded === call.id ? null : call.id)}>
                      <TableCell>{expanded === call.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</TableCell>
                      <TableCell className="font-medium">
                        {call.lead_id ? (
                          <Link href={`/leads/${call.lead_id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{call.lead_name || "-"}</Link>
                        ) : (call.lead_name || "-")}
                        <div className="text-xs text-muted-foreground">{formatPhone(call.phone_number)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{call.agent_name || "Agent"}</span>
                          <Badge variant="outline" className="text-[10px] uppercase">{call.direction}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={call.status === "COMPLETED" ? "default" : call.status === "FAILED" ? "destructive" : "secondary"}>{call.status}</Badge>
                        {call.disposition && (
                          <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: call.disposition.color }}></span>
                            {call.disposition.label}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <ComplianceBadge status={(call as any).compliance_status} score={(call as any).compliance_score} />
                      </TableCell>
                      <TableCell>{call.call_type ? <Badge variant="outline" className="capitalize">{call.call_type.replace(/_/g, " ")}</Badge> : "-"}</TableCell>
                      <TableCell className="text-sm">{formatDuration(call.duration_seconds)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateTime(call.started_at)}</TableCell>
                    </TableRow>
                    {expanded === call.id && (
                      <TableRow key={`${call.id}-detail`}>
                        <TableCell colSpan={8} className="p-0">
                          <CallRowDetail id={call.id} agentId={call.bolna_agent_id} status={call.status} dropDetected={call.drop_detected} />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {data && (
          <div className="p-4 border-t flex items-center justify-between text-sm text-muted-foreground">
            <div>Showing {data.total === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, data.total)} of {data.total} calls</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page * pageSize >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
