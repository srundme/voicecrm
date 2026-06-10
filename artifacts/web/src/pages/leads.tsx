import { useListLeads, useCreateLead, getListLeadsQueryKey, LeadStage, LeadSource, InsuranceType } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Link } from "wouter";
import { formatPhone, formatDate } from "@/lib/format";
import { Search, Plus, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

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
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Lead
        </Button>
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
