import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarInset,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Users,
  Phone,
  ShieldAlert,
  CalendarDays,
  Settings,
  Bot,
  Link as LinkIcon,
  Tag,
  Users2,
  Workflow
} from "lucide-react";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Leads", href: "/leads", icon: Users },
    { label: "Calls", href: "/calls", icon: Phone },
    { label: "Policies", href: "/policies", icon: ShieldAlert },
    { label: "Follow-ups", href: "/follow-ups", icon: CalendarDays },
    { label: "Automations", href: "/automations", icon: Workflow },
    { label: "AI Agents", href: "/agents", icon: Bot },
    { label: "Lead Sources", href: "/lead-sources", icon: LinkIcon },
    { label: "Dispositions", href: "/dispositions", icon: Tag },
    { label: "Team", href: "/team", icon: Users2 },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <SidebarProvider>
      <Sidebar className="border-r border-border">
        <SidebarHeader className="h-16 flex items-center px-4 border-b border-border font-bold text-lg text-primary tracking-tight">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground">
              <Phone className="w-5 h-5" />
            </div>
            <span>VoiceCRM</span>
          </div>
        </SidebarHeader>
        <SidebarContent className="py-4">
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={location === item.href || (item.href !== "/" && location.startsWith(item.href))}
                  tooltip={item.label}
                >
                  <Link href={item.href} className="flex items-center gap-3">
                    <item.icon className="w-4 h-4" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="bg-background flex flex-col min-h-[100dvh]">
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
