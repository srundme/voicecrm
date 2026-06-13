import {
  useGetApiConfig, useUpdateApiConfig, useTestConnection, getGetApiConfigQueryKey,
  useListAutomations, useCreateAutomation, useUpdateAutomation, getListAutomationsQueryKey,
  useListAgents,
  AutomationType,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Save, Shield, Webhook, Eye, EyeOff, Copy, Check, Loader2, Plug, MessageSquare, Zap, Bot, Trash2, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";

type Service = "bolna" | "brevo" | "meta" | "openai";

function CopyButton({ value }: { value?: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => {
      navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }} title="Copy">
      {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
    </Button>
  );
}

const BASE = import.meta.env.BASE_URL;

export default function Settings() {
  const { data: config, isLoading } = useGetApiConfig();
  const updateConfig = useUpdateApiConfig();
  const testConnection = useTestConnection();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState(false);

  const { data: agentsData } = useListAgents();
  const { data: automationsData } = useListAutomations();
  const createAutomation = useCreateAutomation();
  const updateAutomation = useUpdateAutomation();

  type RuleState = { id?: string; is_active: boolean; bolna_agent_id?: string };
  const [rules, setRules] = useState<Record<string, RuleState>>({
    AUTO_CALL_ON_LEAD: { is_active: false, bolna_agent_id: "" },
    RETRY_ON_DROP: { is_active: false },
  });
  const [savingRules, setSavingRules] = useState(false);

  useEffect(() => {
    if (!automationsData) return;
    setRules(prev => {
      const next = { ...prev };
      for (const a of automationsData) {
        if (a.type === "AUTO_CALL_ON_LEAD") {
          next[a.type] = { id: a.id, is_active: a.is_active, bolna_agent_id: a.bolna_agent_id ?? "" };
        } else if (a.type === "RETRY_ON_DROP") {
          next[a.type] = { id: a.id, is_active: a.is_active };
        }
      }
      return next;
    });
  }, [automationsData]);

  const handleSaveRules = async () => {
    setSavingRules(true);
    try {
      const NAMES: Record<string, string> = {
        AUTO_CALL_ON_LEAD: "Auto-call new leads",
        RETRY_ON_DROP: "Retry dropped calls",
      };
      for (const [type, rule] of Object.entries(rules)) {
        const updateData: Record<string, unknown> = { is_active: rule.is_active };
        if (type === "AUTO_CALL_ON_LEAD" && rule.bolna_agent_id !== undefined) {
          updateData.bolna_agent_id = rule.bolna_agent_id;
        }
        if (rule.id) {
          await updateAutomation.mutateAsync({ id: rule.id, data: updateData as Parameters<typeof updateAutomation.mutateAsync>[0]["data"] });
        } else {
          await createAutomation.mutateAsync({
            data: { name: NAMES[type] || type, type: type as AutomationType, bolna_agent_id: (updateData.bolna_agent_id as string) || "", is_active: rule.is_active },
          });
        }
      }
      await updateConfig.mutateAsync({
        data: { monthly_checkin_agent_id: formData.monthly_checkin_agent_id || undefined },
      });
      queryClient.invalidateQueries({ queryKey: getListAutomationsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetApiConfigQueryKey() });
      toast({ title: "Automation rules saved" });
    } catch {
      toast({ variant: "destructive", title: "Failed to save automation rules" });
    } finally {
      setSavingRules(false);
    }
  };

  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Service | null>(null);
  const [formData, setFormData] = useState({
    bolna_api_key: "",
    brevo_api_key: "",
    meta_ads_access_token: "",
    openai_api_key: "",
    sms_on_lead_created: false,
    sms_on_call_scheduled: false,
    monthly_checkin_agent_id: "",
    human_agent_phone: "",
  });

  const SENTINEL = "configured";

  useEffect(() => {
    if (config) {
      setFormData({
        bolna_api_key: config.bolna_api_key || "",
        brevo_api_key: config.brevo_api_key || "",
        meta_ads_access_token: config.meta_ads_access_token || "",
        openai_api_key: config.openai_api_key || "",
        sms_on_lead_created: config.sms_on_lead_created || false,
        sms_on_call_scheduled: config.sms_on_call_scheduled || false,
        monthly_checkin_agent_id: config.monthly_checkin_agent_id || "",
        human_agent_phone: config.human_agent_phone || "",
      });
    }
  }, [config]);

  const handleResetTestData = async () => {
    setResetting(true);
    try {
      const res = await fetch(`${BASE}api/admin/reset-test-data`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      queryClient.clear();
      toast({ title: "Test data cleared", description: "All leads, calls, and follow-ups have been deleted." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Reset failed", description: e.message });
    } finally {
      setResetting(false);
    }
  };

  const handleSave = () => {
    const payload: Record<string, unknown> = { ...formData };
    for (const k of ["bolna_api_key", "brevo_api_key", "meta_ads_access_token", "openai_api_key"] as const) {
      if (payload[k] === SENTINEL || payload[k] === "") delete payload[k];
    }
    updateConfig.mutate(
      { data: payload as Parameters<typeof updateConfig.mutate>[0]["data"] },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetApiConfigQueryKey(), data);
          toast({ title: "Settings Saved", description: "API configuration updated successfully." });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Failed to save settings", description: err.message || "An error occurred" }),
      }
    );
  };

  const handleTest = (service: Service) => {
    setTesting(service);
    testConnection.mutate({ service }, {
      onSuccess: (res: any) => {
        toast({
          variant: res?.success ? "default" : "destructive",
          title: res?.success ? `${service} connected` : `${service} connection failed`,
          description: res?.message || res?.error,
        });
      },
      onError: (err: any) => toast({ variant: "destructive", title: "Test failed", description: err.message }),
      onSettled: () => setTesting(null),
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  const keyField = (id: Service, label: string, placeholder: string, field: keyof typeof formData) => {
    const currentValue = formData[field] as string;
    const isSaved = currentValue === SENTINEL;
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              id={id}
              name={field}
              type={reveal[id] ? "text" : "password"}
              autoComplete="new-password"
              placeholder={isSaved ? "Key saved — enter new value to replace" : placeholder}
              value={isSaved ? "" : currentValue}
              readOnly={isSaved}
              onClick={isSaved ? () => setFormData(f => ({ ...f, [field]: "" })) : undefined}
              onChange={(e) => setFormData(f => ({ ...f, [field]: e.target.value }))}
              className={`pr-9 ${isSaved ? "placeholder:text-emerald-600 placeholder:font-medium cursor-text" : ""}`}
            />
            {!isSaved && (
              <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full w-9" onClick={() => setReveal(r => ({ ...r, [id]: !r[id] }))} title={reveal[id] ? "Hide" : "Show"}>
                {reveal[id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => handleTest(id)} disabled={testing === id || !isSaved}>
            {testing === id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
            <span className="ml-1.5">Test</span>
          </Button>
        </div>
      </div>
    );
  };

  const urlField = (label: string, value?: string | null) => (
    <div className="p-3 bg-muted rounded-md border space-y-1">
      <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <div className="text-sm break-all font-mono flex-1">{value || "-"}</div>
        <CopyButton value={value} />
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure integrations and agency preferences.</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <CardTitle>API Keys & Credentials</CardTitle>
            </div>
            <CardDescription>Connect external services. Keys are masked by default; use Test to verify each connection.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {keyField("bolna", "Bolna API Key (Voice AI)", "sk_...", "bolna_api_key")}
            {keyField("brevo", "Brevo API Key (Email/SMS)", "xkeysib-...", "brevo_api_key")}
            {keyField("meta", "Meta Ads Access Token", "EAAG...", "meta_ads_access_token")}
            {keyField("openai", "OpenAI API Key (AI Analysis)", "sk-...", "openai_api_key")}
            {config?.updated_at && <div className="text-xs text-muted-foreground">Last updated: {new Date(config.updated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>}
          </CardContent>
          <CardFooter className="bg-muted/30 px-6 py-4 border-t flex justify-end">
            <Button onClick={handleSave} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? "Saving..." : (<><Save className="w-4 h-4 mr-2" />Save Keys</>)}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              <CardTitle>SMS Notifications</CardTitle>
            </div>
            <CardDescription>Automatic SMS alerts sent via Brevo for key lead and call events.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="sms_on_lead_created">SMS on new lead</Label>
                <p className="text-sm text-muted-foreground">Send a welcome SMS when a lead is created.</p>
              </div>
              <Switch
                id="sms_on_lead_created"
                checked={formData.sms_on_lead_created}
                onCheckedChange={(v) => setFormData(f => ({ ...f, sms_on_lead_created: v }))}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="sms_on_call_scheduled">SMS on scheduled call</Label>
                <p className="text-sm text-muted-foreground">Notify the lead when a call is scheduled with them.</p>
              </div>
              <Switch
                id="sms_on_call_scheduled"
                checked={formData.sms_on_call_scheduled}
                onCheckedChange={(v) => setFormData(f => ({ ...f, sms_on_call_scheduled: v }))}
              />
            </div>
            <div className="pt-2 border-t space-y-2">
              <Label htmlFor="human_agent_phone">Human Agent Phone (for call transfer)</Label>
              <p className="text-sm text-muted-foreground">When Dhivya transfers a call, an SMS summary is sent to this number so the agent is ready.</p>
              <Input
                id="human_agent_phone"
                type="tel"
                placeholder="+919876543210"
                value={formData.human_agent_phone}
                onChange={(e) => setFormData(f => ({ ...f, human_agent_phone: e.target.value }))}
              />
            </div>
          </CardContent>
          <CardFooter className="bg-muted/30 px-6 py-4 border-t flex justify-end">
            <Button onClick={handleSave} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? "Saving..." : (<><Save className="w-4 h-4 mr-2" />Save Preferences</>)}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              <CardTitle>Automation Rules</CardTitle>
            </div>
            <CardDescription>AI calls that fire automatically — no manual setup needed per lead.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {[
              { type: "AUTO_CALL_ON_LEAD", label: "Auto-call new leads", desc: "When a lead is added or arrives via webhook, an AI agent calls them immediately." },
              { type: "RETRY_ON_DROP", label: "Retry dropped calls", desc: "When a call drops unexpectedly, the same agent retries automatically." },
            ].map(({ type, label, desc }) => {
              const rule = rules[type];
              return (
                <div key={type} className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">{label}</Label>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </div>
                  <Switch
                    checked={rule.is_active}
                    onCheckedChange={(v) => setRules(r => ({ ...r, [type]: { ...r[type], is_active: v } }))}
                  />
                </div>
              );
            })}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-indigo-600" />
                <Label className="text-sm font-medium">Primary outbound agent</Label>
              </div>
              <p className="text-sm text-muted-foreground">The agent that calls new leads automatically (auto-call &amp; retry).</p>
              <Select
                value={rules["AUTO_CALL_ON_LEAD"]?.bolna_agent_id || "__none__"}
                onValueChange={(v) => setRules(r => ({ ...r, AUTO_CALL_ON_LEAD: { ...r["AUTO_CALL_ON_LEAD"]!, bolna_agent_id: v === "__none__" ? "" : v } }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an agent..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No agent selected</SelectItem>
                  {agentsData?.data?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-purple-600" />
                <Label className="text-sm font-medium">Monthly check-in agent</Label>
              </div>
              <p className="text-sm text-muted-foreground">The AI agent used for monthly check-in calls to existing policyholders.</p>
              <Select
                value={formData.monthly_checkin_agent_id || "__none__"}
                onValueChange={(v) => setFormData(f => ({ ...f, monthly_checkin_agent_id: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an agent..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No agent selected</SelectItem>
                  {agentsData?.data?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/30 px-6 py-4 border-t flex justify-end">
            <Button onClick={handleSaveRules} disabled={savingRules}>
              {savingRules ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Rules</>}
            </Button>
          </CardFooter>
        </Card>

        {config && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Webhook className="w-5 h-5 text-primary" />
                <CardTitle>System Webhooks & APIs</CardTitle>
              </div>
              <CardDescription>Use these endpoints to send leads into VoiceCRM and to configure Bolna inbound settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {urlField("Context API URL (for Bolna Agents)", config.context_api_url)}
              {urlField("Context API Bearer Token", config.context_api_bearer_token)}
              {urlField("Meta Ads Webhook URL", config.meta_webhook_url)}
              {urlField("Website Form Webhook URL", config.website_form_webhook_url)}
            </CardContent>
          </Card>
        )}

        <Card className="border-destructive/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
            </div>
            <CardDescription>Irreversible actions. Use only while testing.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <div>
                <p className="font-medium text-sm">Delete all test data</p>
                <p className="text-sm text-muted-foreground">Permanently removes all leads, call logs, follow-ups, and policies. Settings and automations are kept.</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={resetting}>
                    {resetting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                    Reset Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete all data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete <strong>all leads, call logs, follow-ups, and policies</strong> in your account. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      onClick={handleResetTestData}
                    >
                      Yes, delete everything
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
