import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { useMonthData } from "@/hooks/useMessData";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Save } from "lucide-react";

const Meals = () => {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { data, isLoading } = useMonthData(new Date(date));
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const activeMembers = useMemo(
    () => (data?.members ?? []).filter((m) => m.is_active),
    [data]
  );

  useEffect(() => {
    if (!data) return;
    const initial: Record<string, string> = {};
    activeMembers.forEach((m) => {
      const existing = data.meals.find((x) => x.member_id === m.id && x.date === date);
      initial[m.id] = existing ? String(existing.meal_count) : "0";
    });
    setCounts(initial);
  }, [data, date, activeMembers]);

  const adjust = (id: string, delta: number) => {
    const cur = parseFloat(counts[id] || "0");
    const next = Math.max(0, +(cur + delta).toFixed(1));
    setCounts({ ...counts, [id]: String(next) });
  };

  const save = async () => {
    setSaving(true);
    try {
      const rows = activeMembers.map((m) => ({
        member_id: m.id,
        date,
        meal_count: parseFloat(counts[m.id] || "0"),
      }));
      const { error } = await supabase
        .from("meals")
        .upsert(rows, { onConflict: "member_id,date" });
      if (error) throw error;
      toast.success("Meals saved");
      qc.invalidateQueries({ queryKey: ["month-data"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !data) return <div className="text-muted-foreground">Loading…</div>;
  const locked = data.isClosed;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meals</h1>
          <p className="text-muted-foreground mt-1">Daily meal entry</p>
        </div>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto"
        />
      </div>

      {locked && (
        <Card className="p-4 border-warning/40 bg-warning/5 flex items-center gap-3">
          <Lock className="w-4 h-4 text-warning" />
          <p className="text-sm">This month is closed. Meals cannot be edited.</p>
        </Card>
      )}

      <Card className="gradient-card border-border/50 shadow-card overflow-hidden">
        <div className="divide-y divide-border">
          {activeMembers.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{m.name}</div>
                {m.room && <div className="text-xs text-muted-foreground">Room {m.room}</div>}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="rounded-full h-10 w-10"
                  disabled={!isAdmin || locked}
                  onClick={() => adjust(m.id, -0.5)}
                >
                  −
                </Button>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={counts[m.id] ?? "0"}
                  onChange={(e) => setCounts({ ...counts, [m.id]: e.target.value })}
                  disabled={!isAdmin || locked}
                  className="w-16 text-center font-bold text-lg tabular-nums"
                />
                <Button
                  size="icon"
                  variant="outline"
                  className="rounded-full h-10 w-10"
                  disabled={!isAdmin || locked}
                  onClick={() => adjust(m.id, 0.5)}
                >
                  +
                </Button>
              </div>
            </div>
          ))}
          {activeMembers.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">No active members.</div>
          )}
        </div>
      </Card>

      {isAdmin && !locked && activeMembers.length > 0 && (
        <Button onClick={save} size="lg" className="w-full sm:w-auto" disabled={saving}>
          <Save className="w-4 h-4 mr-2" /> {saving ? "Saving…" : "Save meals"}
        </Button>
      )}

      <Card className="p-6 gradient-card border-border/50 shadow-card">
        <h2 className="font-semibold mb-4">This month totals</h2>
        <div className="space-y-2">
          {data.perMember.map((m) => (
            <div key={m.id} className="flex justify-between p-2 rounded bg-secondary/40">
              <span className="text-sm">{m.name}</span>
              <span className="font-bold tabular-nums">{m.meals}</span>
            </div>
          ))}
          <div className="flex justify-between p-3 rounded bg-primary/10 mt-3 font-bold">
            <span>Total</span>
            <span className="tabular-nums">{data.totalMeals}</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Meals;
