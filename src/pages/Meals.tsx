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
import { Textarea } from "@/components/ui/textarea";
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
import { Lock, ChevronLeft, ChevronRight, Save, Plane, Trash2, X } from "lucide-react";
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

  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  useEffect(() => {
    if (selectedMember) return;
    if (myMemberId) setSelectedMember(myMemberId);
    else if (isAdmin && activeMembers.length) setSelectedMember(activeMembers[0].id);
  }, [myMemberId, isAdmin, activeMembers, selectedMember]);

  const canEditSelected = isAdmin || (!!myMemberId && selectedMember === myMemberId);

  const [editDay, setEditDay] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("0");
  const [hadEntry, setHadEntry] = useState(false);
  const [saving, setSaving] = useState(false);

  // Away dialog
  const [awayOpen, setAwayOpen] = useState(false);
  const [awayForm, setAwayForm] = useState({
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(new Date(), "yyyy-MM-dd"),
    note: "",
  });
  const [awaySaving, setAwaySaving] = useState(false);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // meal_count map (includes explicit 0). Separate "hasEntry" set for empty vs zero.
  const { mealsByDate, hasEntryDate } = useMemo(() => {
    const m = new Map<string, number>();
    const h = new Set<string>();
    if (!data || !selectedMember) return { mealsByDate: m, hasEntryDate: h };
    for (const row of data.meals) {
      if (row.member_id !== selectedMember) continue;
      m.set(row.date, Number(row.meal_count));
      h.add(row.date);
    }
    return { mealsByDate: m, hasEntryDate: h };
  }, [data, selectedMember]);

  const awayDates: Set<string> = useMemo(() => {
    if (!data || !selectedMember) return new Set();
    return data.awayByMemberDate?.get(selectedMember) ?? new Set();
  }, [data, selectedMember]);

  const memberTotal = useMemo(() => {
    let t = 0;
    mealsByDate.forEach((v, d) => {
      if (!awayDates.has(d)) t += v;
    });
    return t;
  }, [mealsByDate, awayDates]);

  const memberAwayPeriods = useMemo(() => {
    if (!data || !selectedMember) return [];
    return (data.awayPeriods ?? [])
      .filter((a: any) => a.member_id === selectedMember)
      .sort((a: any, b: any) => a.start_date.localeCompare(b.start_date));
  }, [data, selectedMember]);

  const openDay = (d: Date) => {
    if (!selectedMember) return;
    if (!isSameMonth(d, cursor)) return;
    if (data?.isClosed) return;
    if (!canEditSelected) return;
    const key = format(d, "yyyy-MM-dd");
    if (awayDates.has(key) && !isAdmin) {
      toast.info("This day is inside an away period — remove the period to edit.");
      return;
    }
    setEditDay(key);
    setEditValue(String(mealsByDate.get(key) ?? 0));
    setHadEntry(hasEntryDate.has(key));
  };

  const saveDay = async () => {
    if (!editDay || !selectedMember) return;
    const value = Math.max(0, parseFloat(editValue || "0"));
    setSaving(true);
    try {
      const { error } = await supabase
        .from("meals")
        .upsert(
          { member_id: selectedMember, date: editDay, meal_count: value },
          { onConflict: "member_id,date" }
        );
      if (error) throw error;
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["month-data"] });
      setEditDay(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const clearDay = async () => {
    if (!editDay || !selectedMember) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("meals")
        .delete()
        .eq("member_id", selectedMember)
        .eq("date", editDay);
      if (error) throw error;
      toast.success("Cleared");
      qc.invalidateQueries({ queryKey: ["month-data"] });
      setEditDay(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const submitAway = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;
    if (awayForm.end_date < awayForm.start_date) {
      return toast.error("End date must be on or after start date");
    }
    setAwaySaving(true);
    try {
      const { error } = await supabase.from("member_away_periods").insert({
        member_id: selectedMember,
        start_date: awayForm.start_date,
        end_date: awayForm.end_date,
        note: awayForm.note.trim() || null,
      });
      if (error) throw error;
      toast.success("Away period saved");
      setAwayOpen(false);
      setAwayForm({
        start_date: format(new Date(), "yyyy-MM-dd"),
        end_date: format(new Date(), "yyyy-MM-dd"),
        note: "",
      });
      qc.invalidateQueries({ queryKey: ["month-data"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAwaySaving(false);
    }
  };

  const removeAway = async (id: string) => {
    if (!confirm("Remove this away period?")) return;
    const { error } = await supabase.from("member_away_periods").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["month-data"] });
  };

  if (isLoading || !data) return <div className="text-muted-foreground">Loading…</div>;
  const locked = data.isClosed;
  const selectedMemberRow = activeMembers.find((m) => m.id === selectedMember);
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meals</h1>
          <p className="text-muted-foreground mt-1">
            Tap any day to update your meal count. Use 0 for "no meals", or set away periods for longer breaks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setCursor(subMonths(cursor, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="font-semibold text-lg w-40 text-center tabular-nums">
            {format(cursor, "MMMM yyyy")}
          </div>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          {canEditSelected && (
            <Button variant="outline" onClick={() => setAwayOpen(true)} disabled={locked}>
              <Plane className="w-4 h-4 mr-2" /> Away
            </Button>
          )}
        </div>
      </div>

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

      {/* Away period chips */}
      {memberAwayPeriods.length > 0 && (
        <Card className="p-4 gradient-card border-border/50 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <Plane className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Away periods</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {memberAwayPeriods.map((a: any) => {
              const canRemove = isAdmin || (canEditSelected && a.start_date > today);
              return (
                <div
                  key={a.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-sm border border-border"
                >
                  <span className="tabular-nums">
                    {format(new Date(a.start_date), "MMM d")} → {format(new Date(a.end_date), "MMM d")}
                  </span>
                  {a.note && <span className="text-muted-foreground text-xs italic">· {a.note}</span>}
                  {canRemove && (
                    <button
                      aria-label="Remove away period"
                      onClick={() => removeAway(a.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
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
            const count = mealsByDate.get(key);
            const hasEntry = hasEntryDate.has(key);
            const isAway = awayDates.has(key);
            const today = isToday(d);
            const editable = inMonth && !locked && canEditSelected && (!isAway || isAdmin);
            return (
              <button
                key={key}
                onClick={() => openDay(d)}
                disabled={!editable}
                className={cn(
                  "relative aspect-square sm:aspect-[4/3] border-b border-r border-border p-2 text-left transition-colors",
                  "flex flex-col",
                  !inMonth && "bg-muted/20 text-muted-foreground/40",
                  inMonth && !isAway && "hover:bg-primary/5",
                  inMonth && isAway && "bg-muted/40",
                  editable && "cursor-pointer",
                  !editable && "cursor-default",
                  today && inMonth && !isAway && "bg-primary/5"
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
                  {isAway && inMonth ? (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      away
                    </span>
                  ) : today && inMonth ? (
                    <span className="text-[10px] uppercase tracking-wide text-primary">
                      today
                    </span>
                  ) : null}
                </div>
                <div className="flex-1 flex items-center justify-center">
                  {isAway && inMonth ? (
                    <Plane className="w-4 h-4 text-muted-foreground/60" />
                  ) : hasEntry && (count ?? 0) > 0 ? (
                    <span
                      className={cn(
                        "inline-flex items-center justify-center min-w-10 h-10 px-2 rounded-full font-bold text-lg tabular-nums",
                        "bg-primary/15 text-primary"
                      )}
                    >
                      {count}
                    </span>
                  ) : hasEntry ? (
                    <span
                      className="inline-flex items-center justify-center min-w-10 h-10 px-2 rounded-full font-bold text-lg tabular-nums bg-muted text-muted-foreground"
                      title="0 meals (logged)"
                    >
                      0
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
                aria-label="Decrease meal count"
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
                aria-label="Increase meal count"
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
            <p className="text-xs text-muted-foreground text-center">
              Save 0 to log "no meals" for the day. Use Clear to remove the entry entirely.
            </p>
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            {hadEntry && (
              <Button variant="outline" onClick={clearDay} disabled={saving}>
                <Trash2 className="w-4 h-4 mr-2" /> Clear day
              </Button>
            )}
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

      {/* Away dialog */}
      <Dialog open={awayOpen} onOpenChange={setAwayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark away period</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitAway} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Days in this range will count as 0 meals on the calendar. Future ranges are auto-approved;
              ranges that include past or closed-month dates need admin approval.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input
                  type="date"
                  required
                  value={awayForm.start_date}
                  onChange={(e) => setAwayForm({ ...awayForm, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>End date</Label>
                <Input
                  type="date"
                  required
                  value={awayForm.end_date}
                  onChange={(e) => setAwayForm({ ...awayForm, end_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea
                rows={2}
                maxLength={300}
                value={awayForm.note}
                placeholder="e.g. Going home for Eid"
                onChange={(e) => setAwayForm({ ...awayForm, note: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAwayOpen(false)} disabled={awaySaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={awaySaving}>
                {awaySaving ? "Saving…" : "Save away period"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Meals;
