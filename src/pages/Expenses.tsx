import { useState } from "react";
import { format } from "date-fns";
import { z } from "zod";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/mess";

const schema = z.object({
  title: z.string().trim().min(1).max(80),
  amount: z.number().positive().max(10_000_000),
  category: z.string().max(20),
  date: z.string(),
});

const Expenses = () => {
  const { data, isLoading } = useMonthData();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    amount: "",
    category: "bazar",
    date: format(new Date(), "yyyy-MM-dd"),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ ...form, amount: parseFloat(form.amount) });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    const { error } = await supabase.from("expenses").insert({
      title: form.title.trim(),
      amount: parseFloat(form.amount),
      category: form.category,
      date: form.date,
    });
    if (error) return toast.error(error.message);
    toast.success("Expense added");
    qc.invalidateQueries({ queryKey: ["month-data"] });
    setOpen(false);
    setForm({ title: "", amount: "", category: "bazar", date: format(new Date(), "yyyy-MM-dd") });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["month-data"] });
  };

  if (isLoading || !data) return <div className="text-muted-foreground">Loading…</div>;
  const locked = data.isClosed;

  // group by category
  const byCat = data.expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bazar & Expenses</h1>
          <p className="text-muted-foreground mt-1">
            ৳{fmtMoney(data.totalExpense)} this month
          </p>
        </div>
        {isAdmin && !locked && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="lg"><Plus className="w-4 h-4 mr-2" /> Add expense</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New expense</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={80} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Amount (৳) *</Label>
                    <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bazar">Bazar</SelectItem>
                        <SelectItem value="utility">Utility</SelectItem>
                        <SelectItem value="gas">Gas</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <Button type="submit" className="w-full" size="lg">Save expense</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {locked && (
        <Card className="p-4 border-warning/40 bg-warning/5 flex items-center gap-3">
          <Lock className="w-4 h-4 text-warning" /> <p className="text-sm">Month closed.</p>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(byCat).map(([cat, amt]) => (
          <Card key={cat} className="p-4 gradient-card border-border/50">
            <div className="text-xs uppercase text-muted-foreground tracking-wider">{cat}</div>
            <div className="text-xl font-bold mt-1 tabular-nums">৳{fmtMoney(amt)}</div>
          </Card>
        ))}
      </div>

      <Card className="gradient-card border-border/50 shadow-card overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">All expenses this month</div>
        <div className="divide-y divide-border">
          {data.expenses
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((e) => (
              <div key={e.id} className="flex items-center justify-between p-4 gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{e.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(e.date), "MMM d")} · {e.category}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold tabular-nums">৳{fmtMoney(Number(e.amount))}</span>
                  {isAdmin && !locked && (
                    <Button size="icon" variant="ghost" onClick={() => remove(e.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          {data.expenses.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">No expenses yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Expenses;
