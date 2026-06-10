import { useRoute, Link } from "wouter";
import { useGetCallLog, useRetryCall, useUpdateCallLogDisposition, useListDispositions, getGetCallLogQueryKey, getListDispositionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatPhone, formatDateTime, formatDuration } from "@/lib/format";
import { PhoneCall, RefreshCw, AlertTriangle, ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  COMPLETED: "default",
  FAILED: "destructive",
};

export default function CallDetail() {
  const [, params] = useRoute("/calls/:id");
  const id = params?.id || "";
  const { data: call, isLoading } = useGetCallLog(id, { query: { enabled: !!id, queryKey: getGetCallLogQueryKey(id) } });
  const retryCall = useRetryCall();
  const updateDisposition = useUpdateCallLogDisposition();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const dispositionParams = call?.bolna_agent_id ? { agentId: call.bolna_agent_id } : undefined;
  const { data: dispositions } = useListDispositions(
    dispositionParams,
    { query: { enabled: !!call?.bolna_agent_id, queryKey: getListDispositionsQueryKey(dispositionParams) } }
  );

  const refetch = () => queryClient.invalidateQueries({ queryKey: getGetCallLogQueryKey(id) });

  const handleRetry = () => {
    retryCall.mutate({ id }, {
      onSuccess: (res: any) => { refetch(); toast({ title: res?.success ? "Retry call placed" : "Retry not started", description: res?.message || res?.error }); },
      onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
    });
  };

  const handleDisposition = (dispositionId: string) => {
    updateDisposition.mutate({ id, data: { disposition_id: dispositionId } }, {
      onSuccess: () => { refetch(); toast({ title: "Disposition updated" }); },
      onError: (err: any) => toast({ variant: "destructive", title: "Failed", description: err.message }),
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!call) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center py-12">
        <h1 className="text-2xl font-bold text-muted-foreground">Call not found</h1>
        <Link href="/calls" className="text-primary hover:underline mt-2 inline-block">Back to call logs</Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <Link href="/calls" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to call logs
      </Link>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            {call.lead_id ? <Link href={`/leads/${call.lead_id}`} className="hover:underline">{call.lead_name || "Call"}</Link> : (call.lead_name || "Call")}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant={STATUS_VARIANT[call.status] || "secondary"}>{call.status}</Badge>
            <Badge variant="outline" className="uppercase text-[10px]">{call.direction}</Badge>
            <span className="text-muted-foreground text-sm">{formatPhone(call.phone_number)}</span>
          </div>
        </div>
        <Button variant="outline" onClick={handleRetry} disabled={retryCall.isPending}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {retryCall.isPending ? "Retrying..." : "Retry Call"}
        </Button>
      </div>

      {call.drop_detected && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4 flex items-center gap-3 text-amber-800">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>Call drop detected{call.drop_reason ? `: ${call.drop_reason}` : ""}.</span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{call.summary || "No summary available."}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Transcript</CardTitle></CardHeader>
            <CardContent>
              {call.transcript ? (
                <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{call.transcript}</pre>
              ) : (
                <p className="text-sm text-muted-foreground">No transcript available.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Agent</span><span className="font-medium">{call.agent_name || "-"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Started</span><span className="font-medium">{formatDateTime(call.started_at)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Ended</span><span className="font-medium">{call.ended_at ? formatDateTime(call.ended_at) : "-"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-medium">{formatDuration(call.duration_seconds)}</span></div>
            </CardContent>
          </Card>

          {call.recording_url && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><PhoneCall className="w-4 h-4" /> Recording</CardTitle></CardHeader>
              <CardContent>
                <audio controls src={call.recording_url} className="w-full" />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Disposition</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {call.disposition && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: call.disposition.color }} />
                  {call.disposition.label}
                </div>
              )}
              <Select value={call.disposition_id || ""} onValueChange={handleDisposition} disabled={!dispositions || dispositions.length === 0}>
                <SelectTrigger><SelectValue placeholder={dispositions && dispositions.length > 0 ? "Set disposition" : "No dispositions configured"} /></SelectTrigger>
                <SelectContent>
                  {(dispositions || []).map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {(call.retry_of_call_id || call.retry_call_id) && (
            <Card>
              <CardHeader><CardTitle>Linked Calls</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {call.retry_of_call_id && <Link href={`/calls/${call.retry_of_call_id}`} className="text-primary hover:underline block">Original call</Link>}
                {call.retry_call_id && <Link href={`/calls/${call.retry_call_id}`} className="text-primary hover:underline block">Retry call</Link>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
