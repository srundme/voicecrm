import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  useListLeads,
  useGetLead,
  useListFollowUps,
  useCreateFollowUp,
  useTriggerLeadCall,
  useGetApiConfig,
  getListFollowUpsQueryKey,
  type Lead,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  formatPhone,
  formatDate,
  formatDateTime,
  formatCurrency,
} from "@/lib/format";
import {
  Search,
  Shield,
  Phone,
  Calendar,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertTriangle,
  Clock,
  CheckCircle2,
  PhoneCall,
  PhoneOff,
  PhoneMissed,
  Loader2,
  CalendarPlus,
  Info,
} from "lucide-react";

// ─── helpers ─────────────────────────────────────────────────────────────────

const POLICY_TYPE_LABEL: Record<string, string> = {
  LIFE: "Life",
  HEALTH: "Health",
  MOTOR: "Motor",
  TERM: "Term",
  ULIP: "ULIP",
  ENDOWMENT: "Endowment",
  ACCIDENT: "Accident",
  TRAVEL: "Travel",
};

const POLICY_STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 border-emerald-200",
  LAPSED: "bg-red-100 text-red-700 border-red-200",
  SURRENDERED: "bg-orange-100 text-orange-700 border-orange-200",
  MATURED: "bg-blue-100 text-blue-700 border-blue-200",
  CLAIMED: "bg-purple-100 text-purple-700 border-purple-200",
};

const CALL_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; Icon: React.ElementType }
> = {
  COMPLETED:   { label: "Completed",   color: "text-emerald-600 bg-emerald-50 border-emerald-200", Icon: CheckCircle2 },
  IN_PROGRESS: { label: "In Progress", color: "text-blue-600 bg-blue-50 border-blue-200",         Icon: PhoneCall },
  RINGING:     { label: "Ringing",     color: "text-blue-500 bg-blue-50 border-blue-200",          Icon: Phone },
  INITIATED:   { label: "Initiated",   color: "text-slate-500 bg-slate-50 border-slate-200",       Icon: Phone },
  FAILED:      { label: "Failed",      color: "text-red-600 bg-red-50 border-red-200",             Icon: PhoneOff },
  NO_ANSWER:   { label: "No Answer",   color: "text-amber-600 bg-amber-50 border-amber-200",       Icon: PhoneMissed },
  BUSY:        { label: "Busy",        color: "text-amber-600 bg-amber-50 border-amber-200",       Icon: PhoneMissed },
  CANCELLED:   { label: "Cancelled",   color: "text-slate-500 bg-slate-50 border-slate-200",       Icon: PhoneOff },
};

