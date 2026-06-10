import { useListCallLogs, getListCallLogsQueryKey, CallStatus, CallDir } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Link } from "wouter";
import { formatPhone, formatDateTime, formatDuration } from "@/lib/format";
import { Search, Loader2, PlayCircle, RefreshCw } from "lucide-react";

export default function Calls() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CallStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const queryParams = {
    search: search || undefined,
    status: status !== "ALL" ? status as CallStatus : undefined,
    page,
    pageSize,
  };

  const { data, isLoading } = useListCallLogs(queryParams);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Call Logs</h1>
          <p className="text-muted-foreground mt-1">Review AI voice calls, transcripts, and outcomes.</p>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[250px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search calls by lead name or phone..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={status} onValueChange={(v: any) => setStatus(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              {Object.keys(CallStatus).map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Date & Time</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No calls found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((call) => (
                  <TableRow key={call.id} className="group hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">
                      <Link href={call.lead_id ? `/leads/${call.lead_id}` : "#"} className="hover:underline">
                        {call.lead_name || "-"}
                      </Link>
                      <div className="text-xs text-muted-foreground">{formatPhone(call.phone_number)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{call.agent_name || 'Agent'}</span>
                        <Badge variant="outline" className="text-[10px] uppercase">{call.direction}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        call.status === 'COMPLETED' ? 'default' :
                        call.status === 'FAILED' ? 'destructive' : 'secondary'
                      }>
                        {call.status}
                      </Badge>
                      {call.disposition && (
                        <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: call.disposition.color }}></span>
                          {call.disposition.label}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDuration(call.duration_seconds)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(call.started_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {call.recording_url && (
                          <Button variant="ghost" size="icon" title="Listen to recording">
                            <PlayCircle className="w-4 h-4 text-primary" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" title="View details">
                          <Link href={`/calls/${call.id}`}>
                            <Search className="w-4 h-4 text-muted-foreground" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {data && (
          <div className="p-4 border-t flex items-center justify-between text-sm text-muted-foreground">
            <div>
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data.total)} of {data.total} calls
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={page * pageSize >= data.total}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
