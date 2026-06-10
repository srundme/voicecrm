import { useRoute } from "wouter";
import { useGetLead, useGetLeadTimeline, getGetLeadQueryKey, getGetLeadTimelineQueryKey, getListAgentsQueryKey, useUpdateLead, useTriggerLeadCall, useListAgents, LeadStage, type LeadDetail as LeadDetailType, type LeadUpdate } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPhone, formatDate, formatCurrency } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Mail, MapPin, Building, Calendar, PhoneCall, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function TriggerCallDialog({ lead }: { lead: LeadDetailType }) {
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: agents, isLoading: loadingAgents } = useListAgents({ query: { enabled: open, queryKey: getListAgentsQueryKey() } });
  const triggerCall = useTriggerLeadCall();

  const submit = () => {
    if (!agentId) {
      toast({ title: "Select an agent", variant: "destructive" });
      return;
    }
    triggerCall.mutate(
      { id: lead.id, data: { agent_id: agentId } },
      {
        onSuccess: (res) => {
          if (res.success) {
            toast({ title: "Call triggered" });
            queryClient.invalidateQueries({ queryKey: getGetLeadTimelineQueryKey(lead.id) });
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
      <Button variant="default" onClick={() => setOpen(true)}>
        <PhoneCall className="w-4 h-4 mr-2" />
        Trigger Call
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trigger AI Voice Call</DialogTitle>
          <DialogDescription>Call {lead.full_name} at {formatPhone(lead.phone)} using a Bolna voice agent.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Voice Agent</Label>
          <Select value={agentId} onValueChange={setAgentId} disabled={loadingAgents}>
            <SelectTrigger><SelectValue placeholder={loadingAgents ? "Loading agents..." : "Select an agent"} /></SelectTrigger>
            <SelectContent>
              {agents?.data?.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {agents && agents.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No agents found. Add your Bolna API key in Settings.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={triggerCall.isPending}>
            {triggerCall.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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
      full_name: lead.full_name,
      phone: lead.phone,
      email: lead.email ?? undefined,
      city: lead.city ?? undefined,
      state: lead.state ?? undefined,
      occupation: lead.occupation ?? undefined,
      stage: lead.stage,
      notes: lead.notes ?? undefined,
      premium_budget: lead.premium_budget ?? undefined,
    });
    setOpen(true);
  };

  const update = (patch: Partial<LeadUpdate>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    if (form.phone !== undefined && !/^[6-9]\d{9}$/.test(form.phone)) {
      toast({ title: "Enter a valid 10-digit mobile number", variant: "destructive" });
      return;
    }
    updateLead.mutate(
      { id: lead.id, data: form },
      {
        onSuccess: () => {
          toast({ title: "Lead updated" });
          queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(lead.id) });
          setOpen(false);
        },
        onError: () => toast({ title: "Could not update lead", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={openDialog}>Edit</Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Lead</DialogTitle>
          <DialogDescription>Update this lead's details.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Full name</Label>
            <Input value={form.full_name ?? ""} onChange={(e) => update({ full_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone (10 digits)</Label>
            <Input value={form.phone ?? ""} onChange={(e) => update({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={form.email ?? ""} onChange={(e) => update({ email: e.target.value || null })} />
          </div>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input value={form.city ?? ""} onChange={(e) => update({ city: e.target.value || null })} />
          </div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <Input value={form.state ?? ""} onChange={(e) => update({ state: e.target.value || null })} />
          </div>
          <div className="space-y-1.5">
            <Label>Stage</Label>
            <Select value={form.stage ?? ""} onValueChange={(v) => update({ stage: v as LeadStage })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {Object.keys(LeadStage).map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ").toLowerCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Premium budget (₹)</Label>
            <Input type="number" value={form.premium_budget ?? ""} onChange={(e) => update({ premium_budget: e.target.value ? Math.round(Number(e.target.value)) : null })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => update({ notes: e.target.value || null })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={updateLead.isPending}>
            {updateLead.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
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
  const { data: timeline, isLoading: loadingTimeline } = useGetLeadTimeline(id, { query: { enabled: !!id, queryKey: getGetLeadTimelineQueryKey(id) } });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64 md:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto text-center py-12">
        <h1 className="text-2xl font-bold text-muted-foreground">Lead not found</h1>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{lead.full_name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant="outline" className="capitalize">{lead.stage.replace(/_/g, ' ')}</Badge>
            <span className="text-muted-foreground text-sm">Source: {lead.source.replace(/_/g, ' ').toLowerCase()}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <TriggerCallDialog lead={lead} />
          <EditLeadDialog lead={lead} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Profile Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</span>
                <div className="font-medium">{formatPhone(lead.phone)}</div>
              </div>
              {lead.email && (
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" /> Email</span>
                  <div className="font-medium">{lead.email}</div>
                </div>
              )}
              {lead.dob && (
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Date of Birth</span>
                  <div className="font-medium">{formatDate(lead.dob)} {lead.age ? `(${lead.age} yrs)` : ''}</div>
                </div>
              )}
              {lead.city && (
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Location</span>
                  <div className="font-medium">{lead.city}{lead.state ? `, ${lead.state}` : ''}</div>
                </div>
              )}
              {lead.occupation && (
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground flex items-center gap-1"><Building className="w-3 h-3" /> Occupation</span>
                  <div className="font-medium">{lead.occupation} {lead.employer_name ? `at ${lead.employer_name}` : ''}</div>
                </div>
              )}
              {lead.annual_income && (
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">Annual Income</span>
                  <div className="font-medium">{formatCurrency(lead.annual_income)}</div>
                </div>
              )}
              <div className="space-y-1 sm:col-span-2">
                <span className="text-sm text-muted-foreground">Notes</span>
                <div className="text-sm">{lead.notes || "-"}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingTimeline ? (
                <Skeleton className="h-32" />
              ) : timeline && timeline.length > 0 ? (
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                  {timeline.map((event, i) => (
                    <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 group-[.is-active]:bg-primary text-slate-500 group-[.is-active]:text-primary-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                        {event.kind === 'call' ? <PhoneCall className="w-4 h-4" /> : 
                         event.kind === 'note' ? <Mail className="w-4 h-4" /> : 
                         <History className="w-4 h-4" />}
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-border shadow-sm bg-card">
                        <div className="flex items-center justify-between space-x-2 mb-1">
                          <div className="font-bold text-slate-900 dark:text-slate-100">{event.title}</div>
                          <time className="font-caveat font-medium text-indigo-500">{formatDate(event.timestamp)}</time>
                        </div>
                        <div className="text-slate-500 text-sm">{event.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No activity recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Insurance Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Insurance Type</span>
                <div className="font-medium capitalize">{lead.insurance_type?.toLowerCase() || "-"}</div>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Premium Budget</span>
                <div className="font-medium">{formatCurrency(lead.premium_budget)}</div>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Sum Assured Interest</span>
                <div className="font-medium">{formatCurrency(lead.sum_assured_interest)}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
