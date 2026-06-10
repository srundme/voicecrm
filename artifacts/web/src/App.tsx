import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout";
import NotFound from "@/pages/not-found";

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

const queryClient = new QueryClient();

function Router() {
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
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
