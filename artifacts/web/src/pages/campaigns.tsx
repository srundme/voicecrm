import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PhoneCall,
  Play,
  Pause,
  X,
  Trash2,
  Upload,
  Clock,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Users,
  Plus,
  Eye,
  TimerReset,
  Megaphone,
} from "lucide-react";
import { Link } from "wouter";

const base = import.meta.env.BASE_URL;
const api = (path: string) => `${base}api${path}`;

type CampaignStats = {
  total: number;
  pending: number;
  in_progress: number;
  called: number;
  failed: number;
  skipped: number;
};

type Campaign = {
  id: string;
  name: string;
  agent_id: string;
  agent_name: string | null;
  window_start: string;
  window_end: string;
  interval_minutes: number;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
  last_dialed_at: string | null;
  notes: string | null;
  stats: CampaignStats;
  created_at: string;
};

type BolnaAgent = { id: string; name: string; agent_type?: string };

function parseCsv(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => {
    const cols: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  });
}

function fmt12(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

function estimateDuration(total: number, intervalMin: number, windowHours: number) {
  const callsPerWindow = Math.floor((windowHours * 60) / intervalMin);
  const days = Math.ceil(total / callsPerWindow);
  const totalHours = Math.round((total * intervalMin) / 60);
  if (days > 1) return `~${days} days (${totalHours}h total dial time)`;
  return `~${totalHours}h on a single day`;
}

const STATUS_CONFIG = {
  DRAFT:     { label: "Draft",     color: "#94a3b8", bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.2)" },
  ACTIVE:    { label: "Active",    color: "#10b981", bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.22)" },
  PAUSED:    { label: "Paused",    color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.22)" },
  COMPLETED: { label: "Completed", color: "#6366f1", bg: "rgba(99,102,241,0.12)",  border: "rgba(99,102,241,0.22)" },
  CANCELLED: { label: "Cancelled", color: "#ef4444", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.22)" },
} as const;

export default function CampaignsPage() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: campaignsData, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => fetch(api("/campaigns")).then((r) => r.json()),
    refetchInterval: 15_000,
  });

  const campaigns: Campaign[] = campaignsData?.data ?? [];

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["campaigns"] });
    if (selectedId) qc.invalidateQueries({ queryKey: ["campaign", selectedId] });
  }

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      fetch(api(`/campaigns/${id}/${action}`), { method: "PATCH" }).then((r) => r.json()),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(api(`/campaigns/${id}`), { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => { invalidate(); setSelectedId(null); },
  });

  const selected = selectedId ? campaigns.find((c) => c.id === selectedId) : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Bulk Campaigns</h1>
          <p className="text-sm text-slate-500 mt-0.5">Schedule automated call blitzes to lists of leads.</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 4px 14px rgba(99,102,241,0.35)" }}
        >
          <Plus className="h-4 w-4" />
          New Campaign
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
              <Megaphone className="h-8 w-8 text-indigo-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 mb-1">No campaigns yet</h3>
            <p className="text-sm text-slate-400 max-w-xs">Upload a list of leads and set a calling window. The AI will dial them automatically at your chosen pace.</p>
            <button
              onClick={() => setShowNew(true)}
              className="mt-5 flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              <Plus className="h-4 w-4" />
              Create your first campaign
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => {
            const cfg = STATUS_CONFIG[c.status];
            const pct = c.stats.total > 0 ? Math.round(((c.stats.called + c.stats.failed) / c.stats.total) * 100) : 0;
            const windowH = (() => {
              const [sh, sm] = c.window_start.split(":").map(Number);
              const [eh, em] = c.window_end.split(":").map(Number);
              return (eh * 60 + em - sh * 60 - sm) / 60;
            })();
            return (
              <Card key={c.id} className="flex flex-col">
                <CardContent className="p-5 flex flex-col gap-4 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-800 truncate text-[15px]">{c.name}</h3>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                          style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                        >
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setSelectedId(c.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                        title="View details"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {["DRAFT", "CANCELLED"].includes(c.status) && (
                        <button
                          onClick={() => deleteMutation.mutate(c.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>{c.stats.called + c.stats.failed} / {c.stats.total} dialed</span>
                      <span className="font-medium text-slate-700">{pct}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: c.status === "ACTIVE" ? "linear-gradient(90deg, #6366f1, #8b5cf6)" : c.status === "COMPLETED" ? "linear-gradient(90deg, #10b981, #06b6d4)" : c.status === "CANCELLED" ? "linear-gradient(90deg, #ef4444, #f59e0b)" : "linear-gradient(90deg, #94a3b8, #cbd5e1)" }}
                      />
                    </div>
                    <div className="flex gap-3 text-[10px] text-slate-400">
                      <span className="flex items-center gap-0.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />{c.stats.called} called</span>
                      <span className="flex items-center gap-0.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />{c.stats.failed} failed</span>
                      <span className="flex items-center gap-0.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300" />{c.stats.pending} pending</span>
                    </div>
                  </div>

                  {/* Window & interval */}
                  <div className="flex items-center gap-4 text-xs text-slate-500 pb-1">
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-indigo-400" />{fmt12(c.window_start)} – {fmt12(c.window_end)}</span>
                    <span className="flex items-center gap-1"><TimerReset className="h-3.5 w-3.5 text-purple-400" />every {c.interval_minutes} min</span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-auto pt-1 border-t border-slate-100">
                    {c.status === "DRAFT" && (
                      <ActionButton icon={Play} label="Start" color="#10b981" onClick={() => actionMutation.mutate({ id: c.id, action: "start" })} />
                    )}
                    {c.status === "ACTIVE" && (
                      <ActionButton icon={Pause} label="Pause" color="#f59e0b" onClick={() => actionMutation.mutate({ id: c.id, action: "pause" })} />
                    )}
                    {c.status === "PAUSED" && (
                      <ActionButton icon={Play} label="Resume" color="#10b981" onClick={() => actionMutation.mutate({ id: c.id, action: "start" })} />
                    )}
                    {["DRAFT", "ACTIVE", "PAUSED"].includes(c.status) && (
                      <ActionButton icon={X} label="Cancel" color="#ef4444" onClick={() => actionMutation.mutate({ id: c.id, action: "cancel" })} />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <NewCampaignModal open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); invalidate(); }} />
      {selected && <CampaignDetailModal campaign={selected} onClose={() => setSelectedId(null)} onAction={(action) => actionMutation.mutate({ id: selected.id, action })} />}
    </div>
  );
}

function ActionButton({ icon: Icon, label, color, onClick }: { icon: any; label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-80"
      style={{ color, background: `${color}14`, border: `1px solid ${color}25` }}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function CampaignDetailModal({ campaign, onClose, onAction }: { campaign: Campaign; onClose: () => void; onAction: (action: string) => void }) {
  const { data } = useQuery({
    queryKey: ["campaign", campaign.id],
    queryFn: () => fetch(api(`/campaigns/${campaign.id}`)).then((r) => r.json()),
    refetchInterval: campaign.status === "ACTIVE" ? 10_000 : false,
  });
  const detail = data?.data;
  const leads = detail?.leads ?? [];
  const cfg = STATUS_CONFIG[campaign.status];
  const pct = campaign.stats.total > 0 ? Math.round(((campaign.stats.called + campaign.stats.failed) / campaign.stats.total) * 100) : 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.9)" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-slate-800">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "rgba(99,102,241,0.10)", border: "1px solid rgba(99,102,241,0.18)" }}>
              <Megaphone className="h-4 w-4 text-indigo-500" />
            </div>
            {campaign.name}
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>{cfg.label}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mt-1">
          {[
            { label: "Total", value: campaign.stats.total, color: "#6366f1" },
            { label: "Called", value: campaign.stats.called, color: "#10b981" },
            { label: "Failed", value: campaign.stats.failed, color: "#ef4444" },
            { label: "Pending", value: campaign.stats.pending, color: "#94a3b8" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl p-3 text-center" style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}>
              <div className="text-2xl font-bold" style={{ color }}>{value}</div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>{campaign.window_start} – {campaign.window_end} IST · every {campaign.interval_minutes} min · {campaign.agent_name ?? campaign.agent_id}</span>
            <span className="font-medium">{pct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #6366f1, #8b5cf6)" }} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {campaign.status === "DRAFT" && <ActionButton icon={Play} label="Start Campaign" color="#10b981" onClick={() => onAction("start")} />}
          {campaign.status === "ACTIVE" && <ActionButton icon={Pause} label="Pause" color="#f59e0b" onClick={() => onAction("pause")} />}
          {campaign.status === "PAUSED" && <ActionButton icon={Play} label="Resume" color="#10b981" onClick={() => onAction("start")} />}
          {["DRAFT", "ACTIVE", "PAUSED"].includes(campaign.status) && <ActionButton icon={X} label="Cancel" color="#ef4444" onClick={() => onAction("cancel")} />}
        </div>

        {/* Lead list */}
        <div className="flex-1 overflow-y-auto rounded-xl" style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)" }}>
          <div className="p-2 space-y-1">
            {leads.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">No leads uploaded yet</div>
            ) : leads.slice(0, 200).map((l: any) => (
              <div key={l.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.6)" }}>
                <div>
                  <div className="text-sm font-medium text-slate-700">{l.full_name}</div>
                  <div className="text-xs text-slate-400">{l.phone}</div>
                </div>
                <LeadStatusPill status={l.status} />
              </div>
            ))}
            {leads.length > 200 && (
              <div className="py-3 text-center text-xs text-slate-400">…and {leads.length - 200} more leads</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeadStatusPill({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string; label: string }> = {
    PENDING:     { color: "#94a3b8", bg: "rgba(148,163,184,0.12)", label: "Pending" },
    IN_PROGRESS: { color: "#6366f1", bg: "rgba(99,102,241,0.12)",  label: "Dialing" },
    CALLED:      { color: "#10b981", bg: "rgba(16,185,129,0.12)",  label: "Called" },
    FAILED:      { color: "#ef4444", bg: "rgba(239,68,68,0.12)",   label: "Failed" },
    SKIPPED:     { color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  label: "Skipped" },
  };
  const s = map[status] ?? map.PENDING;
  return (
    <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

type NewForm = {
  name: string;
  agent_id: string;
  agent_name: string;
  window_start: string;
  window_end: string;
  interval_minutes: number;
  notes: string;
};

function NewCampaignModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<NewForm>({
    name: "", agent_id: "", agent_name: "", window_start: "09:00", window_end: "13:00",
    interval_minutes: 3, notes: "",
  });
  const [csvRows, setCsvRows] = useState<Array<{ phone: string; full_name: string }>>([]);
  const [csvError, setCsvError] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [phoneCol, setPhoneCol] = useState<number | null>(null);
  const [nameCol, setNameCol] = useState<number | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: agentsData } = useQuery({
    queryKey: ["agents-list"],
    queryFn: () => fetch(api("/agents")).then((r) => r.json()),
    enabled: open,
  });
  const agents: BolnaAgent[] = agentsData?.data ?? [];

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await fetch(api("/campaigns"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return r.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ id, leads }: { id: string; leads: any[] }) => {
      const r = await fetch(api(`/campaigns/${id}/leads`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads }),
      });
      return r.json();
    },
  });

  function reset() {
    setStep(1);
    setForm({ name: "", agent_id: "", agent_name: "", window_start: "09:00", window_end: "13:00", interval_minutes: 3, notes: "" });
    setCsvRows([]); setCsvError(""); setHeaders([]); setRawRows([]);
    setPhoneCol(null); setNameCol(null); setCreatedId(null);
  }

  function handleClose() { reset(); onClose(); }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text);
      if (parsed.length < 2) { setCsvError("CSV must have a header row and at least one data row."); return; }
      const hdrs = parsed[0];
      setHeaders(hdrs);
      setRawRows(parsed.slice(1));
      // Auto-detect columns
      const phoneIdx = hdrs.findIndex((h) => /phone|mobile|number|contact/i.test(h));
      const nameIdx  = hdrs.findIndex((h) => /name/i.test(h));
      setPhoneCol(phoneIdx >= 0 ? phoneIdx : null);
      setNameCol(nameIdx  >= 0 ? nameIdx  : null);
    };
    reader.readAsText(file);
  }

  function buildLeads() {
    if (phoneCol === null) return [];
    return rawRows
      .map((r) => ({
        phone: r[phoneCol] ?? "",
        full_name: nameCol !== null ? (r[nameCol] ?? "") : "",
      }))
      .filter((l) => l.phone.trim());
  }

  async function handleCreate() {
    const agent = agents.find((a) => a.id === form.agent_id);
    const res = await createMutation.mutateAsync({
      name: form.name,
      agent_id: form.agent_id,
      agent_name: agent?.name ?? null,
      window_start: form.window_start,
      window_end: form.window_end,
      interval_minutes: form.interval_minutes,
      notes: form.notes || null,
    });
    if (!res.success) { setCsvError(res.error ?? "Failed to create campaign"); return; }
    const campaignId = res.data.id;
    setCreatedId(campaignId);
    const leads = buildLeads();
    if (leads.length > 0) {
      await uploadMutation.mutateAsync({ id: campaignId, leads });
    }
    onCreated();
    reset();
  }

  const windowH = (() => {
    const [sh, sm] = form.window_start.split(":").map(Number);
    const [eh, em] = form.window_end.split(":").map(Number);
    return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
  })();

  const leads = buildLeads();
  const step1Valid = form.name.trim() && form.agent_id && form.window_start < form.window_end;
  const step2Valid = leads.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl" style={{ background: "rgba(255,255,255,0.97)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.9)" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-slate-800">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "rgba(99,102,241,0.10)", border: "1px solid rgba(99,102,241,0.18)" }}>
              <Megaphone className="h-4 w-4 text-indigo-500" />
            </div>
            New Bulk Campaign
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 py-1">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-all ${step >= s ? "text-white" : "text-slate-400"}`}
                style={step >= s ? { background: "linear-gradient(135deg, #6366f1, #8b5cf6)" } : { background: "rgba(0,0,0,0.06)" }}>
                {step > s ? <CheckCircle2 className="h-3.5 w-3.5" /> : s}
              </div>
              <span className={`text-xs font-medium ${step >= s ? "text-slate-700" : "text-slate-400"}`}>
                {s === 1 ? "Settings" : s === 2 ? "Upload Leads" : "Review"}
              </span>
              {s < 3 && <ChevronRight className="h-3 w-3 text-slate-300" />}
            </div>
          ))}
        </div>

        {/* Step 1 — Settings */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Campaign Name</Label>
              <Input
                placeholder="e.g. Morning Insurance Blitz – June"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="rounded-xl border-slate-200 focus:border-indigo-400"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">AI Agent</Label>
              <Select value={form.agent_id} onValueChange={(v) => setForm({ ...form, agent_id: v })}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder="Select an agent…" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Call Window Start</Label>
                <Input type="time" value={form.window_start} onChange={(e) => setForm({ ...form, window_start: e.target.value })} className="rounded-xl border-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Call Window End</Label>
                <Input type="time" value={form.window_end} onChange={(e) => setForm({ ...form, window_end: e.target.value })} className="rounded-xl border-slate-200" />
              </div>
            </div>
            {form.window_start >= form.window_end && form.window_end && (
              <p className="text-xs text-red-500">End time must be after start time.</p>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Interval Between Calls</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number" min={1} max={120}
                  value={form.interval_minutes}
                  onChange={(e) => setForm({ ...form, interval_minutes: Math.max(1, Number(e.target.value)) })}
                  className="rounded-xl border-slate-200 w-28"
                />
                <span className="text-sm text-slate-500">minutes between each call</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Notes (optional)</Label>
              <Textarea
                placeholder="Internal notes about this campaign…"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="rounded-xl border-slate-200 resize-none h-20"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                disabled={!step1Valid}
                onClick={() => setStep(2)}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                Next: Upload Leads <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Upload CSV */}
        {step === 2 && (
          <div className="space-y-4">
            <div
              className="flex flex-col items-center justify-center rounded-2xl p-8 text-center cursor-pointer transition-all hover:border-indigo-300"
              style={{ border: "2px dashed rgba(99,102,241,0.25)", background: "rgba(99,102,241,0.03)" }}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mb-3 h-8 w-8 text-indigo-400" />
              <p className="text-sm font-medium text-slate-700">Click to upload CSV</p>
              <p className="text-xs text-slate-400 mt-1">Must include a phone number column. Name is optional.</p>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFile} />
            </div>

            {csvError && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {csvError}
              </div>
            )}

            {headers.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{rawRows.length} rows detected — map columns</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-600">Phone column <span className="text-red-400">*</span></Label>
                    <Select value={phoneCol?.toString() ?? ""} onValueChange={(v) => setPhoneCol(Number(v))}>
                      <SelectTrigger className="rounded-xl border-slate-200 text-sm">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {headers.map((h, i) => <SelectItem key={i} value={i.toString()}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-600">Name column (optional)</Label>
                    <Select value={nameCol?.toString() ?? "none"} onValueChange={(v) => setNameCol(v === "none" ? null : Number(v))}>
                      <SelectTrigger className="rounded-xl border-slate-200 text-sm">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {headers.map((h, i) => <SelectItem key={i} value={i.toString()}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Preview */}
                {leads.length > 0 && (
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(0,0,0,0.08)" }}>
                    <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider" style={{ background: "rgba(0,0,0,0.03)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      Preview (first 5 of {leads.length})
                    </div>
                    {leads.slice(0, 5).map((l, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 text-sm" style={{ borderBottom: i < 4 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>
                        <span className="text-slate-700 font-medium">{l.full_name || "Unknown"}</span>
                        <span className="text-slate-400">{l.phone}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between pt-1">
              <button onClick={() => setStep(1)} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors">← Back</button>
              <button
                disabled={!step2Valid}
                onClick={() => setStep(3)}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                Next: Review <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Review & Create */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-2xl p-5 space-y-3" style={{ background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.12)" }}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 4px 12px rgba(99,102,241,0.3)" }}>
                  <Megaphone className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="font-semibold text-slate-800">{form.name}</div>
                  <div className="text-xs text-slate-500">{agents.find((a) => a.id === form.agent_id)?.name ?? form.agent_id}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.06)" }}>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Call Window</div>
                  <div className="font-semibold text-slate-700">{fmt12(form.window_start)} – {fmt12(form.window_end)}</div>
                </div>
                <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.06)" }}>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Interval</div>
                  <div className="font-semibold text-slate-700">Every {form.interval_minutes} minutes</div>
                </div>
                <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.06)" }}>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Leads</div>
                  <div className="font-semibold text-slate-700">{leads.length} contacts</div>
                </div>
                <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.06)" }}>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Est. Duration</div>
                  <div className="font-semibold text-slate-700">{estimateDuration(leads.length, form.interval_minutes, windowH)}</div>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 rounded-xl px-3 py-2.5" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.15)" }}>
              ⚡ The campaign will be saved as <strong>Draft</strong>. Hit <strong>Start</strong> on the campaign card to begin dialing within the set window.
            </p>

            {(createMutation.isError || uploadMutation.isError) && (
              <div className="text-xs text-red-600 rounded-xl px-3 py-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
                Something went wrong. Please try again.
              </div>
            )}

            <div className="flex justify-between pt-1">
              <button onClick={() => setStep(2)} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors">← Back</button>
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending || uploadMutation.isPending}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #10b981, #06b6d4)", boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}
              >
                {createMutation.isPending || uploadMutation.isPending ? "Creating…" : (
                  <><CheckCircle2 className="h-4 w-4" /> Create Campaign</>
                )}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
