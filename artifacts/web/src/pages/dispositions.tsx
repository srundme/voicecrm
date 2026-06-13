import { useListDispositions, useCreateDisposition, useUpdateDisposition, useDeleteDisposition, useListAgents, getListDispositionsQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Dispositions() {
  const { data, isLoading } = useListDispositions();
  const { data: agents } = useListAgents();
  const createDisposition = useCreateDisposition();
  const updateDisposition = useUpdateDisposition();
  const deleteDisposition = useDeleteDisposition();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    bolna_agent_id: "",
    label: "",
    color: "#6366f1",
    description: "",
    sort_order: "0",
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListDispositionsQueryKey() });

  const handleCreate = () => {
    if (!form.label.trim() || !form.bolna_agent_id.trim()) {
      toast({ variant: "destructive", title: "Missing fields", description: "Agent and Label are required." });
      return;
    }
    createDisposition.mutate(
      { data: {
        bolna_agent_id: form.bolna_agent_id.trim(),
        label: form.label.trim(),
        color: form.color,
        description: form.description || undefined,
        sort_order: Number(form.sort_order) || 0,
      } },
      {
        onSuccess: () => { invalidate(); setOpen(false); setForm({ bolna_agent_id: "", label: "", color: "#6366f1", description: "", sort_order: "0" }); toast({ title: "Disposition created" }); },
        onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
      }
    );
  };

  const handleToggle = (id: string, is_active: boolean) => {
    updateDisposition.mutate({ id, data: { is_active } }, {
      onSuccess: () => invalidate(),
      onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this disposition?")) return;
    deleteDisposition.mutate({ id }, {
      onSuccess: () => { invalidate(); toast({ title: "Deleted" }); },
      onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
    });
  };

  const agentName = (agentId: string) =>
    agents?.find((a) => a.id === agentId)?.name ?? agentId;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dispositions</h1>
          <p className="text-muted-foreground mt-1">Call outcome labels assigned per voice agent.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Disposition
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : !data || data.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No dispositions yet. Click "New Disposition" to create one.</TableCell></TableRow>
              ) : (
                data.map((d) => (
                  <TableRow key={d.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: d.color }} />
                        {d.label}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{agentName(d.bolna_agent_id)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[240px] truncate">{d.description || "-"}</TableCell>
                    <TableCell>{d.sort_order}</TableCell>
                    <TableCell><Switch checked={d.is_active} onCheckedChange={(v) => handleToggle(d.id, v)} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(d.id)} title="Delete">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
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
            <DialogTitle>New Disposition</DialogTitle>
            <DialogDescription>Define a call-outcome label for a voice agent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Agent</Label>
              <Select value={form.bolna_agent_id} onValueChange={(v) => setForm(f => ({ ...f, bolna_agent_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agent…" />
                </SelectTrigger>
                <SelectContent>
                  {(agents || []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Label</Label>
              <Input value={form.label} onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Interested" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Color</Label>
                <Input type="color" value={form.color} onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))} className="h-10 p-1" />
              </div>
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm(f => ({ ...f, sort_order: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createDisposition.isPending}>{createDisposition.isPending ? "Saving…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
