import { useGetApiConfig, useUpdateApiConfig, getGetApiConfigQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Save, CheckCircle2, Shield, Webhook, Link as LinkIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Settings() {
  const { data: config, isLoading } = useGetApiConfig();
  const updateConfig = useUpdateApiConfig();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    bolna_api_key: "",
    brevo_api_key: "",
    meta_ads_access_token: "",
    sms_on_lead_created: false,
    sms_on_call_scheduled: false,
  });

  useEffect(() => {
    if (config) {
      setFormData({
        bolna_api_key: config.bolna_api_key || "",
        brevo_api_key: config.brevo_api_key || "",
        meta_ads_access_token: config.meta_ads_access_token || "",
        sms_on_lead_created: config.sms_on_lead_created || false,
        sms_on_call_scheduled: config.sms_on_call_scheduled || false,
      });
    }
  }, [config]);

  const handleSave = () => {
    updateConfig.mutate(
      { data: formData },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetApiConfigQueryKey(), data);
          toast({
            title: "Settings Saved",
            description: "API configuration updated successfully.",
          });
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Failed to save settings",
            description: err.message || "An error occurred",
          });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

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
            <CardDescription>
              Connect external services. Keys are securely encrypted at rest.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="bolna">Bolna API Key (Voice AI)</Label>
              <Input
                id="bolna"
                type="password"
                placeholder="sk_..."
                value={formData.bolna_api_key}
                onChange={(e) => setFormData(f => ({ ...f, bolna_api_key: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brevo">Brevo API Key (Email/SMS)</Label>
              <Input
                id="brevo"
                type="password"
                placeholder="xkeysib-..."
                value={formData.brevo_api_key}
                onChange={(e) => setFormData(f => ({ ...f, brevo_api_key: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta">Meta Ads Access Token</Label>
              <Input
                id="meta"
                type="password"
                placeholder="EAAG..."
                value={formData.meta_ads_access_token}
                onChange={(e) => setFormData(f => ({ ...f, meta_ads_access_token: e.target.value }))}
              />
            </div>
          </CardContent>
          <CardFooter className="bg-muted/30 px-6 py-4 border-t flex justify-end">
            <Button onClick={handleSave} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? "Saving..." : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Keys
                </>
              )}
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
              <CardDescription>
                Use these endpoints to send leads into VoiceCRM from external systems.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-muted rounded-md border text-sm break-all font-mono space-y-1">
                <div className="text-muted-foreground text-xs uppercase tracking-wider font-sans font-semibold mb-2">Meta Ads Webhook URL</div>
                {config.meta_webhook_url}
              </div>
              <div className="p-3 bg-muted rounded-md border text-sm break-all font-mono space-y-1">
                <div className="text-muted-foreground text-xs uppercase tracking-wider font-sans font-semibold mb-2">Context API URL (For Bolna Agents)</div>
                {config.context_api_url}
              </div>
              <div className="p-3 bg-muted rounded-md border text-sm break-all font-mono space-y-1">
                <div className="text-muted-foreground text-xs uppercase tracking-wider font-sans font-semibold mb-2">Context API Bearer Token</div>
                {config.context_api_bearer_token}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