const CHECKIN_STATUS: Record<string, { label: string; color: string }> = {
  PENDING:     { label: "Scheduled",   color: "bg-blue-100 text-blue-700 border-blue-200" },
  IN_PROGRESS: { label: "In Progress", color: "bg-amber-100 text-amber-700 border-amber-200" },
  COMPLETED:   { label: "Completed",   color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  SKIPPED:     { label: "Skipped",     color: "bg-slate-100 text-slate-500 border-slate-200" },
  RESCHEDULED: { label: "Rescheduled", color: "bg-purple-100 text-purple-700 border-purple-200" },
};

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function fmtDuration(secs?: number | null) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

type PolicyShape = {
  id: string;
  policy_type: string;
  insurer_name?: string | null;
  policy_number?: string | null;
  sum_assured?: number | null;
  annual_premium?: number | null;
  premium_frequency: string;
  start_date?: Date | null;
  renewal_date?: Date | null;
  status: string;
};

type CheckinRow = {
  id: string;
  lead_id: string;
  scheduled_at: string;
  status: string;
  notes?: string | null;
};

// ─── CallHistorySection ───────────────────────────────────────────────────────

function CallHistorySection({ leadId }: { leadId: string }) {
  const { data: lead, isLoading } = useGetLead(leadId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading calls…
      </div>
    );
  }

  const logs = lead?.call_logs ?? [];
  if (logs.length === 0) {
    return (
      <p className="py-4 text-sm text-slate-400 italic text-center">
        No calls recorded yet for this policy holder.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => {
        const cfg =
          CALL_STATUS_CONFIG[log.status] ?? CALL_STATUS_CONFIG["INITIATED"]!;
        const Icon = cfg.Icon;
        const isExpanded = expandedId === log.id;
        return (
          <div
            key={log.id}
            className="rounded-lg border border-slate-200 bg-white overflow-hidden"
          >
            <button
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : log.id)}
            >
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cfg.color}`}
              >
                <Icon className="w-3 h-3" />
                {cfg.label}
              </span>
              <span className="text-xs text-slate-500">
                {log.direction === "INBOUND" ? "Inbound" : "Outbound"}
              </span>
              <span className="text-xs text-slate-500">
                {fmtDuration(log.duration_seconds)}
              </span>
              <span className="ml-auto text-xs text-slate-400">
                {formatDateTime(String(log.started_at))}
              </span>
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-slate-100 space-y-3 pt-3">
                {log.summary && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                      Summary
                    </p>
                    <p className="text-sm text-slate-700">{log.summary}</p>
                  </div>
                )}
                {log.transcript && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                      Transcript
                    </p>
                    <pre className="text-xs text-slate-600 whitespace-pre-wrap max-h-48 overflow-y-auto font-sans bg-slate-50 rounded p-2 border border-slate-100">
                      {log.transcript}
                    </pre>
                  </div>
                )}
                {log.recording_url && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                      Recording
                    </p>
                    <audio
                      controls
                      src={log.recording_url}
                      className="w-full h-8"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── CheckinScheduleSection ───────────────────────────────────────────────────

function CheckinScheduleSection({
  checkins,
  onScheduleNew,
}: {
  checkins: CheckinRow[];
  onScheduleNew: () => void;
}) {
  if (checkins.length === 0) {
    return (
      <div className="text-center py-8">
        <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-400 mb-3">
          No check-in calls scheduled yet.
        </p>
        <Button size="sm" variant="outline" onClick={onScheduleNew}>
          <CalendarPlus className="w-3.5 h-3.5 mr-1" />
          Schedule First Check-in
        </Button>
      </div>
    );
  }

  const sorted = [...checkins].sort(
    (a, b) =>
      new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
  );

  const pending = checkins.filter((c) => c.status === "PENDING").length;
  const completed = checkins.filter((c) => c.status === "COMPLETED").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500">
          {pending} upcoming · {completed} completed
        </span>
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7"
          onClick={onScheduleNew}
        >
          <CalendarPlus className="w-3 h-3 mr-1" />
          Add
        </Button>
      </div>
      {sorted.map((ci) => {
        const s = CHECKIN_STATUS[ci.status] ?? {
          label: ci.status,
          color: "bg-slate-100 text-slate-600 border-slate-200",
        };
        return (
          <div
            key={ci.id}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
          >
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${s.color}`}
            >
              {s.label}
            </span>
            <span className="text-sm text-slate-700">
              {formatDateTime(ci.scheduled_at)}
            </span>
            {ci.notes && (
              <span className="text-xs text-slate-400 truncate">{ci.notes}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── ScheduleCheckinDialog ────────────────────────────────────────────────────

interface ScheduleDialogProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  leadName: string;
  policyId?: string;
}

function ScheduleCheckinDialog({
  open,
  onClose,
  leadId,
  leadName,
  policyId,
}: ScheduleDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const defaultDt = () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  };

  const [scheduledAt, setScheduledAt] = useState(defaultDt);
  const [notes, setNotes] = useState("");

  const create = useCreateFollowUp({
    mutation: {
      onSuccess: () => {
        toast({
          title: "Check-in scheduled",
          description: `Monthly check-in call for ${leadName} has been scheduled.`,
        });
        void queryClient.invalidateQueries({
          queryKey: getListFollowUpsQueryKey(),
        });
        onClose();
        setNotes("");
      },
      onError: () =>
        toast({ title: "Failed to schedule", variant: "destructive" }),
    },
  });

  function handleSubmit() {
    create.mutate({
      data: {
        lead_id: leadId,
        policy_id: policyId,
        type: "MONTHLY_CHECKIN",
        scheduled_at: scheduledAt,
        notes: notes.trim() || undefined,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-blue-600" />
            Schedule Monthly Check-in
          </DialogTitle>
          <DialogDescription>
            Set when the AI agent should call{" "}
            <strong>{leadName}</strong> for a monthly well-being check.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="sched-dt">Date & Time</Label>
            <Input
              id="sched-dt"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              The call will be placed automatically at this time by the
              monthly check-in agent.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sched-notes">
              Notes{" "}
              <span className="text-slate-400 font-normal">(optional)</span>
            </Label>
            <Textarea
              id="sched-notes"
              placeholder="e.g. Ask about recent claim, check if premium was paid…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={create.isPending || !scheduledAt}
          >
            {create.isPending && (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            )}
            Schedule Call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── HolderCard ───────────────────────────────────────────────────────────────

interface HolderCardProps {
  lead: Lead;
  checkins: CheckinRow[];
  monthlyAgentId: string | null | undefined;
  onSchedule: (leadId: string, leadName: string, policyId?: string) => void;
}

function HolderCard({
  lead,
  checkins,
  monthlyAgentId,
  onSchedule,
}: HolderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"calls" | "checkins">("calls");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const triggerCall = useTriggerLeadCall({
    mutation: {
      onSuccess: (data) => {
        if (data.success) {
          toast({
            title: "Call initiated",
            description: "Monthly check-in call is connecting…",
          });
          void queryClient.invalidateQueries({
            queryKey: ["getLead", lead.id],
          });
        } else {
          toast({
            title: "Call failed",
            description: data.error ?? "Unknown error",
            variant: "destructive",
          });
        }
      },
      onError: () =>
        toast({ title: "Call failed", variant: "destructive" }),
    },
  });

  function handleCallNow() {
    if (!monthlyAgentId) {
      toast({
        title: "No check-in agent configured",
        description:
          "Set a Monthly Check-in Agent in Settings first.",
        variant: "destructive",
      });
      return;
    }
    triggerCall.mutate({ id: lead.id, data: { agent_id: monthlyAgentId } });
  }

  const myCheckins = checkins.filter((f) => f.lead_id === lead.id);

  const nextCheckin = myCheckins
    .filter((f) => f.status === "PENDING")
    .sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() -
        new Date(b.scheduled_at).getTime(),
    )[0];

  const firstPolicy = (
    lead as unknown as { policies?: PolicyShape[] }
  ).policies?.[0];

  const avatarColors = [
    "linear-gradient(135deg,#3b82f6,#6366f1)",
    "linear-gradient(135deg,#10b981,#06b6d4)",
    "linear-gradient(135deg,#f59e0b,#ef4444)",
    "linear-gradient(135deg,#8b5cf6,#ec4899)",
  ];
  const avatarBg =
    avatarColors[
      lead.full_name.charCodeAt(0) % avatarColors.length
    ]!;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-shadow hover:shadow-md">
      {/* Card header */}
      <div className="flex items-start gap-4 p-5">
        <div
          className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white"
          style={{ background: avatarBg }}
        >
          {initials(lead.full_name)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold text-slate-900">
              {lead.full_name}
            </span>
            {firstPolicy && (
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${POLICY_STATUS_COLOR[firstPolicy.status] ?? ""}`}
              >
                {firstPolicy.status}
              </span>
            )}
            {nextCheckin && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                <Clock className="w-3 h-3" />
                Check-in {formatDate(nextCheckin.scheduled_at)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-sm text-slate-500">
              {formatPhone(lead.phone)}
            </span>
            {lead.city && (
              <span className="text-sm text-slate-400">{lead.city}</span>
            )}
            {firstPolicy && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-sm font-medium text-slate-600">
                  {POLICY_TYPE_LABEL[firstPolicy.policy_type] ??
                    firstPolicy.policy_type}
                  {firstPolicy.insurer_name
                    ? ` · ${firstPolicy.insurer_name}`
                    : ""}
                </span>
                {firstPolicy.policy_number && (
                  <span className="text-xs text-slate-400 font-mono">
                    #{firstPolicy.policy_number}
                  </span>
                )}
              </>
            )}
          </div>

          {firstPolicy && (
            <div className="flex items-center gap-4 mt-1.5 flex-wrap">
              {firstPolicy.sum_assured != null && (
                <span className="text-xs text-slate-500">
                  Sum Assured:{" "}
                  <span className="font-semibold text-slate-700">
                    {formatCurrency(firstPolicy.sum_assured)}
                  </span>
                </span>
              )}
              {firstPolicy.annual_premium != null && (
                <span className="text-xs text-slate-500">
                  Premium:{" "}
                  <span className="font-semibold text-slate-700">
                    {formatCurrency(firstPolicy.annual_premium)}/
                    {firstPolicy.premium_frequency.toLowerCase()}
                  </span>
                </span>
              )}
              {firstPolicy.renewal_date && (
                <span className="text-xs text-slate-500">
                  Renewal:{" "}
                  <span className="font-semibold text-slate-700">
                    {formatDate(firstPolicy.renewal_date.toISOString())}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-8 gap-1"
            onClick={() =>
              onSchedule(lead.id, lead.full_name, firstPolicy?.id)
            }
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Schedule
          </Button>
          <Button
            size="sm"
            className="text-xs h-8 gap-1 bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleCallNow}
            disabled={triggerCall.isPending}
          >
            {triggerCall.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Phone className="w-3.5 h-3.5" />
            )}
            Call Now
          </Button>
          <Link href={`/leads/${lead.id}`}>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-8 px-2"
              title="Open lead detail"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </Link>
          <button
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 pt-4 pb-5">
          <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
            {(["calls", "checkins"] as const).map((tab) => (
              <button
                key={tab}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t transition-colors ${
                  activeTab === tab
                    ? "text-blue-700 border-b-2 border-blue-600 -mb-px bg-white"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "calls" ? "📞 Call History" : "📅 Check-in Schedule"}
              </button>
            ))}
          </div>

          {activeTab === "calls" && (
            <CallHistorySection leadId={lead.id} />
          )}
          {activeTab === "checkins" && (
            <CheckinScheduleSection
              checkins={myCheckins}
              onScheduleNew={() =>
                onSchedule(lead.id, lead.full_name, firstPolicy?.id)
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PolicyHolders() {
  const [search, setSearch] = useState("");
  const [scheduleFor, setScheduleFor] = useState<{
    leadId: string;
    leadName: string;
    policyId?: string;
  } | null>(null);

  const { data: leadsData, isLoading: loadingLeads } = useListLeads({
    stage: "POLICY_ISSUED",
    pageSize: 500,
  });
  const { data: checkinsRaw } = useListFollowUps({ type: "MONTHLY_CHECKIN" });
  const { data: config } = useGetApiConfig();

  const leads: Lead[] = leadsData?.data ?? [];
  const checkins = (checkinsRaw ?? []) as unknown as CheckinRow[];
  const monthlyAgentId = config?.monthly_checkin_agent_id ?? null;

  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(
      (l) =>
        l.full_name.toLowerCase().includes(q) ||
        (l.phone ?? "").includes(q) ||
        (l.city ?? "").toLowerCase().includes(q),
    );
  }, [leads, search]);

  const noAgentWarning = !monthlyAgentId && leads.length > 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
              <Shield className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-slate-900">
                Policy Holders
              </h1>
              <p className="text-sm text-slate-500">
                {loadingLeads
                  ? "Loading…"
                  : `${leads.length} policy holder${leads.length !== 1 ? "s" : ""} · monthly check-in calls`}
              </p>
            </div>
          </div>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              className="pl-9 text-sm"
              placeholder="Search name, phone or city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-4 max-w-5xl">
        {/* No agent warning */}
        {noAgentWarning && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-semibold text-amber-800">
                Monthly check-in agent not configured.
              </span>{" "}
              <span className="text-amber-700">
                Scheduled calls won't dial until you set a{" "}
                <strong>Monthly Check-in Agent</strong> in{" "}
              </span>
              <Link href="/settings" className="underline font-semibold text-amber-800">
                Settings
              </Link>
              .
            </div>
          </div>
        )}

        {/* Info pill */}
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 leading-relaxed">
            Leads marked as <strong>Policy Issued</strong> in the Leads module
            appear here automatically. Use{" "}
            <strong>Schedule</strong> to set a monthly well-being call — the AI
            agent dials at that exact date &amp; time. Use{" "}
            <strong>Call Now</strong> for an immediate test call. All calls use
            the monthly check-in agent from Settings and carry the same
            persistent memory as your main agent.
          </p>
        </div>

        {/* Loading */}
        {loadingLeads && (
          <div className="flex items-center gap-2 py-16 justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading policy holders…</span>
          </div>
        )}

        {/* Empty state */}
        {!loadingLeads && leads.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-orange-300" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 mb-1">
              No policy holders yet
            </h3>
            <p className="text-sm text-slate-400 max-w-xs mx-auto">
              When a lead is marked as{" "}
              <strong>Policy Issued</strong> in the Leads module, they'll appear
              here automatically for monthly check-in management.
            </p>
            <Link href="/leads">
              <Button variant="outline" className="mt-4 text-sm">
                Go to Leads
              </Button>
            </Link>
          </div>
        )}

        {/* No search match */}
        {!loadingLeads && leads.length > 0 && filtered.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            No policy holders match "
            <span className="font-semibold">{search}</span>"
          </div>
        )}

        {/* Cards */}
        {filtered.map((lead) => (
          <HolderCard
            key={lead.id}
            lead={lead}
            checkins={checkins}
            monthlyAgentId={monthlyAgentId}
            onSchedule={(leadId, leadName, policyId) =>
              setScheduleFor({ leadId, leadName, policyId })
            }
          />
        ))}
      </div>

      {scheduleFor && (
        <ScheduleCheckinDialog
          open={true}
          onClose={() => setScheduleFor(null)}
          leadId={scheduleFor.leadId}
          leadName={scheduleFor.leadName}
          policyId={scheduleFor.policyId}
        />
      )}
    </div>
  );
}
