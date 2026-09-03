import { useState } from "react";
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
  getDaysInMonth,
  getDate,
} from "date-fns";
import { useHousekeeper, useHousekeeperAttendance, calculatePerVisitAmount } from "@/hooks/useHousekeeper";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Phone,
  Pencil,
  SprayCan,
  Wallet,
  CalendarCheck,
  CalendarX,
  BadgeDollarSign,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/mess";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1, "Name required").max(60),
  phone: z.string().trim().max(20).optional(),
  monthly_rent: z.number().min(0).max(10_000_000).optional(),
  visits_per_day: z.number().int().min(1).max(10),
});

const dayCost = (v1: boolean, v2: boolean, perVisit: number) =>
  ((v1 ? 1 : 0) + (v2 ? 1 : 0)) * perVisit;

const SummaryTile = ({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) => (
  <Card className="p-5 gradient-card border-border/50 shadow-card">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      </div>
      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary" />
      </div>
    </div>
  </Card>
);

const Maid = () => {
  const [cursor, setCursor] = useState(new Date());
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data: housekeeper, isLoading: hkLoading } = useHousekeeper();
  const { data: attendance, isLoading: attLoading } = useHousekeeperAttendance(
    housekeeper?.id,
    cursor
  );

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    monthly_rent: "",
    visits_per_day: "2",
  });
  const [saving, setSaving] = useState(false);

  const [dayOpen, setDayOpen] = useState<string | null>(null);

  const openEdit = () => {
    setForm({
      name: housekeeper?.name ?? "",
      phone: housekeeper?.phone ?? "",
      monthly_rent: housekeeper?.monthly_rent != null ? String(housekeeper.monthly_rent) : "",
      visits_per_day: housekeeper?.visits_per_day != null ? String(housekeeper.visits_per_day) : "2",
    });
    setEditOpen(true);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({
      name: form.name,
      phone: form.phone || undefined,
      monthly_rent: form.monthly_rent ? parseFloat(form.monthly_rent) : undefined,
      visits_per_day: parseInt(form.visits_per_day || "2", 10),
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      monthly_rent: form.monthly_rent ? parseFloat(form.monthly_rent) : null,
      visits_per_day: parseInt(form.visits_per_day || "2", 10),
    };
    try {
      const { error } = housekeeper
        ? await supabase.from("housekeeper").update(payload).eq("id", housekeeper.id)
        : await supabase.from("housekeeper").insert(payload);
      if (error) throw error;
      toast.success(housekeeper ? "Updated" : "Maid profile added");
      qc.invalidateQueries({ queryKey: ["housekeeper"] });
      setEditOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    if (!housekeeper) return;
    const { error } = await supabase
      .from("housekeeper")
      .update({ is_active: !housekeeper.is_active })
      .eq("id", housekeeper.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["housekeeper"] });
  };

  const attendanceByDate = new Map<string, { visit_1_present: boolean; visit_2_present: boolean }>();
  (attendance ?? []).forEach((row) => {
    attendanceByDate.set(row.date, {
      visit_1_present: row.visit_1_present,
      visit_2_present: row.visit_2_present,
    });
  });
  const visitsFor = (key: string) => attendanceByDate.get(key) ?? { visit_1_present: true, visit_2_present: true };

  const visitsPerDay = housekeeper?.visits_per_day ?? 2;
  const perVisitForDate = (d: Date) => calculatePerVisitAmount(housekeeper?.monthly_rent, visitsPerDay, d);

  const setVisit = async (key: string, field: "visit_1_present" | "visit_2_present", value: boolean) => {
    if (!housekeeper) return;
    const current = visitsFor(key);
    const payload = {
      housekeeper_id: housekeeper.id,
      date: key,
      visit_1_present: field === "visit_1_present" ? value : current.visit_1_present,
      visit_2_present: field === "visit_2_present" ? value : current.visit_2_present,
    };
    const { error } = await supabase
      .from("housekeeper_attendance")
      .upsert(payload, { onConflict: "housekeeper_id,date" });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["housekeeper-attendance"] });
  };

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const now = new Date();
  const todayKey = format(now, "yyyy-MM-dd");
  const isCurrentMonth = isSameMonth(cursor, now);
  const daysInCursorMonth = getDaysInMonth(cursor);
  const perVisitThisMonth = calculatePerVisitAmount(housekeeper?.monthly_rent, visitsPerDay, cursor);

  let visitsPresent = 0;
  let visitsAbsent = 0;
  let totalCost = 0;
  let payableSoFar = 0;
  monthDays.forEach((d) => {
    const key = format(d, "yyyy-MM-dd");
    const { visit_1_present, visit_2_present } = visitsFor(key);
    const cost = dayCost(visit_1_present, visit_2_present, perVisitForDate(d));
    visitsPresent += (visit_1_present ? 1 : 0) + (visit_2_present ? 1 : 0);
    visitsAbsent += (visit_1_present ? 0 : 1) + (visit_2_present ? 0 : 1);
    totalCost += cost;
    if (!isCurrentMonth || key <= todayKey) payableSoFar += cost;
  });
  const remainingDays = isCurrentMonth ? daysInCursorMonth - getDate(now) : 0;
  const projectedTotal = payableSoFar + remainingDays * visitsPerDay * perVisitThisMonth;

  const isLoading = hkLoading || (!!housekeeper && attLoading);
  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;

  const dayInfo = dayOpen ? visitsFor(dayOpen) : null;
  const dayCostValue = dayInfo && dayOpen ? dayCost(dayInfo.visit_1_present, dayInfo.visit_2_present, perVisitForDate(new Date(dayOpen))) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Maid</h1>
          <p className="text-muted-foreground mt-1">Attendance and cost tracking for the maid.</p>
        </div>
        {housekeeper && (
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
          </div>
        )}
      </div>

      {/* Profile card */}
      <Card className="p-5 gradient-card border-border/50 shadow-card">
        {!housekeeper ? (
          <div className="text-center py-6">
            <SprayCan className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-muted-foreground">No maid profile yet.</p>
            {isAdmin && (
              <Button className="mt-4" onClick={openEdit}>
                Add maid
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-4 flex-wrap">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
              {housekeeper.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold text-base">{housekeeper.name}</h2>
                <Badge variant={housekeeper.is_active ? "outline" : "secondary"} className="text-xs">
                  {housekeeper.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              {housekeeper.phone && (
                <a
                  href={`tel:${housekeeper.phone}`}
                  className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary w-fit"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {housekeeper.phone}
                </a>
              )}
              <div className="mt-3 grid grid-cols-3 gap-3 text-xs max-w-md">
                <div>
                  <div className="text-muted-foreground">Monthly rent</div>
                  <div className="font-semibold tabular-nums">
                    {housekeeper.monthly_rent != null ? `৳${fmtMoney(Number(housekeeper.monthly_rent))}` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Per visit (calculated)</div>
                  <div className="font-semibold tabular-nums">৳{fmtMoney(perVisitThisMonth)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Visits/day</div>
                  <div className="font-semibold tabular-nums">{housekeeper.visits_per_day}</div>
                </div>
              </div>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <Switch checked={housekeeper.is_active} onCheckedChange={toggleActive} />
                  <span className="text-xs text-muted-foreground">Active</span>
                </div>
                <Button size="icon" variant="ghost" aria-label="Edit maid profile" onClick={openEdit}>
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {housekeeper && (
        <>
          {/* Month summary */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <SummaryTile label="Visits present" value={String(visitsPresent)} icon={CalendarCheck} />
            <SummaryTile label="Visits absent" value={String(visitsAbsent)} icon={CalendarX} />
            <SummaryTile label="Total cost" value={`৳${fmtMoney(totalCost)}`} icon={Wallet} />
          </div>

          {/* Payable amount — read-only for every role, recomputed live from the
              same attendance/profile query data already powering the calendar. */}
          <Card className="p-5 gradient-card border-border/50 shadow-card">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                <BadgeDollarSign className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-semibold">Payable Amount</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Payable so far</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">৳{fmtMoney(payableSoFar)}</p>
              </div>
              {isCurrentMonth && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Projected full month
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">৳{fmtMoney(projectedTotal)}</p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
              Based on ৳{fmtMoney(Number(housekeeper.monthly_rent ?? 0))} rent ÷ ({visitsPerDay} visits ×{" "}
              {daysInCursorMonth} days this month) = ৳{fmtMoney(perVisitThisMonth)} per visit.
            </p>
          </Card>

          {/* Attendance calendar */}
          <Card className="gradient-card border-border/50 shadow-card overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border bg-secondary/30">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="px-2 py-2 text-xs font-semibold text-muted-foreground text-center">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const inMonth = isSameMonth(d, cursor);
                const key = format(d, "yyyy-MM-dd");
                const { visit_1_present, visit_2_present } = visitsFor(key);
                const cost = dayCost(visit_1_present, visit_2_present, perVisitForDate(d));
                const today = isToday(d);

                const cellInner = (
                  <>
                    <span
                      className={cn(
                        "text-xs font-medium tabular-nums",
                        today && inMonth && "text-primary font-bold"
                      )}
                    >
                      {format(d, "d")}
                    </span>
                    <div className="flex-1 flex flex-col items-center justify-center gap-1">
                      {inMonth && (
                        <>
                          <div className="flex items-center gap-1">
                            <span
                              title="Visit 1"
                              className={cn(
                                "w-2 h-2 rounded-full",
                                visit_1_present ? "bg-success" : "bg-destructive/50"
                              )}
                            />
                            <span
                              title="Visit 2"
                              className={cn(
                                "w-2 h-2 rounded-full",
                                visit_2_present ? "bg-success" : "bg-destructive/50"
                              )}
                            />
                          </div>
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            ৳{fmtMoney(cost)}
                          </span>
                        </>
                      )}
                    </div>
                  </>
                );

                const cellClasses = cn(
                  "relative aspect-square border-b border-r border-border p-1 text-left",
                  "flex flex-col items-center",
                  !inMonth && "bg-muted/20 text-muted-foreground/40",
                  today && inMonth && "bg-primary/5"
                );

                return isAdmin ? (
                  <button
                    key={key}
                    onClick={() => inMonth && setDayOpen(key)}
                    disabled={!inMonth}
                    className={cn(cellClasses, "transition-colors", inMonth && "hover:bg-primary/5 cursor-pointer")}
                  >
                    {cellInner}
                  </button>
                ) : (
                  <div key={key} className={cellClasses}>
                    {cellInner}
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {/* Profile edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{housekeeper ? "Edit maid profile" : "Add maid"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} required />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={20} />
            </div>
            <div className="space-y-2">
              <Label>Monthly rent (৳)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.monthly_rent}
                onChange={(e) => setForm({ ...form, monthly_rent: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Visits per day</Label>
              <Input
                type="number"
                step="1"
                min="1"
                max="10"
                value={form.visits_per_day}
                onChange={(e) => setForm({ ...form, visits_per_day: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Per visit (this month): ৳
                {fmtMoney(
                  calculatePerVisitAmount(
                    parseFloat(form.monthly_rent || "0"),
                    parseInt(form.visits_per_day || "0", 10),
                    new Date()
                  )
                )}{" "}
                — calculated as Monthly rent ÷ (Visits per day × {getDaysInMonth(new Date())} days this month)
              </p>
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={saving}>
              {saving ? "Saving…" : housekeeper ? "Update" : "Add maid"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Day editor (admin only — non-admins never render the button that opens this) */}
      <Dialog open={!!dayOpen} onOpenChange={(o) => !o && setDayOpen(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{dayOpen && format(new Date(dayOpen), "EEEE, MMM d")}</DialogTitle>
          </DialogHeader>
          {dayInfo && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <Label className="text-sm">Visit 1</Label>
                <Switch
                  checked={dayInfo.visit_1_present}
                  onCheckedChange={(v) => dayOpen && setVisit(dayOpen, "visit_1_present", v)}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <Label className="text-sm">Visit 2</Label>
                <Switch
                  checked={dayInfo.visit_2_present}
                  onCheckedChange={(v) => dayOpen && setVisit(dayOpen, "visit_2_present", v)}
                />
              </div>
              <div className="flex justify-between p-3 rounded-lg bg-primary/10 font-bold text-sm">
                <span>Day cost</span>
                <span className="tabular-nums">৳{fmtMoney(dayCostValue)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDayOpen(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Maid;
