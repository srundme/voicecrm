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
import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import { Plus, Loader2, Trash2, PhoneCall, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  IN_PROGRESS: "default",
  COMPLETED: "default",
  SKIPPED: "outline",
  RESCHEDULED: "secondary",
};

export default function FollowUps() {
  const [status, setStatus] = useState<FollowUpStatus | "ALL">("ALL");
  const { data, isLoading } = useListFollowUps(status !== "ALL" ? { status: status as FollowUpStatus } : undefined);
  const createFollowUp = useCreateFollowUp();
  const updateFollowUp = useUpdateFollowUp();
  const deleteFollowUp = useDeleteFollowUp();
  const triggerCall = useTriggerFollowUpCall();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    lead_id: "",
    type: FollowUpType.MANUAL as FollowUpType,
    scheduled_at: "",
    bolna_agent_id: "",
    notes: "",
  });

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

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Follow-ups</h1>
          <p className="text-muted-foreground mt-1">Scheduled renewals, check-ins, and callbacks.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Follow-up
        </Button>
      </div>

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
              ) : !data || data.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No follow-ups scheduled.</TableCell></TableRow>
              ) : (
                data.map((f) => (
                  <TableRow key={f.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{f.lead_name || "-"}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{f.type.replace(/_/g, ' ').toLowerCase()}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(f.scheduled_at)}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[f.status] || "secondary"}>{f.status.replace(/_/g, ' ')}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{f.notes || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleCall(f.id)} disabled={triggerCall.isPending} title="Trigger call now">
                          <PhoneCall className="w-4 h-4 text-primary" />
                        </Button>
                        {f.status !== "COMPLETED" && (
                          <Button variant="ghost" size="icon" onClick={() => handleComplete(f.id)} title="Mark complete">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          </Button>
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
