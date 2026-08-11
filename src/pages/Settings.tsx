import { useMonthData } from "@/hooks/useMessData";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Lock, Unlock, ShieldCheck } from "lucide-react";
import { fmtMoney } from "@/lib/mess";
import { SignupAllowlist } from "@/components/SignupAllowlist";

const Settings = () => {
  const { data, isLoading } = useMonthData();
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();

  const closeMonth = async () => {
    if (!data) return;
    if (data.pendingMealsCount > 0) {
      return toast.error(
        `${data.pendingMealsCount} meal ${data.pendingMealsCount === 1 ? "entry is" : "entries are"} still pending review — approve or reject them on the Meals page before closing.`
      );
    }
    if (!confirm(`Close ${data.range.label}? After closing, no edits are allowed.`)) return;
    const payload = {
      month: data.range.monthKey,
      is_closed: true,
      total_expense: data.totalExpense,
      total_meals: data.totalMeals,
      final_meal_rate: data.liveRate,
      closed_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("months")
      .upsert(payload, { onConflict: "month" });
    if (error) return toast.error(error.message);
    toast.success("Month closed");
    qc.invalidateQueries({ queryKey: ["month-data"] });
    qc.invalidateQueries({ queryKey: ["month"] });
  };

  const reopenMonth = async () => {
    if (!data?.monthRow) return;
    if (!confirm("Reopen this month? Members will be able to edit again.")) return;
    const { error } = await supabase
      .from("months")
      .update({ is_closed: false, closed_at: null })
      .eq("id", data.monthRow.id);
    if (error) return toast.error(error.message);
    toast.success("Month reopened");
    qc.invalidateQueries({ queryKey: ["month-data"] });
  };

  if (isLoading || !data) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account & current month</p>
      </div>

      <Card className="p-6 gradient-card border-border/50 shadow-card">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold">Your account</h2>
            <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
            <Badge variant={isAdmin ? "default" : "secondary"} className="mt-2">
              {isAdmin ? "Administrator" : "Member"}
            </Badge>
          </div>
        </div>
      </Card>

      <Card className="p-6 gradient-card border-border/50 shadow-card">
        <h2 className="font-semibold mb-1">Month close</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Closing {data.range.label} will lock all meals, deposits, and expenses, and store the final meal rate.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-secondary/40">
            <div className="text-xs text-muted-foreground">Live rate</div>
            <div className="text-lg font-bold">৳{fmtMoney(data.liveRate)}</div>
          </div>
          <div className="p-3 rounded-lg bg-secondary/40">
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="text-lg font-bold">{data.isClosed ? "Closed 🔒" : "Open"}</div>
          </div>
        </div>
        {isAdmin && !data.isClosed && data.pendingMealsCount > 0 && (
          <p className="text-xs text-warning mb-3">
            {data.pendingMealsCount} meal {data.pendingMealsCount === 1 ? "entry is" : "entries are"} still
            pending review — approve or reject them on the Meals page before closing.
          </p>
        )}
        {isAdmin ? (
          data.isClosed ? (
            <Button onClick={reopenMonth} variant="outline" className="w-full">
              <Unlock className="w-4 h-4 mr-2" /> Reopen month
            </Button>
          ) : (
            <Button onClick={closeMonth} className="w-full" size="lg" disabled={data.pendingMealsCount > 0}>
              <Lock className="w-4 h-4 mr-2" /> Close {data.range.label}
            </Button>
          )
        ) : (
          <p className="text-sm text-muted-foreground italic">Only admin can close the month.</p>
        )}
      </Card>

      {isAdmin && <SignupAllowlist />}
    </div>
  );
};

export default Settings;
