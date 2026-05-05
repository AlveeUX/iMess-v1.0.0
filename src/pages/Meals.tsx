import { useState, useEffect, useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { useMonthData } from "@/hooks/useMessData";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Lock, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { cn } from "@/lib/utils";

const Meals = () => {
  const [cursor, setCursor] = useState(new Date());
  const { data, isLoading } = useMonthData(cursor);
  const { isAdmin, memberId: myMemberId } = useAuth();
  const qc = useQueryClient();

  const activeMembers = useMemo(
    () => (data?.members ?? []).filter((m) => m.is_active),
    [data]
  );

  // Selected member to view/edit. Defaults to my member, or first active for admins.
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  useEffect(() => {
    if (selectedMember) return;
    if (myMemberId) setSelectedMember(myMemberId);
    else if (isAdmin && activeMembers.length) setSelectedMember(activeMembers[0].id);
  }, [myMemberId, isAdmin, activeMembers, selectedMember]);

  const canEditSelected = isAdmin || (!!myMemberId && selectedMember === myMemberId);

  // Day editor dialog
  const [editDay, setEditDay] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("0");
  const [saving, setSaving] = useState(false);

  // Calendar grid
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // Map of date -> meal_count for selected member
  const mealsByDate = useMemo(() => {
    const m = new Map<string, number>();
    if (!data || !selectedMember) return m;
    for (const row of data.meals) {
      if (row.member_id !== selectedMember) continue;
      m.set(row.date, Number(row.meal_count));
    }
    return m;
  }, [data, selectedMember]);

  const memberTotal = useMemo(() => {
    let t = 0;
    mealsByDate.forEach((v) => (t += v));
    return t;
  }, [mealsByDate]);

  const openDay = (d: Date) => {
    if (!selectedMember) return;
    if (!isSameMonth(d, cursor)) return;
    if (data?.isClosed) return;
    if (!canEditSelected) return;
    const key = format(d, "yyyy-MM-dd");
    setEditDay(key);
    setEditValue(String(mealsByDate.get(key) ?? 0));
  };

  const saveDay = async () => {
    if (!editDay || !selectedMember) return;
    const value = Math.max(0, parseFloat(editValue || "0"));
    setSaving(true);
    try {
      if (value === 0) {
        const { error } = await supabase
          .from("meals")
          .delete()
          .eq("member_id", selectedMember)
          .eq("date", editDay);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("meals")
          .upsert(
            { member_id: selectedMember, date: editDay, meal_count: value },
            { onConflict: "member_id,date" }
          );
        if (error) throw error;
      }
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["month-data"] });
      setEditDay(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const quickSet = async (d: Date, value: number) => {
    if (!selectedMember || !canEditSelected || data?.isClosed) return;
    if (!isSameMonth(d, cursor)) return;
    const key = format(d, "yyyy-MM-dd");
    try {
      if (value === 0) {
        await supabase.from("meals").delete().eq("member_id", selectedMember).eq("date", key);
      } else {
        await supabase
          .from("meals")
          .upsert(
            { member_id: selectedMember, date: key, meal_count: value },
            { onConflict: "member_id,date" }
          );
      }
      qc.invalidateQueries({ queryKey: ["month-data"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading || !data) return <div className="text-muted-foreground">Loading…</div>;
  const locked = data.isClosed;
  const selectedMemberRow = activeMembers.find((m) => m.id === selectedMember);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meals</h1>
          <p className="text-muted-foreground mt-1">Tap any day to update your meal count</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(subMonths(cursor, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="font-semibold text-lg w-40 text-center tabular-nums">
            {format(cursor, "MMMM yyyy")}
          </div>
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Member selector — admins can pick anyone, members locked to themselves */}
      <Card className="p-4 gradient-card border-border/50 shadow-card flex flex-wrap items-center gap-3">
        <Label className="text-sm">Member</Label>
        <Select
          value={selectedMember ?? ""}
          onValueChange={(v) => setSelectedMember(v)}
          disabled={!isAdmin && !!myMemberId}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select member" />
          </SelectTrigger>
          <SelectContent>
            {activeMembers.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
                {m.id === myMemberId ? " (you)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-muted-foreground">
          Month total:{" "}
          <span className="font-bold text-foreground tabular-nums">{memberTotal}</span>
        </div>
      </Card>

      {locked && (
        <Card className="p-4 border-warning/40 bg-warning/5 flex items-center gap-3">
          <Lock className="w-4 h-4 text-warning" />
          <p className="text-sm">This month is closed. Meals cannot be edited.</p>
        </Card>
      )}

      {!myMemberId && !isAdmin && (
        <Card className="p-4 border-warning/40 bg-warning/5 text-sm">
          Your account isn't linked to a member yet. Ask an admin to link you.
        </Card>
      )}

      {/* Calendar grid */}
      <Card className="gradient-card border-border/50 shadow-card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-secondary/30">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-xs font-semibold text-muted-foreground text-center"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const inMonth = isSameMonth(d, cursor);
            const key = format(d, "yyyy-MM-dd");
            const count = mealsByDate.get(key) ?? 0;
            const today = isToday(d);
            const editable = inMonth && !locked && canEditSelected;
            return (
              <button
                key={key}
                onClick={() => openDay(d)}
                disabled={!editable}
                className={cn(
                  "relative aspect-square sm:aspect-[4/3] border-b border-r border-border p-2 text-left transition-colors",
                  "flex flex-col",
                  !inMonth && "bg-muted/20 text-muted-foreground/40",
                  inMonth && "hover:bg-primary/5",
                  editable && "cursor-pointer",
                  !editable && "cursor-default",
                  today && inMonth && "bg-primary/5"
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-xs font-medium tabular-nums",
                      today && inMonth && "text-primary font-bold"
                    )}
                  >
                    {format(d, "d")}
                  </span>
                  {today && inMonth && (
                    <span className="text-[10px] uppercase tracking-wide text-primary">
                      today
                    </span>
                  )}
                </div>
                <div className="flex-1 flex items-center justify-center">
                  {count > 0 ? (
                    <span
                      className={cn(
                        "inline-flex items-center justify-center min-w-10 h-10 px-2 rounded-full font-bold text-lg tabular-nums",
                        "bg-primary/15 text-primary"
                      )}
                    >
                      {count}
                    </span>
                  ) : inMonth ? (
                    <span className="text-xs text-muted-foreground/60">—</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Per-member totals */}
      <Card className="p-6 gradient-card border-border/50 shadow-card">
        <h2 className="font-semibold mb-4">This month totals</h2>
        <div className="space-y-2">
          {data.perMember.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex justify-between p-2 rounded bg-secondary/40",
                m.id === selectedMember && "ring-1 ring-primary/40"
              )}
            >
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

      {/* Day editor */}
      <Dialog open={!!editDay} onOpenChange={(o) => !o && setEditDay(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editDay && format(new Date(editDay), "EEEE, MMM d")}
              {selectedMemberRow && (
                <div className="text-sm font-normal text-muted-foreground mt-1">
                  {selectedMemberRow.name}
                </div>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="rounded-full h-12 w-12"
                onClick={() =>
                  setEditValue(String(Math.max(0, +(parseFloat(editValue || "0") - 0.5).toFixed(1))))
                }
              >
                −
              </Button>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-24 text-center font-bold text-2xl h-14 tabular-nums"
              />
              <Button
                variant="outline"
                size="icon"
                className="rounded-full h-12 w-12"
                onClick={() =>
                  setEditValue(String(+(parseFloat(editValue || "0") + 0.5).toFixed(1)))
                }
              >
                +
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((n) => (
                <Button
                  key={n}
                  variant={parseFloat(editValue || "0") === n ? "default" : "outline"}
                  onClick={() => setEditValue(String(n))}
                >
                  {n}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDay(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveDay} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Meals;
