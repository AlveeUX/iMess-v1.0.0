import { useNavigate, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  UtensilsCrossed,
  Wallet,
  ShoppingBasket,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  ScrollText,
  MessageSquareWarning,
  Receipt,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import logo from "@/assets/icons/Mess pilot white.png";
import { NavLink } from "@/components/NavLink";
import { useOpenCorrectionsCount, useMonthData } from "@/hooks/useMessData";
import { Badge } from "@/components/ui/badge";

interface NavEntry {
  to: string;
  label: string;
  icon: any;
  end?: boolean;
  adminOnly?: boolean;
  badge?: number;
}

export const Layout = () => {
  const { signOut, user, isAdmin, isContributor, roles } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const corrections = useOpenCorrectionsCount();
  const monthData = useMonthData();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const baseNav: NavEntry[] = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/members", label: "Members", icon: Users },
    { to: "/meals", label: "Meals", icon: UtensilsCrossed },
    { to: "/deposits", label: "Deposits", icon: Wallet },
    { to: "/bazar", label: "Bazar", icon: ShoppingBasket, badge: monthData.data?.pendingCount },
    { to: "/bills", label: "Bills", icon: Receipt },
    { to: "/report", label: "Report", icon: FileText },
    { to: "/transparency", label: "Transparency", icon: ScrollText },
    { to: "/corrections", label: "Corrections", icon: MessageSquareWarning, badge: isAdmin ? corrections.data : undefined },
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  const nav = baseNav.filter((n) => !n.adminOnly || isAdmin);

  const roleLabel = isAdmin
    ? "Admin"
    : isContributor
    ? "Bazar Contributor"
    : roles.length > 0
    ? "Member"
    : "Member";

  const renderItem = (n: NavEntry, mobile = false) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      onClick={() => mobile && setOpen(false)}
      className={cn(
        "flex items-center gap-3 px-4 rounded-lg text-sm font-medium transition-all",
        mobile ? "py-3" : "py-2.5",
        "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      )}
      activeClassName="bg-primary/15 text-primary hover:bg-primary/15 hover:text-primary"
    >
      <n.icon className={mobile ? "w-5 h-5" : "w-4 h-4"} />
      <span className="flex-1">{n.label}</span>
      {!!n.badge && n.badge > 0 && (
        <Badge variant="secondary" className="bg-primary/20 text-primary text-xs h-5 px-1.5">
          {n.badge}
        </Badge>
      )}
    </NavLink>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-lg">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <img src={logo} alt="MessPilot" className="w-8 h-8 rounded-lg object-contain" />
            <span className="font-bold">MessPilot</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
        {open && (
          <nav className="border-t border-border p-2 space-y-1">
            {nav.map((n) => renderItem(n, true))}
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary"
            >
              <LogOut className="w-5 h-5" /> Sign out
            </button>
          </nav>
        )}
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 border-r border-border bg-sidebar">
          <div className="p-6 flex items-center gap-3">
            <img src={logo} alt="MessPilot" className="w-10 h-10 rounded-xl object-contain shadow-glow" />
            <div>
              <div className="font-bold tracking-tight">MessPilot</div>
              <div className="text-xs text-muted-foreground">{roleLabel}</div>
            </div>
          </div>
          <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
            {nav.map((n) => renderItem(n))}
          </nav>
          <div className="p-3 border-t border-sidebar-border">
            <div className="px-3 py-2 text-xs text-muted-foreground truncate">{user?.email}</div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <Outlet key={location.pathname} />
          </div>
        </main>
      </div>
    </div>
  );
};
