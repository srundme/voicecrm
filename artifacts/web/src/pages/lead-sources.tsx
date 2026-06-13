import { useGetRecentMetaLeads, useGetImportHistory, useGetWebhookLogs, useGetApiConfig, useBulkImportLeads, getGetImportHistoryQueryKey, type BulkImportRow, type BulkImportResult } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPhone, formatDateTime, formatRelativeTime } from "@/lib/format";
import { Loader2, Megaphone, Upload, Webhook, Code, Check, Copy } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const LEAD_FIELDS: { key: keyof BulkImportRow; label: string }[] = [
  { key: "full_name", label: "Full name" },
  { key: "phone", label: "Phone" },
  { key: "gender", label: "Gender" },
  { key: "dob", label: "Date of birth" },
  { key: "email", label: "Email" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "pincode", label: "Pincode" },
  { key: "insurance_type", label: "Insurance type" },
  { key: "notes", label: "Notes" },
];

const NONE = "__none__";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }
  return rows;
}

function autoMap(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const { key } of LEAD_FIELDS) {
    const match = headers.find((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_") === key);
    if (match) mapping[key] = match;
  }
  return mapping;
}

function CsvImportDialog() {
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const bulkImport = useBulkImportLeads();

  const reset = () => {
    setHeaders([]); setDataRows([]); setMapping({}); setResult(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setResult(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      toast({ title: "CSV needs a header row and at least one data row", variant: "destructive" });
      return;
    }
    const hdrs = parsed[0].map((h) => h.trim());
    setHeaders(hdrs);
    setDataRows(parsed.slice(1));
    setMapping(autoMap(hdrs));
  };

  const buildRows = (): BulkImportRow[] =>
    dataRows.map((cells) => {
      const r: BulkImportRow = {};
      for (const { key } of LEAD_FIELDS) {
        const header = mapping[key];
        if (!header) continue;
        const idx = headers.indexOf(header);
        if (idx >= 0) {
          const val = cells[idx]?.trim();
          if (val) r[key] = val;
        }
      }
      return r;
    });

  const submit = () => {
    if (!mapping.phone) {
      toast({ title: "Map the Phone column before importing", variant: "destructive" });
      return;
    }
    bulkImport.mutate(
      { data: { rows: buildRows() } },
      {
        onSuccess: (res) => {
          setResult(res);
          toast({ title: `Imported ${res.imported} leads` });
          queryClient.invalidateQueries({ queryKey: getGetImportHistoryQueryKey() });
        },
        onError: () => toast({ title: "Import failed", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Upload className="w-4 h-4 mr-2" />
        Import CSV
      </Button>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Leads from CSV</DialogTitle>
          <DialogDescription>Upload a CSV, map columns to lead fields, and import.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>CSV file</Label>
          <Input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>

        {headers.length > 0 && (
          <>
            <div className="space-y-3">
              <p className="text-sm font-medium">Column mapping</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {LEAD_FIELDS.map(({ key, label }) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{label}{key === "phone" ? " (required)" : ""}</Label>
                    <Select
                      value={mapping[key] ?? NONE}
                      onValueChange={(v) => setMapping((m) => ({ ...m, [key]: v === NONE ? "" : v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Not mapped" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Not mapped</SelectItem>
                        {headers.map((h, i) => (
                          <SelectItem key={`${h}-${i}`} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Preview ({dataRows.length} rows)</p>
              <div className="overflow-x-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {LEAD_FIELDS.filter(({ key }) => mapping[key]).map(({ key, label }) => (
                        <TableHead key={key}>{label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {buildRows().slice(0, 5).map((r, i) => (
                      <TableRow key={i}>
                        {LEAD_FIELDS.filter(({ key }) => mapping[key]).map(({ key }) => (
                          <TableCell key={key} className="text-sm">{r[key] ?? "-"}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}

        {result && (
          <div className="text-sm rounded-md border p-3 space-y-1">
            <div className="text-emerald-600 font-medium">{result.imported} imported</div>
            <div className="text-muted-foreground">{result.skipped_duplicates} duplicates skipped, {result.skipped_invalid} invalid skipped</div>
            {result.errors.length > 0 && <div className="text-destructive">{result.errors.length} errors</div>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Close</Button>
          <Button onClick={submit} disabled={headers.length === 0 || bulkImport.isPending}>
            {bulkImport.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WebsiteEmbedCard() {
  const { data: config, isLoading } = useGetApiConfig();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const endpoint = config?.website_form_webhook_url ?? "";

  const snippet = `<!-- VoiceCRM website lead form -->
<form id="voicecrm-lead-form">
  <input name="full_name" placeholder="Full name" required />
  <input name="phone" placeholder="Mobile number" required />
  <input name="email" placeholder="Email" />
  <input name="city" placeholder="City" />
  <input name="insurance_type" placeholder="Insurance type" />
  <button type="submit">Get a call back</button>
</form>
<script>
  document.getElementById("voicecrm-lead-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    await fetch("${endpoint}", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    e.target.reset();
    alert("Thanks! We'll call you shortly.");
  });
</script>`;

  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast({ title: "Embed code copied" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Code className="w-5 h-5 text-primary" /><CardTitle>Website Embed</CardTitle></div>
          <Button size="sm" variant="outline" onClick={copy} disabled={isLoading || !config}>
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? "Copied" : "Copy code"}
          </Button>
        </div>
        <CardDescription>Paste this snippet into your website to capture leads directly into VoiceCRM.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-24 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <pre className="text-xs bg-muted rounded-md p-4 overflow-x-auto"><code>{snippet}</code></pre>
        )}
      </CardContent>
    </Card>
  );
}

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

      <WebsiteEmbedCard />

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
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Upload className="w-5 h-5 text-primary" /><CardTitle>Import History</CardTitle></div>
              <CsvImportDialog />
            </div>
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
                <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
                <TableBody>
                  {webhooks.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium capitalize">{w.source.replace(/_/g, ' ').toLowerCase()}</TableCell>
                      <TableCell>
                        <Badge
                          variant={w.status === "SUCCESS" ? "default" : "secondary"}
                          className={
                            w.status === "SUCCESS"
                              ? "bg-green-600 text-white hover:bg-green-700"
                              : w.status === "SKIPPED"
                              ? "bg-yellow-500 text-white hover:bg-yellow-600"
                              : "bg-red-500 text-white hover:bg-red-600"
                          }
                        >{w.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{(w as any).message ?? "—"}</TableCell>
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
