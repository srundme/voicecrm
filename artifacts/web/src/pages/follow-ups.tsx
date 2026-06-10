import { useListFollowUps, useCreateFollowUp, useUpdateFollowUp, useDeleteFollowUp, useTriggerFollowUpCall, getListFollowUpsQueryKey, FollowUpType, FollowUpStatus } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { formatDateTime } from "@/lib/format";
import { Plus, Loader2, Trash2, PhoneCall, CheckCircle2, CalendarDays, List as ListIcon, ChevronLeft, ChevronRight, CalendarClock, CalendarSearch } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  IN_PROGRESS: "default",
  COMPLETED: "default",
  SKIPPED: "outline",
  RESCHEDULED: "secondary",
};

const TYPE_COLOR: Record<string, string> = {
  RENEWAL_REMINDER: "bg-amber-100 text-amber-800 border-amber-200",
  MONTHLY_CHECKIN: "bg-purple-100 text-purple-800 border-purple-200",
  CALLBACK_REQUESTED: "bg-blue-100 text-blue-800 border-blue-200",
  MANUAL: "bg-gray-100 text-gray-700 border-gray-200",
  POLICY_ANNIVERSARY: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(n: number) { return String(n).padStart(2, "0"); }
function istDateKey(iso?: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
}
function todayIstKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function TypeBadge({ type }: { type: string }) {
  return <Badge variant="outline" className={`capitalize ${TYPE_COLOR[type] || ""}`}>{type.replace(/_/g, " ").toLowerCase()}</Badge>;
}

export default function FollowUps() {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [status, setStatus] = useState<FollowUpStatus | "ALL">("ALL");
  const { data, isLoading } = useListFollowUps();
  const createFollowUp = useCreateFollowUp();
  const updateFollowUp = useUpdateFollowUp();
  const deleteFollowUp = useDeleteFollowUp();
  const triggerCall = useTriggerFollowUpCall();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reschedule, setReschedule] = useState<{ id: string; at: string } | null>(null);
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [form, setForm] = useState({
    lead_id: "",
    type: FollowUpType.MANUAL as FollowUpType,
    scheduled_at: "",
    bolna_agent_id: "",
    notes: "",
  });

  const all = data ?? [];
  const todayKey = todayIstKey();
  const todayItems = useMemo(
    () => all.filter((f) => istDateKey(f.scheduled_at) === todayKey && f.status !== "COMPLETED" && f.status !== "SKIPPED"),
    [all, todayKey],
  );
  const listItems = useMemo(
    () => (status === "ALL" ? all : all.filter((f) => f.status === status)),
    [all, status],
  );
  const countsByDay = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of all) {
      const k = istDateKey(f.scheduled_at);
      if (k) m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [all]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListFollowUpsQueryKey() });

  const handleCreate = () => {
    if (!form.lead_id.trim() || !form.scheduled_at) {
      toast({ variant: "destructive", title: "Missing fields", description: "Lead ID and schedule time are required." });
      return;
    }
    createFollowUp.mutate(
      { data: {
        lead_id: form.lead_id.trim(),
        type: form.type,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        bolna_agent_id: form.bolna_agent_id || undefined,
        notes: form.notes || undefined,
      } },
      {
        onSuccess: () => { invalidate(); setOpen(false); setForm({ ...form, lead_id: "", scheduled_at: "", bolna_agent_id: "", notes: "" }); toast({ title: "Follow-up scheduled" }); },
        onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
      }
    );
  };

  const handleReschedule = () => {
    if (!reschedule?.at) return;
    updateFollowUp.mutate(
      { id: reschedule.id, data: { scheduled_at: new Date(reschedule.at).toISOString(), status: FollowUpStatus.PENDING } },
      {
        onSuccess: () => { invalidate(); setReschedule(null); toast({ title: "Follow-up rescheduled" }); },
        onError: (err: any) => toast({ variant: "destructive", title: "Failed to reschedule", description: err.message }),
      }
    );
  };

  const handleComplete = (id: string) => {
    updateFollowUp.mutate({ id, data: { status: FollowUpStatus.COMPLETED } }, {
      onSuccess: () => { invalidate(); toast({ title: "Marked complete" }); },
      onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this follow-up?")) return;
    deleteFollowUp.mutate({ id }, {
      onSuccess: () => { invalidate(); toast({ title: "Deleted" }); },
      onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
    });
  };

  const handleCall = (id: string) => {
    triggerCall.mutate({ id }, {
      onSuccess: (res: any) => { invalidate(); toast({ title: res?.success ? "Call triggered" : "Call not started", description: res?.message || res?.error }); },
      onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
    });
  };

  const firstWeekday = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const prevMonth = () => { const d = new Date(calYear, calMonth - 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); };
  const nextMonth = () => { const d = new Date(calYear, calMonth + 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Follow-ups</h1>
          <p className="text-muted-foreground mt-1">Scheduled renewals, check-ins, and callbacks.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5">
            <Button variant={view === "list" ? "default" : "ghost"} size="sm" onClick={() => setView("list")}>
              <ListIcon className="w-4 h-4 mr-1.5" /> List
            </Button>
            <Button variant={view === "calendar" ? "default" : "ghost"} size="sm" onClick={() => setView("calendar")}>
              <CalendarDays className="w-4 h-4 mr-1.5" /> Calendar
            </Button>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Follow-up
          </Button>
        </div>
      </div>

      <Card className="border-primary/40 bg-primary/5">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Today ({todayItems.length})</h2>
          </div>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : todayItems.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nothing scheduled for today.</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {todayItems.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      {f.lead_name || "-"}
                      {f.type === "MONTHLY_CHECKIN" && <CalendarClock className="w-3.5 h-3.5 text-purple-600" />}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <TypeBadge type={f.type} />
                      <span className="text-xs text-muted-foreground">{formatDateTime(f.scheduled_at, "hh:mm a")}</span>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => handleCall(f.id)} disabled={triggerCall.isPending}>
                    <PhoneCall className="w-4 h-4 mr-1.5" /> Call Now
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {view === "calendar" ? (
        <Card className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
            <div className="font-semibold">{monthLabel}</div>
            <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d) => <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>)}
              {Array.from({ length: firstWeekday }).map((_, i) => <div key={`b${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const key = `${calYear}-${pad(calMonth + 1)}-${pad(day)}`;
                const count = countsByDay[key] || 0;
                const isToday = key === todayKey;
                return (
                  <div key={key} className={`min-h-[72px] rounded-md border p-2 ${isToday ? "border-primary bg-primary/5" : "bg-card"}`}>
                    <div className={`text-sm ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>{day}</div>
                    {count > 0 && (
                      <div className="mt-1">
                        <Badge variant="secondary" className="text-xs">{count} follow-up{count > 1 ? "s" : ""}</Badge>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      ) : (
        <Card className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b flex flex-wrap gap-4 items-center">
            <Select value={status} onValueChange={(v: any) => setStatus(v)}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                {Object.keys(FollowUpStatus).map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : listItems.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No follow-ups scheduled.</TableCell></TableRow>
                ) : (
                  listItems.map((f) => (
                    <TableRow key={f.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{f.lead_name || "-"}</TableCell>
                      <TableCell><TypeBadge type={f.type} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateTime(f.scheduled_at)}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[f.status] || "secondary"}>{f.status.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{f.notes || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleCall(f.id)} disabled={triggerCall.isPending} title="Trigger call now">
                            <PhoneCall className="w-4 h-4 text-primary" />
                          </Button>
                          {f.status !== "COMPLETED" && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => setReschedule({ id: f.id, at: "" })} title="Reschedule">
                                <CalendarSearch className="w-4 h-4 text-amber-600" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleComplete(f.id)} title="Mark complete">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(f.id)} title="Delete">
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog open={!!reschedule} onOpenChange={(v) => !v && setReschedule(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reschedule Follow-up</DialogTitle>
            <DialogDescription>Pick a new date and time. Status will be reset to Pending.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>New Date & Time</Label>
              <Input
                type="datetime-local"
                value={reschedule?.at ?? ""}
                onChange={(e) => setReschedule(r => r ? { ...r, at: e.target.value } : r)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReschedule(null)}>Cancel</Button>
            <Button onClick={handleReschedule} disabled={updateFollowUp.isPending || !reschedule?.at}>
              {updateFollowUp.isPending ? "Saving..." : "Reschedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Follow-up</DialogTitle>
            <DialogDescription>Schedule a follow-up action for a lead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Lead ID</Label>
              <Input value={form.lead_id} onChange={(e) => setForm(f => ({ ...f, lead_id: e.target.value }))} placeholder="Lead UUID" />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v: any) => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(FollowUpType).map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, ' ').toLowerCase()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Scheduled At</Label>
              <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Bolna Agent ID (optional)</Label>
              <Input value={form.bolna_agent_id} onChange={(e) => setForm(f => ({ ...f, bolna_agent_id: e.target.value }))} placeholder="For automated calls" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createFollowUp.isPending}>{createFollowUp.isPending ? "Saving..." : "Schedule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
