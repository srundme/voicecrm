import { useGetRecentMetaLeads, useGetImportHistory, useGetWebhookLogs } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatPhone, formatDateTime, formatRelativeTime } from "@/lib/format";
import { Loader2, Megaphone, Upload, Webhook } from "lucide-react";

export default function LeadSources() {
  const { data: metaLeads, isLoading: loadingMeta } = useGetRecentMetaLeads();
  const { data: imports, isLoading: loadingImports } = useGetImportHistory();
  const { data: webhooks, isLoading: loadingWebhooks } = useGetWebhookLogs();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Lead Sources</h1>
        <p className="text-muted-foreground mt-1">Where your leads come from: Meta Ads, imports, and webhooks.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><Megaphone className="w-5 h-5 text-primary" /><CardTitle>Recent Meta Ads Leads</CardTitle></div>
          <CardDescription>Leads captured from Meta (Facebook/Instagram) lead forms.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loadingMeta ? (
            <div className="h-24 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : !metaLeads || metaLeads.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No Meta Ads leads yet.</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Type</TableHead><TableHead>Captured</TableHead></TableRow></TableHeader>
              <TableBody>
                {metaLeads.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.full_name}</TableCell>
                    <TableCell>{formatPhone(l.phone)}</TableCell>
                    <TableCell>{l.insurance_type ? <Badge variant="secondary" className="capitalize">{l.insurance_type.toLowerCase()}</Badge> : "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatRelativeTime(l.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><Upload className="w-5 h-5 text-primary" /><CardTitle>Import History</CardTitle></div>
            <CardDescription>Bulk CSV/Excel lead imports.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loadingImports ? (
              <div className="h-24 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : !imports || imports.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">No imports yet.</div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Imported</TableHead><TableHead>Skipped</TableHead><TableHead>Errors</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
                <TableBody>
                  {imports.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium text-emerald-600">{i.imported}</TableCell>
                      <TableCell className="text-muted-foreground">{i.skipped}</TableCell>
                      <TableCell className="text-destructive">{i.errors ?? 0}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateTime(i.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><Webhook className="w-5 h-5 text-primary" /><CardTitle>Webhook Activity</CardTitle></div>
            <CardDescription>Incoming events from Meta and website forms.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loadingWebhooks ? (
              <div className="h-24 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : !webhooks || webhooks.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">No webhook activity yet.</div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
                <TableBody>
                  {webhooks.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium capitalize">{w.source.replace(/_/g, ' ').toLowerCase()}</TableCell>
                      <TableCell><Badge variant={w.status === "success" ? "default" : "destructive"}>{w.status}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatRelativeTime(w.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
