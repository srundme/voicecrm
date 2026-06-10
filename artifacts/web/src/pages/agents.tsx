import { useListAgents, useListPhoneNumbers, useSetInboundAgent, useRemoveInboundAgent, useTestCall, getListPhoneNumbersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { formatPhone, formatDuration } from "@/lib/format";
import { Loader2, Bot, Phone, PhoneCall, AlertCircle, X, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const LIVE_STAGES = ["INITIATED", "RINGING", "IN_PROGRESS", "COMPLETED"];
const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "NO_ANSWER", "BUSY", "CANCELLED"];

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
  const [liveCallId, setLiveCallId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [liveCall, setLiveCall] = useState<any>(null);
  const esRef = useRef<EventSource | null>(null);

  const agents = agentsRes?.data || [];
  const phones = phonesRes?.data || [];
  const notConfigured = agentsRes && !agentsRes.success;

  const closeStream = () => { esRef.current?.close(); esRef.current = null; };

  useEffect(() => {
    if (!liveCallId) return;
    const es = new EventSource(`${import.meta.env.BASE_URL}api/live-feed`);
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        if (payload?.type !== "call_update" || !payload.call) return;
        const call = payload.call;
        if (call.id !== liveCallId) return;
        setLiveStatus(call.status);
        setLiveCall(call);
        if (TERMINAL_STATUSES.includes(call.status)) {
          closeStream();
        }
      } catch { /* ignore malformed events */ }
    };
    es.onerror = () => { /* keep retrying; browser auto-reconnects */ };
    return () => { es.close(); };
  }, [liveCallId]);

  const resetModal = () => {
    closeStream();
    setLiveCallId(null);
    setLiveStatus(null);
    setLiveCall(null);
  };

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) resetModal();
  };

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
    resetModal();
    testCall.mutate(
      { data: { agent_id: test.agent_id, phone: test.phone.trim(), name: test.name || undefined } },
      {
        onSuccess: (res: any) => {
          if (res?.success && res?.call_log_id) {
            setLiveCallId(res.call_log_id);
            setLiveStatus("INITIATED");
            toast({ title: "Test call placed" });
          } else {
            toast({ variant: "destructive", title: "Call not started", description: res?.message || res?.error });
          }
        },
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

      <Dialog open={open} onOpenChange={onOpenChange}>
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
              <Input value={test.phone} onChange={(e) => setTest(t => ({ ...t, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))} placeholder="9876543210" />
            </div>
            <div className="space-y-2">
              <Label>Name (optional)</Label>
              <Input value={test.name} onChange={(e) => setTest(t => ({ ...t, name: e.target.value }))} />
            </div>

            {liveCallId && (
              <div className="rounded-md border bg-muted/30 p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live Status</div>
                <div className="flex items-center justify-between gap-1">
                  {LIVE_STAGES.map((stage, i) => {
                    const currentIdx = LIVE_STAGES.indexOf(liveStatus || "INITIATED");
                    const reached = currentIdx >= i;
                    return (
                      <div key={stage} className="flex-1 flex flex-col items-center gap-1">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                          {reached && stage === "COMPLETED" ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                        </div>
                        <span className={`text-[10px] ${reached ? "text-foreground font-medium" : "text-muted-foreground"}`}>{stage.replace(/_/g, " ")}</span>
                      </div>
                    );
                  })}
                </div>
                {liveStatus && !LIVE_STAGES.includes(liveStatus) && (
                  <Badge variant="secondary">{liveStatus.replace(/_/g, " ")}</Badge>
                )}
                {liveCall?.status === "COMPLETED" && (
                  <div className="text-sm space-y-1 pt-1 border-t">
                    <div>Duration: <span className="font-medium">{formatDuration(liveCall.duration_seconds)}</span></div>
                    {liveCall.transcript && <div className="text-xs text-muted-foreground max-h-24 overflow-auto whitespace-pre-wrap">{liveCall.transcript}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button onClick={handleTestCall} disabled={testCall.isPending}>{testCall.isPending ? "Calling..." : liveCallId ? "Call Again" : "Place Call"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
