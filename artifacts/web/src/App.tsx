import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";

import Dashboard from "@/pages/dashboard";
import Leads from "@/pages/leads";
import LeadDetail from "@/pages/lead-detail";
import Calls from "@/pages/calls";
import CallDetail from "@/pages/call-detail";
import Policies from "@/pages/policies";
import FollowUps from "@/pages/follow-ups";
import Agents from "@/pages/agents";
import LeadSources from "@/pages/lead-sources";
import Settings from "@/pages/settings";
import Team from "@/pages/team";
import Campaigns from "@/pages/campaigns";
import Automations from "@/pages/automations";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        if ((error as { status?: number })?.status === 401) return false;
        return failureCount < 2;
      },
    },
  },
});

function AppRouter() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/leads" component={Leads} />
        <Route path="/leads/:id" component={LeadDetail} />
        <Route path="/calls" component={Calls} />
        <Route path="/calls/:id" component={CallDetail} />
        <Route path="/policies" component={Policies} />
        <Route path="/follow-ups" component={FollowUps} />
        <Route path="/agents" component={Agents} />
        <Route path="/lead-sources" component={LeadSources} />
        <Route path="/settings" component={Settings} />
        <Route path="/team" component={Team} />
        <Route path="/campaigns" component={Campaigns} />
        <Route path="/automations" component={Automations} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

type AuthState = "loading" | "authenticated" | "unauthenticated";

function AuthGate() {
  const [authState, setAuthState] = useState<AuthState>("loading");

  const checkAuth = async () => {
    try {
      const res = await fetch(`${BASE}/api/auth/me`, { credentials: "include" });
      const data = (await res.json()) as { authenticated?: boolean };
      setAuthState(data.authenticated ? "authenticated" : "unauthenticated");
    } catch {
      setAuthState("unauthenticated");
    }
  };

  useEffect(() => {
    void checkAuth();
  }, []);

  if (authState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return <Login onSuccess={() => { queryClient.clear(); setAuthState("authenticated"); }} />;
  }

  return (
    <WouterRouter base={BASE}>
      <AppRouter />
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthGate />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
