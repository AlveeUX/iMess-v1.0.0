import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShoppingBasket, TrendingUp, Calendar, Hash } from "lucide-react";
import { fmtMoney } from "@/lib/mess";

const BazarMemberProfile = () => {
  const { memberId } = useParams<{ memberId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["bazar-member-profile", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const [profileRes, expensesRes] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name").eq("user_id", memberId!).maybeSingle(),
        supabase
          .from("expenses")
          .select("id, title, amount, category, date, status, submitted_at")
          .eq("submitted_by", memberId!)
          .eq("status", "approved")
          .order("date", { ascending: false }),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (expensesRes.error) throw expensesRes.error;
      return {
        profile: profileRes.data,
        expenses: expensesRes.data ?? [],
      };
    },
  });

  const stats = useMemo(() => {
    const list = data?.expenses ?? [];
    const total = list.reduce((s, e) => s + Number(e.amount), 0);
    const count = list.length;
    const avg = count ? total / count : 0;
    const months = new Map<string, { label: string; total: number; count: number }>();
    list.forEach((e) => {
      const d = parseISO(e.date);
      const key = format(d, "yyyy-MM");
      const cur = months.get(key) ?? { label: format(d, "MMMM yyyy"), total: 0, count: 0 };
      cur.total += Number(e.amount);
      cur.count += 1;
      months.set(key, cur);
    });
    const monthly = Array.from(months.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, v]) => ({ key, ...v }));
    return { total, count, avg, monthly };
  }, [data]);

  if (isLoading || !data) {
    return <div className="text-muted-foreground">Loading…</div>;
  }

  const name = data.profile?.display_name || "Member";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/bazar" aria-label="Back to bazar">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <ShoppingBasket className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
          <p className="text-muted-foreground mt-1">Bazar contribution history</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4 gradient-card border-border/50 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <TrendingUp className="w-4 h-4" /> Total contributed
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1">৳{fmtMoney(stats.total)}</div>
        </Card>
        <Card className="p-4 gradient-card border-border/50 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Hash className="w-4 h-4" /> Approved entries
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1">{stats.count}</div>
        </Card>
        <Card className="p-4 gradient-card border-border/50 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Calendar className="w-4 h-4" /> Average per entry
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1">৳{fmtMoney(stats.avg)}</div>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Monthly breakdown</h2>
        <Card className="gradient-card border-border/50 shadow-card overflow-hidden">
          <div className="divide-y divide-border">
            {stats.monthly.map((m) => (
              <div key={m.key} className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium">{m.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{m.count} entries</div>
                </div>
                <div className="font-bold tabular-nums text-lg">৳{fmtMoney(m.total)}</div>
              </div>
            ))}
            {stats.monthly.length === 0 && (
              <div className="p-12 text-center text-muted-foreground">No approved bazar yet.</div>
            )}
          </div>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">All approved entries</h2>
        <Card className="gradient-card border-border/50 shadow-card overflow-hidden">
          <div className="divide-y divide-border">
            {data.expenses.map((e) => (
              <div key={e.id} className="p-4 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{e.title}</span>
                    <Badge variant="outline" className="bg-success/15 text-success border-success/30">
                      Approved
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {format(parseISO(e.date), "MMM d, yyyy")} · {e.category}
                  </div>
                </div>
                <div className="font-bold tabular-nums text-lg">৳{fmtMoney(Number(e.amount))}</div>
              </div>
            ))}
            {data.expenses.length === 0 && (
              <div className="p-12 text-center text-muted-foreground">No entries.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default BazarMemberProfile;
