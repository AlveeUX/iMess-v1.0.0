import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMonthData } from "@/hooks/useMessData";
import { fmtMoney } from "@/lib/mess";
import {
  Wallet,
  ShoppingBasket,
  UtensilsCrossed,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Lock,
} from "lucide-react";
import { format } from "date-fns";

const Stat = ({
  label,
  value,
  icon: Icon,
  accent,
  sub,
}: {
  label: string;
  value: string;
  icon: any;
  accent?: string;
  sub?: string;
}) => (
  <Card className="p-5 gradient-card border-border/50 shadow-card">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <p className={`mt-2 text-2xl font-bold ${accent ?? ""}`}>{value}</p>
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

  if (isLoading || !data)
    return <div className="text-muted-foreground">Loading…</div>;

  const recent = [
    ...data.expenses.map((e) => ({
      type: "expense" as const,
      title: e.title,
      amount: -Number(e.amount),
      date: e.date,
    })),
    ...data.deposits.map((d) => {
      const m = data.members.find((x) => x.id === d.member_id);
      return {
        type: "deposit" as const,
        title: `${m?.name ?? "Member"} deposit`,
        amount: Number(d.amount),
        date: d.date,
      };
    }),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">{data.range.label}</p>
        </div>
        {data.isClosed && (
          <Badge variant="secondary" className="gap-1">
            <Lock className="w-3 h-3" /> Month closed
          </Badge>
        )}
      </div>

      {/* Hero meal rate */}
      <Card className="p-6 md:p-8 gradient-card border-primary/20 shadow-elevated relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-50 pointer-events-none" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm uppercase tracking-widest text-muted-foreground font-semibold">
              Live meal rate
            </p>
            <p className="mt-3 text-5xl md:text-6xl font-bold text-gradient">
              ৳{fmtMoney(data.rate)}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              ৳{fmtMoney(data.totalExpense)} ÷ {fmtMoney(data.totalMeals)} meals
            </p>
          </div>
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
            <TrendingUp className="w-8 h-8 text-primary-foreground" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat label="Total Expense" value={`৳${fmtMoney(data.totalExpense)}`} icon={ShoppingBasket} />
        <Stat label="Total Deposits" value={`৳${fmtMoney(data.totalDeposits)}`} icon={Wallet} />
        <Stat
          label="Total Meals"
          value={fmtMoney(data.totalMeals)}
          icon={UtensilsCrossed}
          sub={`${data.members.length} members`}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 gradient-card border-border/50 shadow-card">
          <h2 className="font-semibold mb-4">Member balances</h2>
          <div className="space-y-2">
            {data.perMember.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{m.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtMoney(m.meals)} meals · ৳{fmtMoney(m.deposits)} in
                    </div>
                  </div>
                </div>
                <div
                  className={`font-bold tabular-nums ${
                    m.balance >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {m.balance >= 0 ? "+" : ""}৳{fmtMoney(Math.abs(m.balance))}
                  <div className="text-xs font-normal text-muted-foreground text-right">
                    {m.balance >= 0 ? "advance" : "due"}
                  </div>
                </div>
              </div>
            ))}
            {data.perMember.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Add members to get started
              </p>
            )}
          </div>
        </Card>

        <Card className="p-6 gradient-card border-border/50 shadow-card">
          <h2 className="font-semibold mb-4">Recent activity</h2>
          <div className="space-y-3">
            {recent.map((r, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    r.amount >= 0 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {r.amount >= 0 ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(r.date), "MMM d")}
                  </div>
                </div>
                <div
                  className={`text-sm font-semibold tabular-nums ${
                    r.amount >= 0 ? "text-success" : "text-foreground"
                  }`}
                >
                  ৳{fmtMoney(Math.abs(r.amount))}
                </div>
              </div>
            ))}
            {recent.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No activity yet</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
