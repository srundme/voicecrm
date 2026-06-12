import { useRoute } from "wouter";
import { useGetLead, getGetLeadQueryKey, useUpdateLead, useTriggerLeadCall, getListAgentsQueryKey, useListAgents, useCreatePolicy, LeadStage, type LeadDetail as LeadDetailType, type LeadUpdate, type PolicyInput } from "@workspace/api-client-react";
import { formatPhone, formatDate, formatDateTime, formatCurrency } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Phone, Mail, MapPin, Building, Calendar, PhoneCall, Play, ChevronDown, ChevronRight,
  Clock, ArrowLeft, User, ArrowRight, CheckCircle2, XCircle, AlertCircle, Mic, FileText,
  Headphones, Loader2, ChevronLeft, ChevronRight as ChevronRightIcon,
  Activity, Hash, ShieldX, ShieldCheck, BadgeIndianRupee, DollarSign
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

const STAGE_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  NEW:           { label: "New",           color: "#6366f1", bg: "#6366f112", icon: User },
  CONTACTED:     { label: "Contacted",     color: "#0ea5e9", bg: "#0ea5e912", icon: PhoneCall },
  INTERESTED:    { label: "Interested",    color: "#10b981", bg: "#10b98112", icon: CheckCircle2 },
  DOCS_PENDING:  { label: "Docs Pending",  color: "#f59e0b", bg: "#f59e0b12", icon: FileText },
  POLICY_ISSUED: { label: "Policy Issued", color: "#22c55e", bg: "#22c55e12", icon: CheckCircle2 },
  RENEWAL_DUE:   { label: "Renewal Due",   color: "#f97316", bg: "#f9731612", icon: AlertCircle },
  LOST:          { label: "Lost",          color: "#ef4444", bg: "#ef444412", icon: XCircle },
  INACTIVE:      { label: "Inactive",      color: "#94a3b8", bg: "#94a3b812", icon: Clock },
  DO_NOT_CALL:   { label: "Do Not Call",   color: "#ef4444", bg: "#ef444412", icon: XCircle },
};

const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  COMPLETED:  { color: "#22c55e", bg: "#22c55e12", label: "Completed" },
  FAILED:     { color: "#ef4444", bg: "#ef444412", label: "Failed" },
  NO_ANSWER:  { color: "#94a3b8", bg: "#94a3b812", label: "No Answer" },
  BUSY:       { color: "#f59e0b", bg: "#f59e0b12", label: "Busy" },
  RINGING:    { color: "#6366f1", bg: "#6366f112", label: "Ringing" },
  IN_PROGRESS:{ color: "#0ea5e9", bg: "#0ea5e912", label: "In Progress" },
  INITIATED:  { color: "#6366f1", bg: "#6366f112", label: "Initiated" },
  CANCELLED:  { color: "#94a3b8", bg: "#94a3b812", label: "Cancelled" },
};

function StageBadge({ stage }: { stage: string }) {
  const meta = STAGE_META[stage] ?? STAGE_META["NEW"];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold border" style={{ borderColor: meta.color + "40", color: meta.color, backgroundColor: meta.bg }}>
      <meta.icon className="w-3 h-3" style={{ color: meta.color }} />
      {meta.label}
    </span>
  );
}

function CallStatusBadge({ status }: { status: string }) {
  const meta = STATUS_COLORS[status] ?? { color: "#64748b", bg: "#64748b12", label: status };
  return (
    <span style={{ color: meta.color, backgroundColor: meta.bg }} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium">
      {meta.label}
    </span>
  );
}

