import { useListPolicies, useCreatePolicy, useDeletePolicy, useCreateFollowUp, getListPoliciesQueryKey, getListFollowUpsQueryKey, InsuranceType, PolicyStatus, PremiumFreq } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Plus, Loader2, Trash2, AlertTriangle, Clock, CalendarCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  LAPSED: "destructive",
  SURRENDERED: "secondary",
  MATURED: "outline",
  CLAIMED: "secondary",
};

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function Policies() {
  const { data, isLoading } = useListPolicies();
  const createPolicy = useCreatePolicy();
  const deletePolicy = useDeletePolicy();
  const createFollowUp = useCreateFollowUp();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "renewals">("all");
  const [form, setForm] = useState({
    lead_id: "",
    policy_number: "",
    insurer_name: "",
    policy_type: InsuranceType.LIFE as InsuranceType,
    sum_assured: "",
    annual_premium: "",
    premium_frequency: PremiumFreq.YEARLY as PremiumFreq,
    status: PolicyStatus.ACTIVE as PolicyStatus,
    renewal_date: "",
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListPoliciesQueryKey() });

  const renewals = useMemo(() => {
    if (!data) return [];
    return data
      .filter((p) => {
        const d = daysUntil(p.renewal_date);
        return d !== null && d >= 0 && d <= 30;
      })
      .sort((a, b) => {
        const da = daysUntil(a.renewal_date) ?? 999;
        const db2 = daysUntil(b.renewal_date) ?? 999;
        return da - db2;
      });
  }, [data]);

  const handleCreate = () => {
    if (!form.lead_id.trim()) {
      toast({ variant: "destructive", title: "Lead ID required", description: "Enter the lead this policy belongs to." });
      return;
    }
    createPolicy.mutate(
      {
        data: {
          lead_id: form.lead_id.trim(),
          policy_number: form.policy_number || undefined,
          insurer_name: form.insurer_name || undefined,
          policy_type: form.policy_type,
          sum_assured: form.sum_assured ? Number(form.sum_assured) : undefined,
          annual_premium: form.annual_premium ? Number(form.annual_premium) : undefined,
          premium_frequency: form.premium_frequency,
          status: form.status,
          renewal_date: form.renewal_date || undefined,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setOpen(false);
          setForm({ ...form, lead_id: "", policy_number: "", insurer_name: "", sum_assured: "", annual_premium: "", renewal_date: "" });
          toast({ title: "Policy created" });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Failed to create policy", description: err.message }),
      }
    );
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this policy?")) return;
    deletePolicy.mutate({ id }, {
      onSuccess: () => { invalidate(); toast({ title: "Policy deleted" }); },
      onError: (err: any) => toast({ variant: "destructive", title: "Failed to delete", description: err.message }),
    });
  };

  const handleCreateReminder = (p: typeof data extends (infer T)[] | undefined ? T : never) => {
    if (!p) return;
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 1);
    scheduledAt.setHours(10, 0, 0, 0);
    createFollowUp.mutate(
      {
        data: {
          lead_id: p.lead_id,
          type: "RENEWAL_REMINDER",
          scheduled_at: scheduledAt.toISOString(),
          notes: `Policy renewal due: ${p.policy_number || p.policy_type}${p.renewal_date ? ` on ${formatDate(p.renewal_date)}` : ""}`,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFollowUpsQueryKey() });
          toast({ title: "Renewal reminder created", description: "Scheduled for tomorrow at 10 AM." });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Failed to create reminder", description: err.message }),
      }
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Policies</h1>
          <p className="text-muted-foreground mt-1">Track issued insurance policies and renewals.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Policy
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b">
        <button
          onClick={() => setTab("all")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "all" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          All Policies
        </button>
        <button
          onClick={() => setTab("renewals")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${tab === "renewals" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Renewals Due
          {renewals.length > 0 && (
            <Badge variant={renewals.some(p => (daysUntil(p.renewal_date) ?? 99) < 7) ? "destructive" : "secondary"} className="text-xs px-1.5 py-0">
              {renewals.length}
            </Badge>
          )}
        </button>
      </div>

      {tab === "all" ? (
        <Card className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                <TableRow>
                  <TableHead>Policy No.</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Insurer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Sum Assured</TableHead>
                  <TableHead>Premium</TableHead>
                  <TableHead>Renewal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="h-32 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : !data || data.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="h-32 text-center text-muted-foreground">No policies yet.</TableCell></TableRow>
                ) : (
                  data.map((p) => (
                    <TableRow key={p.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{p.policy_number || "-"}</TableCell>
                      <TableCell>{p.lead_name || "-"}</TableCell>
                      <TableCell>{p.insurer_name || "-"}</TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize">{p.policy_type.toLowerCase()}</Badge></TableCell>
                      <TableCell>{formatCurrency(p.sum_assured)}</TableCell>
                      <TableCell>{formatCurrency(p.annual_premium)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.renewal_date ? formatDate(p.renewal_date) : "-"}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[p.status] || "secondary"}>{p.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} title="Delete">
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
      ) : (
        <Card className="flex-1 flex flex-col overflow-hidden">
          {renewals.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <CalendarCheck className="w-12 h-12 text-muted/50" />
              <p>No policies renewing in the next 30 days.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Policy No.</TableHead>
                    <TableHead>Insurer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Sum Assured</TableHead>
                    <TableHead>Renewal Date</TableHead>
                    <TableHead>Days Left</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {renewals.map((p) => {
                    const days = daysUntil(p.renewal_date);
                    const urgent = days !== null && days < 7;
                    return (
                      <TableRow key={p.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{p.lead_name || "-"}</TableCell>
                        <TableCell>{p.policy_number || "-"}</TableCell>
                        <TableCell>{p.insurer_name || "-"}</TableCell>
                        <TableCell><Badge variant="secondary" className="capitalize">{p.policy_type.toLowerCase()}</Badge></TableCell>
                        <TableCell>{formatCurrency(p.sum_assured)}</TableCell>
                        <TableCell className="text-sm">{p.renewal_date ? formatDate(p.renewal_date) : "-"}</TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1.5 text-sm font-medium ${urgent ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                            {urgent ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                            {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCreateReminder(p)}
                            disabled={createFollowUp.isPending}
                          >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Create Reminder
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Policy</DialogTitle>
            <DialogDescription>Record an issued policy for a lead.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-2 col-span-2">
              <Label>Lead ID</Label>
              <Input value={form.lead_id} onChange={(e) => setForm(f => ({ ...f, lead_id: e.target.value }))} placeholder="Lead UUID" />
            </div>
            <div className="space-y-2">
              <Label>Policy Number</Label>
              <Input value={form.policy_number} onChange={(e) => setForm(f => ({ ...f, policy_number: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Insurer</Label>
              <Input value={form.insurer_name} onChange={(e) => setForm(f => ({ ...f, insurer_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.policy_type} onValueChange={(v: any) => setForm(f => ({ ...f, policy_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(InsuranceType).map(t => <SelectItem key={t} value={t} className="capitalize">{t.toLowerCase()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v: any) => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(PolicyStatus).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sum Assured (₹)</Label>
              <Input type="number" value={form.sum_assured} onChange={(e) => setForm(f => ({ ...f, sum_assured: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Annual Premium (₹)</Label>
              <Input type="number" value={form.annual_premium} onChange={(e) => setForm(f => ({ ...f, annual_premium: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Premium Frequency</Label>
              <Select value={form.premium_frequency} onValueChange={(v: any) => setForm(f => ({ ...f, premium_frequency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(PremiumFreq).map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, ' ').toLowerCase()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Renewal Date</Label>
              <Input type="date" value={form.renewal_date} onChange={(e) => setForm(f => ({ ...f, renewal_date: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createPolicy.isPending}>{createPolicy.isPending ? "Creating..." : "Create Policy"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
