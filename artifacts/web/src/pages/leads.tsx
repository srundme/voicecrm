import {
  useListLeads,
  useCreateLead,
  getListLeadsQueryKey,
  LeadStage,
  LeadSource,
  InsuranceType,
  Gender,
  type LeadInput,
  type Lead,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState, useMemo, useRef } from "react";
import { Link } from "wouter";
import { formatPhone, formatDate } from "@/lib/format";
import {
  Search,
  Plus,
  Loader2,
  Phone,
  Eye,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Upload,
  ShieldX,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR_RE = /^\d{12}$/;
const PINCODE_RE = /^[1-9]\d{5}$/;
const PHONE_RE = /^[6-9]\d{9}$/;

const STAGE_META: Record<string, { label: string; color: string }> = {
  NEW:           { label: "New",           color: "#6366f1" },
  CONTACTED:     { label: "Contacted",     color: "#0ea5e9" },
  INTERESTED:    { label: "Interested",    color: "#10b981" },
  DOCS_PENDING:  { label: "Docs Pending",  color: "#f59e0b" },
  POLICY_ISSUED: { label: "Policy Issued", color: "#22c55e" },
  RENEWAL_DUE:   { label: "Renewal Due",   color: "#f97316" },
  LOST:          { label: "Lost",          color: "#ef4444" },
  INACTIVE:      { label: "Inactive",      color: "#94a3b8" },
};

const INS_COLORS: Record<string, string> = {
  LIFE: "#6366f1", HEALTH: "#0ea5e9", MOTOR: "#10b981",
  TERM: "#8b5cf6", ULIP: "#f59e0b", ENDOWMENT: "#ec4899",
  ACCIDENT: "#ef4444", TRAVEL: "#14b8a6",
};

function StagePill({ stage }: { stage: string }) {
  const meta = STAGE_META[stage] ?? { label: stage, color: "#94a3b8" };
  return (
    <span
      style={{ color: meta.color, borderColor: meta.color + "40", backgroundColor: meta.color + "12" }}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap"
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

function InsPill({ type }: { type: string }) {
  const color = INS_COLORS[type] ?? "#94a3b8";
  return (
    <span
      style={{ color, backgroundColor: color + "15" }}
      className="inline-block px-1.5 py-0.5 rounded text-[11px] font-medium"
    >
      {type.charAt(0) + type.slice(1).toLowerCase()}
    </span>
  );
}

type SortKey = "full_name" | "stage" | "insurance_type" | "source" | "created_at";
type SortDir = "asc" | "desc";

function SortIcon({ col, sort }: { col: SortKey; sort: { key: SortKey; dir: SortDir } | null }) {
  if (!sort || sort.key !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
  return sort.dir === "asc"
    ? <ArrowUp className="w-3 h-3 text-primary" />
    : <ArrowDown className="w-3 h-3 text-primary" />;
}

function CsvImportButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { toast({ title: "CSV must have a header row + data", variant: "destructive" }); return; }
      const headers = lines[0]!.split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, "_"));
      const idx = (name: string) => headers.indexOf(name);
      const rows = lines.slice(1).map((line) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const get = (name: string) => cols[idx(name)]?.trim() || undefined;
        return {
          full_name: get("full_name") ?? get("name") ?? cols[0] ?? "",
          phone: get("phone") ?? get("mobile") ?? cols[1] ?? "",
          email: get("email"),
          city: get("city"),
          state: get("state"),
          gender: get("gender"),
          insurance_type: get("insurance_type"),
          notes: get("notes"),
        };
      }).filter((r) => r.full_name && r.phone);

      if (rows.length === 0) { toast({ title: "No valid rows found", variant: "destructive" }); return; }

      const res = await fetch("/api/leads/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, trigger_calls: false }),
      });
      const data = await res.json();
      toast({ title: `Imported ${data.imported} leads`, description: data.skipped_duplicates > 0 ? `${data.skipped_duplicates} duplicates skipped` : undefined });
      queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
    } catch {
      toast({ title: "Import failed", variant: "destructive" });
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => fileRef.current?.click()} disabled={loading}>
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        Import CSV
      </Button>
    </>
  );
}

function NewLeadDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LeadInput>({ full_name: "", phone: "" });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createLead = useCreateLead();

  const update = (patch: Partial<LeadInput>) => setForm((f) => ({ ...f, ...patch }));

  const phoneError = form.phone.length > 0 && !PHONE_RE.test(form.phone) ? "Valid 10-digit mobile (starts 6-9)" : "";
  const panError = form.pan_number && !PAN_RE.test(form.pan_number) ? "Invalid PAN" : "";
  const aadhaarError = form.aadhaar_number && !AADHAAR_RE.test(form.aadhaar_number) ? "12 digits required" : "";
  const pincodeError = form.pincode && !PINCODE_RE.test(form.pincode) ? "6 digits required" : "";

  const submit = () => {
    if (!form.full_name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    if (!PHONE_RE.test(form.phone)) { toast({ title: "Valid 10-digit mobile required", variant: "destructive" }); return; }
    if (panError || aadhaarError || pincodeError) { toast({ title: "Fix highlighted fields", variant: "destructive" }); return; }
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
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5 h-8">
        <Plus className="w-3.5 h-3.5" />
        New Lead
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Lead</DialogTitle>
          <DialogDescription>Manually add a lead to your CRM.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Full Name *</Label>
            <Input value={form.full_name} onChange={(e) => update({ full_name: e.target.value })} placeholder="Priya Sharma" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone *</Label>
            <Input value={form.phone} onChange={(e) => update({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="9876543210" className={`h-8 text-sm ${phoneError ? "border-destructive" : ""}`} />
            {phoneError && <p className="text-[10px] text-destructive">{phoneError}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input value={form.email ?? ""} onChange={(e) => update({ email: e.target.value || undefined })} placeholder="optional" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">City</Label>
            <Input value={form.city ?? ""} onChange={(e) => update({ city: e.target.value || undefined })} placeholder="Mumbai" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pincode</Label>
            <Input value={form.pincode ?? ""} onChange={(e) => update({ pincode: e.target.value.replace(/\D/g, "").slice(0, 6) || undefined })} placeholder="560001" className={`h-8 text-sm ${pincodeError ? "border-destructive" : ""}`} />
            {pincodeError && <p className="text-[10px] text-destructive">{pincodeError}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">PAN</Label>
            <Input value={form.pan_number ?? ""} onChange={(e) => update({ pan_number: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || undefined })} placeholder="ABCDE1234F" className={`h-8 text-sm ${panError ? "border-destructive" : ""}`} />
            {panError && <p className="text-[10px] text-destructive">{panError}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Aadhaar</Label>
            <Input value={form.aadhaar_number ?? ""} onChange={(e) => update({ aadhaar_number: e.target.value.replace(/\D/g, "").slice(0, 12) || undefined })} placeholder="123412341234" className={`h-8 text-sm ${aadhaarError ? "border-destructive" : ""}`} />
            {aadhaarError && <p className="text-[10px] text-destructive">{aadhaarError}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Gender</Label>
            <Select value={form.gender ?? ""} onValueChange={(v) => update({ gender: v as Gender })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {Object.keys(Gender).map((g) => <SelectItem key={g} value={g} className="text-sm capitalize">{g.toLowerCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Insurance Type</Label>
            <Select value={form.insurance_type ?? ""} onValueChange={(v) => update({ insurance_type: v as InsuranceType })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {Object.keys(InsuranceType).map((t) => <SelectItem key={t} value={t} className="text-sm capitalize">{t.toLowerCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Source</Label>
            <Select value={form.source ?? "MANUAL"} onValueChange={(v) => update({ source: v as LeadSource })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(LeadSource).map((s) => <SelectItem key={s} value={s} className="text-sm capitalize">{s.replace(/_/g, " ").toLowerCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={createLead.isPending}>
            {createLead.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Create Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const COLUMNS: { key: SortKey | null; label: string; width: string }[] = [
  { key: null,            label: "#",             width: "w-10"  },
  { key: "full_name",     label: "Name",          width: "w-44"  },
  { key: null,            label: "Phone",         width: "w-32"  },
  { key: null,            label: "Email",         width: "w-44"  },
  { key: null,            label: "City",          width: "w-28"  },
  { key: "stage",         label: "Stage",         width: "w-36"  },
  { key: "insurance_type",label: "Insurance",     width: "w-24"  },
  { key: "source",        label: "Source",        width: "w-28"  },
  { key: "created_at",    label: "Created",       width: "w-28"  },
  { key: null,            label: "Actions",       width: "w-20"  },
];

export default function Leads() {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<LeadStage | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pageSize = 25;

  const { data, isLoading } = useListLeads({
    search: search || undefined,
    stage: stage !== "ALL" ? (stage as LeadStage) : undefined,
    page,
    pageSize,
  });

  const rows: Lead[] = useMemo(() => {
    const list = data?.data ?? [];
    if (!sort) return list;
    return [...list].sort((a, b) => {
      const av = String((a as any)[sort.key] ?? "");
      const bv = String((b as any)[sort.key] ?? "");
      return sort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [data, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      !prev || prev.key !== key
        ? { key, dir: "asc" }
        : prev.dir === "asc"
        ? { key, dir: "desc" }
        : null,
    );
  };

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  };
  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;
  const fromRow = (page - 1) * pageSize + 1;
  const toRow = Math.min(page * pageSize, data?.total ?? 0);

  return (
    <div className="flex flex-col h-screen bg-[hsl(230,40%,96%)]">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-5 py-3 flex items-center justify-between gap-3 border-b border-border/60 bg-white/70 backdrop-blur-sm">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-tight">Leads</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {data ? `${data.total} total leads` : "Loading…"}
              {selected.size > 0 && ` · ${selected.size} selected`}
            </p>
          </div>

          <div className="h-6 w-px bg-border mx-1" />

          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, email…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 h-8 text-xs bg-white/80"
            />
          </div>

          <Select value={stage} onValueChange={(v: any) => { setStage(v); setPage(1); }}>
            <SelectTrigger className="h-8 text-xs w-36 bg-white/80">
              <Filter className="w-3 h-3 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">All Stages</SelectItem>
              {Object.keys(STAGE_META).map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{STAGE_META[s]!.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Export
          </Button>
          <CsvImportButton />
          <NewLeadDialog />
        </div>
      </div>

      {/* ── Spreadsheet ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-[12.5px] leading-none min-w-[900px]">

          {/* Header */}
          <thead className="sticky top-0 z-20">
            <tr className="bg-[#f0f1f7] border-b-2 border-[#c8cadd]">
              {/* checkbox col */}
              <th className="w-10 border-r border-[#c8cadd] px-3 py-2 text-center bg-[#e8eaf2]">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="w-3.5 h-3.5 rounded-sm cursor-pointer accent-primary"
                />
              </th>

              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  className={`${col.width} border-r border-[#c8cadd] last:border-r-0 px-2.5 py-2 text-left font-semibold text-[11px] uppercase tracking-wide text-[#4b4f6b] select-none whitespace-nowrap
                    ${col.key ? "cursor-pointer hover:bg-[#e2e4f0] transition-colors" : ""}`}
                  onClick={() => col.key && toggleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.key && <SortIcon col={col.key} sort={sort} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={11} className="py-20 text-center text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-20 text-center">
                  <p className="text-sm text-muted-foreground">No leads found.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Try adjusting your search or filters.</p>
                </td>
              </tr>
            ) : (
              rows.map((lead, idx) => {
                const isSelected = selected.has(lead.id);
                const rowNum = (page - 1) * pageSize + idx + 1;
                return (
                  <tr
                    key={lead.id}
                    className={`group border-b border-[#dfe1ed] transition-colors
                      ${isSelected ? "bg-primary/8" : idx % 2 === 0 ? "bg-white" : "bg-[#f7f8fc]"}
                      hover:bg-primary/5`}
                  >
                    {/* Checkbox */}
                    <td className="border-r border-[#dfe1ed] px-3 py-0 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(lead.id)}
                        className="w-3.5 h-3.5 rounded-sm cursor-pointer accent-primary"
                      />
                    </td>

                    {/* Row # */}
                    <td className="border-r border-[#dfe1ed] px-2.5 h-9 text-[11px] text-muted-foreground/50 text-right font-mono select-none">
                      {rowNum}
                    </td>

                    {/* Name */}
                    <td className="border-r border-[#dfe1ed] px-2.5 h-9 font-medium text-[#1a1c2e] max-w-[11rem]">
                      <Link href={`/leads/${lead.id}`} className="block truncate hover:text-primary transition-colors">
                        {lead.full_name}
                      </Link>
                    </td>

                    {/* Phone */}
                    <td className="border-r border-[#dfe1ed] px-2.5 h-9 font-mono text-[12px] text-[#2d3055] tabular-nums whitespace-nowrap">
                      {formatPhone(lead.phone)}
                    </td>

                    {/* Email */}
                    <td className="border-r border-[#dfe1ed] px-2.5 h-9 text-muted-foreground max-w-[11rem]">
                      <span className="block truncate">{lead.email || <span className="text-muted-foreground/30">—</span>}</span>
                    </td>

                    {/* City */}
                    <td className="border-r border-[#dfe1ed] px-2.5 h-9 text-[#4b4f6b] max-w-[7rem]">
                      <span className="block truncate">{lead.city || <span className="text-muted-foreground/30">—</span>}</span>
                    </td>

                    {/* Stage */}
                    <td className="border-r border-[#dfe1ed] px-2.5 h-9">
                      <div className="flex items-center gap-1">
                        <StagePill stage={lead.stage} />
                        {lead.is_dnd && (
                          <span title="Do Not Disturb" className="flex items-center text-[#ef4444]">
                            <ShieldX className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Insurance */}
                    <td className="border-r border-[#dfe1ed] px-2.5 h-9">
                      {lead.insurance_type
                        ? <InsPill type={lead.insurance_type} />
                        : <span className="text-muted-foreground/30">—</span>}
                    </td>

                    {/* Source */}
                    <td className="border-r border-[#dfe1ed] px-2.5 h-9 text-[#4b4f6b] capitalize text-[11px]">
                      {lead.source.replace(/_/g, " ").toLowerCase()}
                    </td>

                    {/* Created */}
                    <td className="border-r border-[#dfe1ed] px-2.5 h-9 text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                      {formatDate(lead.created_at)}
                    </td>

                    {/* Actions */}
                    <td className="px-2.5 h-9">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/leads/${lead.id}`}>
                          <button className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="View lead">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </Link>
                        <a href={`tel:${lead.phone}`}>
                          <button className="p-1.5 rounded hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600 transition-colors" title="Call">
                            <Phone className="w-3.5 h-3.5" />
                          </button>
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Status bar ──────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-[#f0f1f7] border-t-2 border-[#c8cadd] text-[11px] text-[#4b4f6b]">
        <div className="flex items-center gap-4">
          {data && (
            <span>
              Rows <strong className="text-[#1a1c2e]">{fromRow}</strong>–<strong className="text-[#1a1c2e]">{toRow}</strong> of <strong className="text-[#1a1c2e]">{data.total}</strong>
            </span>
          )}
          {selected.size > 0 && (
            <span className="text-primary font-semibold">{selected.size} row{selected.size > 1 ? "s" : ""} selected</span>
          )}
          {sort && (
            <span className="text-muted-foreground">
              Sorted by <strong className="text-[#1a1c2e]">{sort.key.replace(/_/g, " ")}</strong> ({sort.dir})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="mr-2 text-muted-foreground">Page {page} of {totalPages}</span>
          <button
            className="p-1 rounded border border-[#c8cadd] bg-white hover:bg-[#e8eaf2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            className="p-1 rounded border border-[#c8cadd] bg-white hover:bg-[#e8eaf2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