function TriggerCallDialog({ lead }: { lead: LeadDetailType }) {
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: agents, isLoading: loadingAgents } = useListAgents({ query: { enabled: open, queryKey: getListAgentsQueryKey() } });
  const triggerCall = useTriggerLeadCall();

  const submit = () => {
    if (!agentId) { toast({ title: "Select an agent", variant: "destructive" }); return; }
    triggerCall.mutate(
      { id: lead.id, data: { agent_id: agentId } },
      {
        onSuccess: (res) => {
          if (res.success) {
            toast({ title: "Call triggered" });
            queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(lead.id) });
            setOpen(false);
          } else {
            toast({ title: "Call failed", description: res.error ?? undefined, variant: "destructive" });
          }
        },
        onError: () => toast({ title: "Could not trigger call", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5 h-8">
        <PhoneCall className="w-3.5 h-3.5" />
        Call Now
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trigger AI Call</DialogTitle>
          <DialogDescription>Call {lead.full_name} at {formatPhone(lead.phone)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-xs">Voice Agent</Label>
          <Select value={agentId} onValueChange={setAgentId} disabled={loadingAgents}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={loadingAgents ? "Loading..." : "Select agent"} /></SelectTrigger>
            <SelectContent>
              {agents?.data?.map((a) => <SelectItem key={a.id} value={a.id} className="text-sm">{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={triggerCall.isPending}>
            {triggerCall.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Start Call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditLeadDialog({ lead }: { lead: LeadDetailType }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LeadUpdate>({});
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateLead = useUpdateLead();

  const openDialog = () => {
    setForm({
      full_name: lead.full_name, phone: lead.phone, email: lead.email ?? undefined,
      city: lead.city ?? undefined, state: lead.state ?? undefined, occupation: lead.occupation ?? undefined,
      stage: lead.stage, notes: lead.notes ?? undefined, premium_budget: lead.premium_budget ?? undefined,
    });
    setOpen(true);
  };

  const update = (patch: Partial<LeadUpdate>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    if (form.phone !== undefined && !/^[6-9]\d{9}$/.test(form.phone)) {
      toast({ title: "Valid 10-digit mobile required", variant: "destructive" }); return;
    }
    updateLead.mutate(
      { id: lead.id, data: form },
      { onSuccess: () => { toast({ title: "Lead updated" }); queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(lead.id) }); setOpen(false); },
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" className="h-8" onClick={openDialog}>Edit</Button>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit Lead</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Full Name</Label>
            <Input value={form.full_name ?? ""} onChange={(e) => update({ full_name: e.target.value })} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input value={form.phone ?? ""} onChange={(e) => update({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input value={form.email ?? ""} onChange={(e) => update({ email: e.target.value || null })} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">City</Label>
            <Input value={form.city ?? ""} onChange={(e) => update({ city: e.target.value || null })} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">State</Label>
            <Input value={form.state ?? ""} onChange={(e) => update({ state: e.target.value || null })} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Stage</Label>
            <Select value={form.stage ?? ""} onValueChange={(v) => update({ stage: v as LeadStage })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {Object.keys(LeadStage).map((s) => <SelectItem key={s} value={s} className="text-sm capitalize">{s.replace(/_/g, " ").toLowerCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Premium Budget</Label>
            <Input type="number" value={form.premium_budget ?? ""} onChange={(e) => update({ premium_budget: e.target.value ? Math.round(Number(e.target.value)) : null })} className="h-8 text-sm" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => update({ notes: e.target.value || null })} className="text-sm" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={updateLead.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CallLogRow({ call, index }: { call: any; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const isCompleted = call.status === "COMPLETED";
  const hasRecording = !!call.recording_url;
  const hasTranscript = !!(call.transcript && call.transcript.length > 10);
  const hasSummary = !!(call.summary && call.summary.length > 5);
  const duration = call.duration_seconds ?? 0;
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;

  return (
    <div className="border border-[#dfe1ed] rounded-lg overflow-hidden bg-white">
      <div className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[#f7f8fc] transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="text-[11px] text-muted-foreground/50 font-mono w-5">{index + 1}</div>
        <div className="flex-shrink-0">
          <CallStatusBadge status={call.status} />
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <div className="text-[12px] font-medium text-[#1a1c2e] tabular-nums">
            {formatPhone(call.phone_number)}
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <ArrowRight className="w-3 h-3" />
            {call.direction === "INBOUND" ? <span className="text-[#0ea5e9] font-medium">Inbound</span> : <span className="text-[#6366f1] font-medium">Outbound</span>}
          </div>
          {duration > 0 && (
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
            </div>
          )}
          {call.drop_detected && (
            <span className="text-[11px] text-[#ef4444] font-medium bg-[#ef444412] px-1.5 py-0.5 rounded">Dropped</span>
          )}
          {hasRecording && (
            <span className="text-[11px] text-[#6366f1] font-medium bg-[#6366f112] px-1.5 py-0.5 rounded flex items-center gap-1">
              <Headphones className="w-3 h-3" /> Recording
            </span>
          )}
          <div className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {call.started_at ? formatDate(call.started_at) : "N/A"}
          </div>
        </div>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
      </div>

      {expanded && (
        <div className="border-t border-[#dfe1ed] px-4 py-3 bg-[#f7f8fc] space-y-3">
          {hasSummary && (
            <div>
              <h4 className="text-[11px] font-semibold text-[#4b4f6b] uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3 h-3" /> Call Summary
              </h4>
              <p className="text-[12px] text-[#1a1c2e] leading-relaxed bg-white p-2.5 rounded border border-[#dfe1ed]">
                {call.summary}
              </p>
            </div>
          )}
          {hasTranscript && (
            <div>
              <h4 className="text-[11px] font-semibold text-[#4b4f6b] uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <Mic className="w-3 h-3" /> Transcript
              </h4>
              <div className="text-[12px] text-[#1a1c2e] leading-relaxed bg-white p-2.5 rounded border border-[#dfe1ed] max-h-48 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap">
                {call.transcript}
              </div>
            </div>
          )}
          {hasRecording && (
            <div>
              <h4 className="text-[11px] font-semibold text-[#4b4f6b] uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <Headphones className="w-3 h-3" /> Recording
              </h4>
              <audio controls className="w-full h-8" src={call.recording_url} />
            </div>
          )}
          <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>Agent: <strong className="text-[#1a1c2e]">{call.agent_name || "AI Agent"}</strong></span>
            <span>Exec ID: <strong className="text-[#1a1c2e] font-mono">{call.bolna_execution_id.slice(0, 12)}...</strong></span>
            <span>Compliance: <strong className={call.compliance_score && call.compliance_score >= 80 ? "text-[#22c55e]" : call.compliance_score ? "text-[#f59e0b]" : "text-[#94a3b8]"}>{call.compliance_score ? `${call.compliance_score}/100` : "Pending"}</strong></span>
            {call.drop_detected && <span>Drop Reason: <strong className="text-[#ef4444]">{call.drop_reason || "Unknown"}</strong></span>}
          </div>
        </div>
      )}
    </div>
  );
}

function MarkAsSoldDialog({ lead }: { lead: LeadDetailType }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ insurer_name: "", policy_number: "", annual_premium: "", policy_type: lead.insurance_type ?? "LIFE", start_date: "" });
  const createPolicy = useCreatePolicy();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    if (!form.insurer_name.trim()) { toast({ title: "Insurer name required", variant: "destructive" }); return; }
    const data: PolicyInput = {
      lead_id: lead.id,
      policy_type: form.policy_type as PolicyInput["policy_type"],
      insurer_name: form.insurer_name.trim(),
      policy_number: form.policy_number.trim() || undefined,
      annual_premium: form.annual_premium ? parseInt(form.annual_premium.replace(/\D/g, ""), 10) : undefined,
      start_date: form.start_date ? new Date(form.start_date) : undefined,
      status: "ACTIVE",
    };
    createPolicy.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Policy recorded! Lead marked as sold." });
        queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(lead.id) });
        setOpen(false);
        setForm({ insurer_name: "", policy_number: "", annual_premium: "", policy_type: lead.insurance_type ?? "LIFE", start_date: "" });
      },
      onError: () => toast({ title: "Could not save policy", variant: "destructive" }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="h-8 gap-1.5 text-[#22c55e] border-[#22c55e40] hover:bg-[#22c55e10]">
        <BadgeIndianRupee className="w-3.5 h-3.5" />
        Mark as Sold
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Policy Sale</DialogTitle>
          <DialogDescription>Log the policy details for {lead.full_name}.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Insurer Name *</Label>
            <Input value={form.insurer_name} onChange={(e) => update({ insurer_name: e.target.value })} placeholder="LIC, HDFC Life, Star Health…" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Policy Number</Label>
            <Input value={form.policy_number} onChange={(e) => update({ policy_number: e.target.value })} placeholder="POL123456" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Annual Premium (₹)</Label>
            <Input value={form.annual_premium} onChange={(e) => update({ annual_premium: e.target.value.replace(/\D/g, "") })} placeholder="12000" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Policy Type</Label>
            <Select value={form.policy_type} onValueChange={(v) => update({ policy_type: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["LIFE","HEALTH","MOTOR","TERM","ULIP","ENDOWMENT","ACCIDENT","TRAVEL"].map((t) => (
                  <SelectItem key={t} value={t} className="text-sm capitalize">{t.toLowerCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Start Date</Label>
            <Input type="date" value={form.start_date} onChange={(e) => update({ start_date: e.target.value })} className="h-8 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={createPolicy.isPending} className="gap-1.5 bg-[#22c55e] hover:bg-[#16a34a]">
            {createPolicy.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save Policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LeadDetail() {
  const [, params] = useRoute("/leads/:id");
  const id = params?.id || "";

  const { data: lead, isLoading } = useGetLead(id, { query: { enabled: !!id, queryKey: getGetLeadQueryKey(id) } });
  const updateLead = useUpdateLead();
  const queryClient = useQueryClient();

  const callLogs = useMemo(() => {
    if (!lead?.call_logs) return [];
    return [...lead.call_logs].sort((a, b) => {
      const t1 = a.started_at ? new Date(a.started_at).getTime() : 0;
      const t2 = b.started_at ? new Date(b.started_at).getTime() : 0;
      return t2 - t1;
    });
  }, [lead?.call_logs]);

  const completedCalls = callLogs.filter((c) => c.status === "COMPLETED");
  const totalDuration = callLogs.reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0);
  const dropCount = callLogs.filter((c) => c.drop_detected).length;
  const lastCall = callLogs[0];

  const overallSummary = useMemo(() => {
    if (!lead) return "";
    const parts: string[] = [];
    parts.push(`Lead captured on ${formatDate(lead.created_at)} via ${lead.source.replace(/_/g, " ").toLowerCase()}.`);
    if (completedCalls.length > 0) {
      parts.push(`AI agent completed ${completedCalls.length} call${completedCalls.length > 1 ? "s" : ""} totaling ${Math.round(totalDuration / 60)} minutes.`);
    }
    if (lastCall?.summary) {
      parts.push(`Latest call: ${lastCall.summary}`);
    } else if (lastCall?.status === "COMPLETED") {
      parts.push(`Latest call completed successfully. Details pending.`);
    }
    if (lead.stage === "CONTACTED" || lead.stage === "INTERESTED") {
      parts.push(`Lead is currently in ${STAGE_META[lead.stage]?.label || lead.stage} stage — active follow-up recommended.`);
    } else if (lead.stage === "DOCS_PENDING") {
      parts.push(`Lead is in Docs Pending stage — collect documents to proceed.`);
    } else if (lead.stage === "POLICY_ISSUED") {
      parts.push(`Policy issued! Move to renewal pipeline when due.`);
    } else if (lead.stage === "LOST" || lead.stage === "DO_NOT_CALL") {
      parts.push(`Lead is ${STAGE_META[lead.stage]?.label || lead.stage}. No further action needed.`);
    }
    return parts.join(" · ");
  }, [lead, completedCalls, totalDuration, lastCall]);

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="p-6 max-w-7xl mx-auto text-center py-20">
        <h1 className="text-xl font-bold text-muted-foreground">Lead not found</h1>
        <p className="text-sm text-muted-foreground/60 mt-1">This lead may have been deleted.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[hsl(230,40%,96%)]">
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-5 py-3 bg-white/70 backdrop-blur-sm border-b border-border/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <a href="/leads" className="p-1.5 rounded hover:bg-muted transition-colors flex-shrink-0">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </a>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-[#1a1c2e] truncate">{lead.full_name}</h1>
              <StageBadge stage={lead.stage} />
              {lead.last_contacted_at && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Last contacted {formatDate(lead.last_contacted_at)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
              <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {formatPhone(lead.phone)}</span>
              {lead.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {lead.email}</span>}
              {lead.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {lead.city}{lead.state ? `, ${lead.state}` : ""}</span>}
              <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> ID: {lead.id.slice(0, 8)}...</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {lead.is_dnd && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[#ef4444] bg-[#ef444412] border border-[#ef444430] px-2 py-1 rounded">
              <ShieldX className="w-3 h-3" /> DND
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className={`h-8 gap-1.5 text-[11px] ${lead.is_dnd ? "border-red-200 text-red-500 hover:bg-red-50" : "text-muted-foreground hover:text-red-500"}`}
            onClick={() => updateLead.mutate({ id: lead.id, data: { is_dnd: !lead.is_dnd } }, {
              onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(lead.id) })
            })}
            title={lead.is_dnd ? "Remove DND" : "Mark as DND (Do Not Disturb)"}
          >
            {lead.is_dnd ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldX className="w-3.5 h-3.5" />}
            {lead.is_dnd ? "Remove DND" : "DND"}
          </Button>
          <MarkAsSoldDialog lead={lead} />
          <TriggerCallDialog lead={lead} />
          <EditLeadDialog lead={lead} />
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 overflow-auto p-5">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left column: Lifecycle + Call Logs */}
          <div className="lg:col-span-2 space-y-5">

            {/* Overall Summary */}
            <div className="bg-white border border-[#dfe1ed] rounded-lg p-4">
              <h3 className="text-[12px] font-semibold text-[#4b4f6b] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Lead Summary
              </h3>
              <p className="text-[12px] text-[#1a1c2e] leading-relaxed">{overallSummary}</p>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#dfe1ed]">
                <div className="text-center">
                  <div className="text-lg font-bold text-[#1a1c2e]">{callLogs.length}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Calls</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-[#1a1c2e]">{completedCalls.length}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Completed</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-[#1a1c2e]">{Math.round(totalDuration / 60)}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Mins</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-[#1a1c2e]">{dropCount}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Drops</div>
                </div>
              </div>
            </div>

            {/* Lifecycle Timeline */}
            <div className="bg-white border border-[#dfe1ed] rounded-lg p-4">
              <h3 className="text-[12px] font-semibold text-[#4b4f6b] uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Lifecycle Timeline
              </h3>
              <div className="space-y-0">
                {/* Lead Created */}
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-[#6366f1] mt-1.5" />
                    <div className="w-px flex-1 bg-[#dfe1ed] min-h-[20px]" />
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-[#1a1c2e]">Lead Created</span>
                      <span className="text-[11px] text-muted-foreground">{formatDateTime(lead.created_at)}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Captured via {lead.source.replace(/_/g, " ").toLowerCase()}
                      {lead.insurance_type && ` · Interested in ${lead.insurance_type.toLowerCase()}`}
                    </p>
                  </div>
                </div>

                {/* AI Calls */}
                {callLogs.map((call, i) => {
                  const color = call.status === "COMPLETED" ? "#22c55e" : call.drop_detected ? "#ef4444" : "#94a3b8";
                  return (
                    <div key={call.id} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: color }} />
                        {i < callLogs.length - 1 && <div className="w-px flex-1 bg-[#dfe1ed] min-h-[20px]" />}
                      </div>
                      <div className={`flex-1 pb-3 ${i === callLogs.length - 1 ? "" : ""}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-semibold text-[#1a1c2e]">
                            {call.direction === "INBOUND" ? "Inbound" : "Outbound"} Call
                          </span>
                          <CallStatusBadge status={call.status} />
                          <span className="text-[11px] text-muted-foreground">{call.started_at ? formatDateTime(call.started_at) : "N/A"}</span>
                          {call.duration_seconds && call.duration_seconds > 0 && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s
                            </span>
                          )}
                        </div>
                        {call.summary && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-prose">{call.summary}</p>
                        )}
                        {call.drop_detected && (
                          <p className="text-[11px] text-[#ef4444] mt-0.5">Call dropped — retry scheduled</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Call Logs Table */}
            <div className="space-y-2">
              <h3 className="text-[12px] font-semibold text-[#4b4f6b] uppercase tracking-wide flex items-center gap-1.5">
                <PhoneCall className="w-3.5 h-3.5" /> Call History ({callLogs.length})
              </h3>
              {callLogs.length === 0 ? (
                <div className="bg-white border border-[#dfe1ed] rounded-lg p-6 text-center">
                  <p className="text-sm text-muted-foreground">No calls yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Trigger a call to start the conversation</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {callLogs.map((call, i) => <CallLogRow key={call.id} call={call} index={i} />)}
                </div>
              )}
            </div>
          </div>

          {/* Right column: Profile Info */}
          <div className="space-y-5">
            <div className="bg-white border border-[#dfe1ed] rounded-lg p-4">
              <h3 className="text-[12px] font-semibold text-[#4b4f6b] uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Profile
              </h3>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-[12px]">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Phone</span>
                  <span className="ml-auto font-medium font-mono text-[#1a1c2e]">{formatPhone(lead.phone)}</span>
                </div>
                {lead.phone_alt && (
                  <div className="flex items-center gap-2 text-[12px]">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Alt</span>
                    <span className="ml-auto font-medium font-mono text-[#1a1c2e]">{formatPhone(lead.phone_alt)}</span>
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center gap-2 text-[12px]">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Email</span>
                    <span className="ml-auto font-medium text-[#1a1c2e] truncate">{lead.email}</span>
                  </div>
                )}
                {lead.dob && (
                  <div className="flex items-center gap-2 text-[12px]">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">DOB</span>
                    <span className="ml-auto font-medium text-[#1a1c2e]">{formatDate(lead.dob)} {lead.age ? `(${lead.age} yrs)` : ""}</span>
                  </div>
                )}
                {(lead.city || lead.state) && (
                  <div className="flex items-center gap-2 text-[12px]">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Location</span>
                    <span className="ml-auto font-medium text-[#1a1c2e]">{lead.city}{lead.state ? `, ${lead.state}` : ""}</span>
                  </div>
                )}
                {lead.pincode && (
                  <div className="flex items-center gap-2 text-[12px]">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Pincode</span>
                    <span className="ml-auto font-medium text-[#1a1c2e]">{lead.pincode}</span>
                  </div>
                )}
                {lead.pan_number && (
                  <div className="flex items-center gap-2 text-[12px]">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">PAN</span>
                    <span className="ml-auto font-medium font-mono text-[#1a1c2e]">{lead.pan_number}</span>
                  </div>
                )}
                {lead.aadhaar_number && (
                  <div className="flex items-center gap-2 text-[12px]">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Aadhaar</span>
                    <span className="ml-auto font-medium font-mono text-[#1a1c2e]">{lead.aadhaar_number}</span>
                  </div>
                )}
                {lead.occupation && (
                  <div className="flex items-center gap-2 text-[12px]">
                    <Building className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Occupation</span>
                    <span className="ml-auto font-medium text-[#1a1c2e]">{lead.occupation}{lead.employer_name ? ` at ${lead.employer_name}` : ""}</span>
                  </div>
                )}
                {lead.annual_income && (
                  <div className="flex items-center gap-2 text-[12px]">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Income</span>
                    <span className="ml-auto font-medium text-[#1a1c2e]">{formatCurrency(lead.annual_income)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white border border-[#dfe1ed] rounded-lg p-4">
              <h3 className="text-[12px] font-semibold text-[#4b4f6b] uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Insurance Details
              </h3>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="text-muted-foreground">Type</span>
                  <span className="ml-auto font-medium text-[#1a1c2e] capitalize">{lead.insurance_type?.toLowerCase() || "Not specified"}</span>
                </div>
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="text-muted-foreground">Budget</span>
                  <span className="ml-auto font-medium text-[#1a1c2e]">{formatCurrency(lead.premium_budget)}</span>
                </div>
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="text-muted-foreground">Sum Assured</span>
                  <span className="ml-auto font-medium text-[#1a1c2e]">{formatCurrency(lead.sum_assured_interest)}</span>
                </div>
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="text-muted-foreground">Gender</span>
                  <span className="ml-auto font-medium text-[#1a1c2e] capitalize">{lead.gender.toLowerCase()}</span>
                </div>
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="text-muted-foreground">Source</span>
                  <span className="ml-auto font-medium text-[#1a1c2e] capitalize">{lead.source.replace(/_/g, " ").toLowerCase()}</span>
                </div>
                {lead.tags?.length > 0 && (
                  <div className="flex items-center gap-2 text-[12px] flex-wrap">
                    <span className="text-muted-foreground">Tags</span>
                    <div className="flex gap-1 ml-auto">
                      {lead.tags.map((t) => (
                        <span key={t} className="bg-[#f0f1f7] text-[#4b4f6b] px-1.5 py-0.5 rounded text-[10px] font-medium">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Policies */}
            {lead.policies && lead.policies.length > 0 && (
              <div className="bg-white border border-[#22c55e30] rounded-lg p-4">
                <h3 className="text-[12px] font-semibold text-[#4b4f6b] uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <BadgeIndianRupee className="w-3.5 h-3.5 text-[#22c55e]" /> Policies ({lead.policies.length})
                </h3>
                <div className="space-y-3">
                  {lead.policies.map((p) => (
                    <div key={p.id} className="bg-[#f0fdf4] border border-[#22c55e30] rounded p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-[#16a34a]">{p.insurer_name || "Unknown Insurer"}</span>
                        <span className="text-[10px] font-medium bg-[#22c55e20] text-[#16a34a] px-1.5 py-0.5 rounded capitalize">{p.policy_type.toLowerCase()}</span>
                      </div>
                      {p.policy_number && <div className="text-[11px] text-muted-foreground">Policy # <strong className="text-[#1a1c2e] font-mono">{p.policy_number}</strong></div>}
                      {p.annual_premium && <div className="text-[11px] text-muted-foreground">Premium <strong className="text-[#1a1c2e]">{formatCurrency(p.annual_premium)}</strong> / year</div>}
                      {p.start_date && <div className="text-[11px] text-muted-foreground">Started <strong className="text-[#1a1c2e]">{formatDate(p.start_date)}</strong></div>}
                      <div className="text-[10px] text-[#22c55e] font-medium uppercase tracking-wide">{p.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {lead.notes && (
              <div className="bg-white border border-[#dfe1ed] rounded-lg p-4">
                <h3 className="text-[12px] font-semibold text-[#4b4f6b] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Notes
                </h3>
                <p className="text-[12px] text-[#1a1c2e] leading-relaxed whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}

            {/* Follow-ups */}
            {lead.follow_ups && lead.follow_ups.length > 0 && (
              <div className="bg-white border border-[#dfe1ed] rounded-lg p-4">
                <h3 className="text-[12px] font-semibold text-[#4b4f6b] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Follow-ups
                </h3>
                <div className="space-y-2">
                  {lead.follow_ups.map((fu) => (
                    <div key={fu.id} className="flex items-center justify-between text-[12px] border-b border-[#dfe1ed] last:border-0 pb-2 last:pb-0">
                      <span className="text-[#1a1c2e] font-medium">{fu.type.replace(/_/g, " ").toLowerCase()}</span>
                      <span className="text-muted-foreground">{fu.scheduled_at ? formatDate(fu.scheduled_at) : "No date"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
