import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMonthData, useOpenCorrectionsCount } from "@/hooks/useMessData";
import { useAuth } from "@/hooks/useAuth";
import { fmtMoney } from "@/lib/mess";
import {
  Wallet,
  ShoppingBasket,
  UtensilsCrossed,
  TrendingUp,
  Lock,
  Clock,
  MessageSquareWarning,
  ArrowRight,
  Plus,
  ScrollText,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Link } from "react-router-dom";

const Stat = ({ label, value, icon: Icon, sub }: { label: string; value: string; icon: any; sub?: string }) => (
  <Card className="p-5 gradient-card border-border/50 shadow-card">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary" />
      </div>
    </div>
  </Card>
);

const Dashboard = () => {
  const { data, isLoading } = useMonthData();
  const { isAdmin, isContributor } = useAuth();
  const corrections = useOpenCorrectionsCount();

  const { data: recentLogs } = useQuery({
    queryKey: ["activity_logs", "recent"],
    queryFn: async () => {
      const { data } = await supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(8);
      return data ?? [];
    },
  });

  if (isLoading || !data) return <div className="text-muted-foreground">Loading…</div>;
  const showAlerts = isAdmin && (data.pendingCount > 0 || (corrections.data ?? 0) > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mess Dashboard</h1>
          <p className="text-muted-foreground mt-1">{data.range.label} · Financial control center</p>
        </div>
        {data.isClosed && (
          <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" /> Month closed</Badge>
        )}
      </div>

      {showAlerts && (
        <div className="grid sm:grid-cols-2 gap-3">
          {data.pendingCount > 0 && (
            <Link to="/bazar?tab=pending">
              <Card className="p-4 border-warning/40 bg-warning/5 hover:bg-warning/10 transition-colors flex items-center gap-3">
                <Clock className="w-5 h-5 text-warning shrink-0" />
                <div className="flex-1">
                  <div className="font-medium text-sm">{data.pendingCount} bazar awaiting review</div>
                  <div className="text-xs text-muted-foreground">৳{fmtMoney(data.pendingTotal)} pending</div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </Card>
            </Link>
          )}
          {(corrections.data ?? 0) > 0 && (
            <Link to="/corrections">
              <Card className="p-4 border-info/40 bg-info/5 hover:bg-info/10 transition-colors flex items-center gap-3">
                <MessageSquareWarning className="w-5 h-5 text-info shrink-0" />
                <div className="flex-1">
                  <div className="font-medium text-sm">{corrections.data} open correction request{corrections.data === 1 ? "" : "s"}</div>
                  <div className="text-xs text-muted-foreground">Members are asking for fixes</div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </Card>
            </Link>
          )}
        </div>
      )}

      <Card className="p-6 md:p-8 gradient-card border-primary/20 shadow-elevated relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-60 pointer-events-none" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm uppercase tracking-widest text-muted-foreground font-semibold">Live meal rate</p>
            <p className="mt-3 text-5xl md:text-6xl font-bold text-gradient">৳{fmtMoney(data.rate)}</p>
            <p className="text-sm text-muted-foreground mt-2">
              ৳{fmtMoney(data.totalExpense)} approved bazar ÷ {fmtMoney(data.totalMeals)} meals
            </p>
          </div>
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
            <TrendingUp className="w-8 h-8 text-primary-foreground" />
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {isAdmin && <Button variant="outline" asChild><Link to="/meals"><Plus className="w-4 h-4 mr-2" />Add meal</Link></Button>}
        {isAdmin && <Button variant="outline" asChild><Link to="/deposits"><Plus className="w-4 h-4 mr-2" />Add deposit</Link></Button>}
        {isContributor && <Button variant="outline" asChild><Link to="/bazar"><Plus className="w-4 h-4 mr-2" />Submit bazar</Link></Button>}
        <Button variant="ghost" asChild className="ml-auto"><Link to="/transparency"><ScrollText className="w-4 h-4 mr-2" />Activity</Link></Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total Bazar" value={`৳${fmtMoney(data.totalExpense)}`} icon={ShoppingBasket} sub={data.pendingCount > 0 ? `${data.pendingCount} pending` : "All approved"} />
        <Stat label="Total Deposits" value={`৳${fmtMoney(data.totalDeposits)}`} icon={Wallet} />
        <Stat label="Total Meals" value={fmtMoney(data.totalMeals)} icon={UtensilsCrossed} sub={`${data.members.length} members`} />
        <Stat label="Net Advance" value={`৳${fmtMoney(data.advanceBalance - data.dueBalance)}`} icon={TrendingUp} sub={`Due: ৳${fmtMoney(data.dueBalance)}`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 opacity-50">
        {["Bills unpaid", "Rent collected", "Rent due", "Active agreements"].map((l) => (
          <Card key={l} className="p-5 border-dashed border-border/50">
            <p className="text-xs uppercase text-muted-foreground">{l}</p>
            <p className="mt-2 text-2xl font-bold">—</p>
            <p className="text-xs text-muted-foreground">Coming soon</p>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 gradient-card border-border/50 shadow-card">
          <h2 className="font-semibold mb-4">Member settlement</h2>
          <div className="space-y-2">
            {data.perMember.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{m.name}</div>
                    <div className="text-xs text-muted-foreground">{fmtMoney(m.meals)} meals · ৳{fmtMoney(m.deposits)} in</div>
                  </div>
                </div>
                <div className={`text-right font-bold tabular-nums ${m.balance >= 0 ? "text-success" : "text-destructive"}`}>
                  {m.balance >= 0 ? "+" : "−"}৳{fmtMoney(Math.abs(m.balance))}
                  <div className="text-xs font-normal text-muted-foreground">{m.balance >= 0 ? "advance" : "due"}</div>
                </div>
              </div>
            ))}
            {data.perMember.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Add members to get started</p>}
          </div>
        </Card>

        <Card className="p-6 gradient-card border-border/50 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent activity</h2>
            <Link to="/transparency" className="text-xs text-primary hover:underline">See all →</Link>
          </div>
          <div className="space-y-3">
            {(recentLogs ?? []).slice(0, 6).map((r) => (
              <div key={r.id} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium capitalize truncate">{r.entity_type.replace("_", " ")}</span>
                  <Badge variant="outline" className="text-xs capitalize">{r.action}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {r.actor_email ?? "system"} · {format(new Date(r.created_at), "MMM d, h:mm a")}
                </p>
              </div>
            ))}
            {(!recentLogs || recentLogs.length === 0) && <p className="text-sm text-muted-foreground py-6 text-center">No activity yet</p>}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
