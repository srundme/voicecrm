import { useListAutomations, useCreateAutomation, useUpdateAutomation, useDeleteAutomation, getListAutomationsQueryKey, AutomationType } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { formatRelativeTime } from "@/lib/format";
import { Plus, Loader2, Trash2, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const TYPE_LABEL: Record<string, string> = {
  AUTO_CALL_ON_LEAD: "Auto-call on new lead",
  RETRY_ON_DROP: "Retry on dropped call",
  SCHEDULED_FOLLOWUP: "Scheduled follow-up",
  MONTHLY_CHECKIN: "Monthly check-in",
};

export default function Automations() {
  const { data, isLoading } = useListAutomations();
  const createAutomation = useCreateAutomation();
  const updateAutomation = useUpdateAutomation();
  const deleteAutomation = useDeleteAutomation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: AutomationType.AUTO_CALL_ON_LEAD as AutomationType,
    bolna_agent_id: "",
    is_active: true,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListAutomationsQueryKey() });

  const handleCreate = () => {
    if (!form.name.trim() || !form.bolna_agent_id.trim()) {
      toast({ variant: "destructive", title: "Missing fields", description: "Name and Bolna agent ID are required." });
      return;
    }
    createAutomation.mutate(
      { data: { name: form.name.trim(), type: form.type, bolna_agent_id: form.bolna_agent_id.trim(), is_active: form.is_active } },
      {
        onSuccess: () => { invalidate(); setOpen(false); setForm({ ...form, name: "", bolna_agent_id: "" }); toast({ title: "Automation created" }); },
        onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
      }
    );
  };

  const handleToggle = (id: string, is_active: boolean) => {
    updateAutomation.mutate({ id, data: { is_active } }, {
      onSuccess: () => invalidate(),
      onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this automation?")) return;
    deleteAutomation.mutate({ id }, {
      onSuccess: () => { invalidate(); toast({ title: "Deleted" }); },
      onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Automations</h1>
          <p className="text-muted-foreground mt-1">Rules that trigger AI voice calls automatically.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Automation
        </Button>
      </div>

      {isLoading ? (
        <div className="h-32 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : !data || data.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No automations configured yet.</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-primary" />
                    <CardTitle className="text-lg">{a.name}</CardTitle>
                  </div>
                  <Switch checked={a.is_active} onCheckedChange={(v) => handleToggle(a.id, v)} />
                </div>
                <CardDescription>{TYPE_LABEL[a.type] || a.type}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Agent: <span className="font-mono text-foreground">{a.bolna_agent_id}</span></div>
                  <div className="text-muted-foreground">{a.last_triggered_at ? `Last run ${formatRelativeTime(a.last_triggered_at)}` : "Never triggered"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={a.is_active ? "default" : "secondary"}>{a.is_active ? "Active" : "Paused"}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)} title="Delete">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Automation</DialogTitle>
            <DialogDescription>Trigger AI calls based on events.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Call new motor leads" />
            </div>
            <div className="space-y-2">
              <Label>Trigger</Label>
              <Select value={form.type} onValueChange={(v: any) => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(AutomationType).map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t] || t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Bolna Agent ID</Label>
              <Input value={form.bolna_agent_id} onChange={(e) => setForm(f => ({ ...f, bolna_agent_id: e.target.value }))} placeholder="Agent that will place calls" />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Active</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createAutomation.isPending}>{createAutomation.isPending ? "Saving..." : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
