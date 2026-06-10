import { useListAgents, useListPhoneNumbers, useSetInboundAgent, useRemoveInboundAgent, useTestCall, getListPhoneNumbersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { formatPhone } from "@/lib/format";
import { Loader2, Bot, Phone, PhoneCall, AlertCircle, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Agents() {
  const { data: agentsRes, isLoading: loadingAgents } = useListAgents();
  const { data: phonesRes, isLoading: loadingPhones } = useListPhoneNumbers();
  const setInbound = useSetInboundAgent();
  const removeInbound = useRemoveInboundAgent();
  const testCall = useTestCall();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [test, setTest] = useState({ agent_id: "", phone: "", name: "" });

  const agents = agentsRes?.data || [];
  const phones = phonesRes?.data || [];
  const notConfigured = agentsRes && !agentsRes.success;

  const invalidatePhones = () => queryClient.invalidateQueries({ queryKey: getListPhoneNumbersQueryKey() });

  const handleAssign = (phoneId: string, agentId: string) => {
    if (agentId === "__none__") {
      removeInbound.mutate({ id: phoneId }, {
        onSuccess: () => { invalidatePhones(); toast({ title: "Agent unassigned" }); },
        onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
      });
      return;
    }
    setInbound.mutate({ id: phoneId, data: { agent_id: agentId } }, {
      onSuccess: () => { invalidatePhones(); toast({ title: "Inbound agent set" }); },
      onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
    });
  };

  const handleTestCall = () => {
    if (!test.agent_id || !test.phone.trim()) {
      toast({ variant: "destructive", title: "Missing fields", description: "Agent and phone are required." });
      return;
    }
    testCall.mutate(
      { data: { agent_id: test.agent_id, phone: test.phone.trim(), name: test.name || undefined } },
      {
        onSuccess: (res: any) => { setOpen(false); toast({ title: res?.success ? "Test call placed" : "Call not started", description: res?.message || res?.error }); },
        onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
      }
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Agents</h1>
          <p className="text-muted-foreground mt-1">Your Bolna voice agents and phone numbers.</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={notConfigured || agents.length === 0}>
          <PhoneCall className="w-4 h-4 mr-2" />
          Test Call
        </Button>
      </div>

      {notConfigured && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4 flex items-center gap-3 text-amber-800">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{agentsRes?.error || "Bolna is not connected. Add your Bolna API key in Settings."}</span>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><Bot className="w-5 h-5 text-primary" /> Voice Agents</h2>
        {loadingAgents ? (
          <div className="h-24 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : agents.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No agents found.</CardContent></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((a) => (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle className="text-base">{a.name}</CardTitle>
                  <CardDescription className="font-mono text-xs">{a.id}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {a.tags && a.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">{a.tags.map(t => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}</div>
                  )}
                  <div className="text-sm text-muted-foreground">Calls today: <span className="font-medium text-foreground">{a.calls_today ?? 0}</span></div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><Phone className="w-5 h-5 text-primary" /> Phone Numbers</h2>
        {loadingPhones ? (
          <div className="h-24 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : phones.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No phone numbers found.</CardContent></Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {phones.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <div className="font-medium">{formatPhone(p.phone_number)}</div>
                    <div className="text-xs text-muted-foreground">Inbound agent: {p.agent_name || "Not assigned"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={p.agent_id || "__none__"} onValueChange={(v) => handleAssign(p.id, v)}>
                      <SelectTrigger className="w-[200px]"><SelectValue placeholder="Assign agent" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No agent</SelectItem>
                        {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {p.agent_id && (
                      <Button variant="ghost" size="icon" onClick={() => handleAssign(p.id, "__none__")} title="Unassign">
                        <X className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Place a Test Call</DialogTitle>
            <DialogDescription>Trigger an outbound call from a Bolna agent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Agent</Label>
              <Select value={test.agent_id} onValueChange={(v) => setTest(t => ({ ...t, agent_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                <SelectContent>{agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Phone (10 digits)</Label>
              <Input value={test.phone} onChange={(e) => setTest(t => ({ ...t, phone: e.target.value }))} placeholder="9876543210" />
            </div>
            <div className="space-y-2">
              <Label>Name (optional)</Label>
              <Input value={test.name} onChange={(e) => setTest(t => ({ ...t, name: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleTestCall} disabled={testCall.isPending}>{testCall.isPending ? "Calling..." : "Place Call"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
