import { useListLeads, useCreateLead, getListLeadsQueryKey, LeadStage, LeadSource, InsuranceType, Gender, type LeadInput } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { Link } from "wouter";
import { formatPhone, formatDate } from "@/lib/format";
import { Search, Plus, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR_RE = /^\d{12}$/;
const PINCODE_RE = /^[1-9]\d{5}$/;
const PHONE_RE = /^[6-9]\d{9}$/;

function NewLeadDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LeadInput>({ full_name: "", phone: "" });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createLead = useCreateLead();

  const update = (patch: Partial<LeadInput>) => setForm((f) => ({ ...f, ...patch }));

  const phoneError = form.phone.length > 0 && !PHONE_RE.test(form.phone) ? "Enter a valid 10-digit mobile (starts 6-9)" : "";
  const panError = form.pan_number && !PAN_RE.test(form.pan_number) ? "Invalid PAN (e.g. ABCDE1234F)" : "";
  const aadhaarError = form.aadhaar_number && !AADHAAR_RE.test(form.aadhaar_number) ? "Aadhaar must be 12 digits" : "";
  const pincodeError = form.pincode && !PINCODE_RE.test(form.pincode) ? "Pincode must be 6 digits" : "";

  const submit = () => {
    if (!form.full_name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (!PHONE_RE.test(form.phone)) {
      toast({ title: "Enter a valid 10-digit mobile number", variant: "destructive" });
      return;
    }
    if (panError || aadhaarError || pincodeError) {
      toast({ title: "Fix the highlighted fields", variant: "destructive" });
      return;
    }
    createLead.mutate(
      { data: { ...form, source: form.source ?? "MANUAL" } },
      {
        onSuccess: () => {
          toast({ title: "Lead created" });
          queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
          setForm({ full_name: "", phone: "" });
          setOpen(false);
        },
        onError: () => toast({ title: "Could not create lead", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-2" />
        New Lead
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Lead</DialogTitle>
          <DialogDescription>Add a lead manually to your CRM.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Full name</Label>
            <Input value={form.full_name} onChange={(e) => update({ full_name: e.target.value })} placeholder="Priya Sharma" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone (10 digits)</Label>
            <Input value={form.phone} onChange={(e) => update({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="9876543210" className={phoneError ? "border-destructive" : ""} />
            {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={form.email ?? ""} onChange={(e) => update({ email: e.target.value || undefined })} placeholder="optional" />
          </div>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input value={form.city ?? ""} onChange={(e) => update({ city: e.target.value || undefined })} placeholder="optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Pincode</Label>
            <Input value={form.pincode ?? ""} onChange={(e) => update({ pincode: e.target.value.replace(/\D/g, "").slice(0, 6) || undefined })} placeholder="560001" className={pincodeError ? "border-destructive" : ""} />
            {pincodeError && <p className="text-xs text-destructive">{pincodeError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>PAN</Label>
            <Input value={form.pan_number ?? ""} onChange={(e) => update({ pan_number: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || undefined })} placeholder="ABCDE1234F" className={panError ? "border-destructive" : ""} />
            {panError && <p className="text-xs text-destructive">{panError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Aadhaar</Label>
            <Input value={form.aadhaar_number ?? ""} onChange={(e) => update({ aadhaar_number: e.target.value.replace(/\D/g, "").slice(0, 12) || undefined })} placeholder="123412341234" className={aadhaarError ? "border-destructive" : ""} />
            {aadhaarError && <p className="text-xs text-destructive">{aadhaarError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <Select value={form.gender ?? ""} onValueChange={(v) => update({ gender: v as Gender })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {Object.keys(Gender).map((g) => (
                  <SelectItem key={g} value={g} className="capitalize">{g.toLowerCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Insurance type</Label>
            <Select value={form.insurance_type ?? ""} onValueChange={(v) => update({ insurance_type: v as InsuranceType })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {Object.keys(InsuranceType).map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t.toLowerCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Select value={form.source ?? "MANUAL"} onValueChange={(v) => update({ source: v as LeadSource })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(LeadSource).map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ").toLowerCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={createLead.isPending}>
            {createLead.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Leads() {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<LeadStage | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const queryParams = {
    search: search || undefined,
    stage: stage !== "ALL" ? stage as LeadStage : undefined,
    page,
    pageSize,
  };

  const { data, isLoading } = useListLeads(queryParams);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground mt-1">Manage and track your insurance leads.</p>
        </div>
        <NewLeadDialog />
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[250px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name, phone, or email..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={stage} onValueChange={(v: any) => setStage(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Stages</SelectItem>
              {Object.keys(LeadStage).map(s => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Insurance Type</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Created</TableHead>
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
                    No leads found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((lead) => (
                  <TableRow key={lead.id} className="group cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium">
                      <Link href={`/leads/${lead.id}`} className="block w-full">
                        {lead.full_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/leads/${lead.id}`} className="block w-full">
                        <div>{formatPhone(lead.phone)}</div>
                        <div className="text-xs text-muted-foreground">{lead.email || "-"}</div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {lead.stage.replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {lead.insurance_type ? (
                        <Badge variant="secondary" className="capitalize">
                          {lead.insurance_type.toLowerCase()}
                        </Badge>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-sm capitalize text-muted-foreground">
                      {lead.source.replace(/_/g, ' ').toLowerCase()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(lead.created_at)}
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
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data.total)} of {data.total} leads
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
