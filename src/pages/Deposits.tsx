import { useState } from "react";
import { format } from "date-fns";
import { z } from "zod";
import { useMonthData, useMembers } from "@/hooks/useMessData";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/mess";

const schema = z.object({
  member_id: z.string().uuid("Pick a member"),
  amount: z.number().positive("Amount must be > 0").max(10_000_000),
  method: z.string().max(20),
  date: z.string(),
  note: z.string().max(200).optional(),
});

const Deposits = () => {
  const { data, isLoading } = useMonthData();
  const { data: allMembers } = useMembers();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    member_id: "",
    amount: "",
    method: "cash",
    date: format(new Date(), "yyyy-MM-dd"),
    note: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({
      ...form,
      amount: parseFloat(form.amount),
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    const { error } = await supabase.from("deposits").insert({
      member_id: form.member_id,
      amount: parseFloat(form.amount),
      method: form.method,
      date: form.date,
      note: form.note.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Deposit recorded");
    qc.invalidateQueries({ queryKey: ["month-data"] });
    setOpen(false);
    setForm({ member_id: "", amount: "", method: "cash", date: format(new Date(), "yyyy-MM-dd"), note: "" });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this deposit?")) return;
    const { error } = await supabase.from("deposits").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["month-data"] });
  };

  if (isLoading || !data) return <div className="text-muted-foreground">Loading…</div>;
  const locked = data.isClosed;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deposits</h1>
          <p className="text-muted-foreground mt-1">
            ৳{fmtMoney(data.totalDeposits)} this month
          </p>
        </div>
        {isAdmin && !locked && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="lg">
                <Plus className="w-4 h-4 mr-2" /> Add deposit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New deposit</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Member *</Label>
                  <Select value={form.member_id} onValueChange={(v) => setForm({ ...form, member_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                    <SelectContent>
                      {allMembers?.filter(m => m.is_active).map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Amount (৳) *</Label>
                    <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bkash">bKash</SelectItem>
                        <SelectItem value="nagad">Nagad</SelectItem>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Note</Label>
                  <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={200} rows={2} />
                </div>
                <Button type="submit" className="w-full" size="lg">Save deposit</Button>
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

      <div className="grid md:grid-cols-2 gap-4">
        {data.perMember.map((m) => (
          <Card key={m.id} className="p-4 gradient-card border-border/50 shadow-card flex items-center justify-between">
            <div>
              <div className="font-medium">{m.name}</div>
              <div className="text-xs text-muted-foreground">Total deposit</div>
            </div>
            <div className="text-xl font-bold text-primary tabular-nums">৳{fmtMoney(m.deposits)}</div>
          </Card>
        ))}
      </div>

      <Card className="gradient-card border-border/50 shadow-card overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">All deposits this month</div>
        <div className="divide-y divide-border">
          {data.deposits
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((d) => {
              const m = data.members.find((x) => x.id === d.member_id);
              return (
                <div key={d.id} className="flex items-center justify-between p-4 gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{m?.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(d.date), "MMM d")} · {d.method}
                      {d.note && ` · ${d.note}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold tabular-nums">৳{fmtMoney(Number(d.amount))}</span>
                    {isAdmin && !locked && (
                      <Button size="icon" variant="ghost" onClick={() => remove(d.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          {data.deposits.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">No deposits yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Deposits;
