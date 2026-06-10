import { useListTeamMembers, useInviteTeamMember, useRemoveTeamMember, getListTeamMembersQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const ROLES = ["admin", "agent", "manager", "viewer"];

export default function Team() {
  const { data, isLoading } = useListTeamMembers();
  const invite = useInviteTeamMember();
  const remove = useRemoveTeamMember();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "agent" });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTeamMembersQueryKey() });

  const handleInvite = () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast({ variant: "destructive", title: "Missing fields", description: "Name and email are required." });
      return;
    }
    invite.mutate(
      { data: { name: form.name.trim(), email: form.email.trim(), role: form.role } },
      {
        onSuccess: () => { invalidate(); setOpen(false); setForm({ name: "", email: "", role: "agent" }); toast({ title: "Team member invited" }); },
        onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
      }
    );
  };

  const handleRemove = (id: string) => {
    if (!confirm("Remove this team member?")) return;
    remove.mutate({ id }, {
      onSuccess: () => { invalidate(); toast({ title: "Removed" }); },
      onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team</h1>
          <p className="text-muted-foreground mt-1">Manage agents and staff in your agency.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Invite Member
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="h-32 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : !data || data.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No team members yet.</TableCell></TableRow>
              ) : (
                data.map((m) => (
                  <TableRow key={m.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{m.role}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(m.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleRemove(m.id)} title="Remove">
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
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>Add a colleague to your agency.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={invite.isPending}>{invite.isPending ? "Inviting..." : "Invite"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
