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
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Lock, Check, X, Clock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/mess";
import { useSearchParams } from "react-router-dom";

const schema = z.object({
  member_id: z.string().uuid("Pick a member"),
  amount: z.number().positive("Amount must be > 0").max(10_000_000),
  method: z.string().max(20),
  date: z.string(),
  note: z.string().max(200).optional(),
});

const statusBadge = (status: string) => {
  const m: Record<string, { cls: string; label: string; icon: any }> = {
    pending: { cls: "bg-warning/15 text-warning border-warning/30", label: "Pending", icon: Clock },
    approved: { cls: "bg-success/15 text-success border-success/30", label: "Approved", icon: Check },
    rejected: { cls: "bg-destructive/15 text-destructive border-destructive/30", label: "Rejected", icon: X },
  };
  const s = m[status] ?? m.approved;
  const Icon = s.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${s.cls}`}>
      <Icon className="w-3 h-3" /> {s.label}
    </Badge>
  );
};

const Deposits = () => {
  const { data, isLoading } = useMonthData();
  const { data: allMembers } = useMembers();
  const { isAdmin, memberId, user } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as "pending" | "approved" | "rejected" | "all") ?? "all";
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState<any>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [form, setForm] = useState({
    member_id: "",
    amount: "",
    method: "cash",
    date: format(new Date(), "yyyy-MM-dd"),
    note: "",
  });

  const canSubmit = isAdmin || !!memberId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Members can only submit for their own member record
    const targetMember = isAdmin ? form.member_id : memberId!;
    const parsed = schema.safeParse({
      ...form,
      member_id: targetMember,
      amount: parseFloat(form.amount),
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    const { error } = await supabase.from("deposits").insert({
      member_id: targetMember,
      amount: parseFloat(form.amount),
      method: form.method,
      date: form.date,
      note: form.note.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success(isAdmin ? "Deposit recorded" : "Deposit submitted for approval");
    qc.invalidateQueries({ queryKey: ["month-data"] });
    setOpen(false);
    setForm({ member_id: "", amount: "", method: "cash", date: format(new Date(), "yyyy-MM-dd"), note: "" });
  };

  const review = async (status: "approved" | "rejected") => {
    if (!reviewing || !user) return;
    const { error } = await supabase
      .from("deposits")
      .update({
        status,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote.trim() || null,
      })
      .eq("id", reviewing.id);
    if (error) return toast.error(error.message);
    toast.success(`Deposit ${status}`);
    qc.invalidateQueries({ queryKey: ["month-data"] });
    setReviewing(null);
    setReviewNote("");
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this deposit?")) return;
    const { error } = await supabase.from("deposits").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["month-data"] });
  };

  // Inline resubmit: a rejected (non-bazar-linked) deposit can be edited
  // in place and sent back to pending, instead of a dialog / new row.
  const [resubmittingId, setResubmittingId] = useState<string | null>(null);
  const [resubmitForm, setResubmitForm] = useState({ amount: "", method: "cash", date: format(new Date(), "yyyy-MM-dd"), note: "" });
  const [resubmitSaving, setResubmitSaving] = useState(false);

  const startResubmit = (d: any) => {
    setResubmittingId(d.id);
    setResubmitForm({ amount: String(d.amount), method: d.method, date: d.date, note: d.note ?? "" });
  };
  const cancelResubmit = () => setResubmittingId(null);

  const saveResubmit = async () => {
    const amount = parseFloat(resubmitForm.amount);
    if (!amount || amount <= 0) return toast.error("Amount must be > 0");
    setResubmitSaving(true);
    try {
      const { error } = await supabase
        .from("deposits")
        .update({
          amount,
          method: resubmitForm.method,
          date: resubmitForm.date,
          note: resubmitForm.note.trim() || null,
        })
        .eq("id", resubmittingId);
      if (error) throw error;
      toast.success("Resubmitted for admin approval");
      qc.invalidateQueries({ queryKey: ["month-data"] });
      setResubmittingId(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setResubmitSaving(false);
    }
  };

  if (isLoading || !data) return <div className="text-muted-foreground">Loading…</div>;
  const locked = data.isClosed;

  // Visible deposits: admin sees all; member sees own (any status) + others' approved
  const allDeposits = data.deposits as any[];
  let visible = allDeposits;
  if (!isAdmin) {
    visible = allDeposits.filter(
      (d) => d.status === "approved" || d.submitted_by === user?.id
    );
  }
  if (tab !== "all") visible = visible.filter((d) => (d.status ?? "approved") === tab);

  const counts = {
    pending: allDeposits.filter((d) => d.status === "pending" && (isAdmin || d.submitted_by === user?.id)).length,
    approved: allDeposits.filter((d) => (d.status ?? "approved") === "approved").length,
    rejected: allDeposits.filter((d) => d.status === "rejected" && (isAdmin || d.submitted_by === user?.id)).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deposits</h1>
          <p className="text-muted-foreground mt-1">
            Approved: ৳{fmtMoney(data.totalDeposits)}
            {(data as any).pendingDepositTotal > 0 && (
              <> · Pending: ৳{fmtMoney((data as any).pendingDepositTotal)}</>
            )}
          </p>
        </div>
        {canSubmit && !locked && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="lg">
                <Plus className="w-4 h-4 mr-2" /> {isAdmin ? "Add deposit" : "Submit deposit"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{isAdmin ? "New deposit" : "Submit deposit for approval"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                {isAdmin ? (
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
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Submitting deposit for your account. It will be marked <strong>pending</strong> until an admin approves.
                  </p>
                )}
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
                <Button type="submit" className="w-full" size="lg">
                  {isAdmin ? "Save deposit" : "Submit for approval"}
                </Button>
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

      <Tabs value={tab} onValueChange={(v) => { params.set("tab", v); setParams(params, { replace: true }); }}>
        <TabsList className="grid grid-cols-4 w-full sm:w-auto">
          <TabsTrigger value="all">All <span className="ml-1 opacity-60">{visible.length}</span></TabsTrigger>
          <TabsTrigger value="pending">Pending <span className="ml-1 opacity-60">{counts.pending}</span></TabsTrigger>
          <TabsTrigger value="approved">Approved <span className="ml-1 opacity-60">{counts.approved}</span></TabsTrigger>
          <TabsTrigger value="rejected">Rejected <span className="ml-1 opacity-60">{counts.rejected}</span></TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid md:grid-cols-2 gap-4">
        {data.perMember.map((m) => (
          <Card key={m.id} className="p-4 gradient-card border-border/50 shadow-card flex items-center justify-between">
            <div>
              <div className="font-medium">{m.name}</div>
              <div className="text-xs text-muted-foreground">Approved deposits this month</div>
            </div>
            <div className="text-xl font-bold text-primary tabular-nums">৳{fmtMoney(m.deposits)}</div>
          </Card>
        ))}
      </div>

      <Card className="gradient-card border-border/50 shadow-card overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">Deposits this month</div>
        <div className="divide-y divide-border">
          {visible
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((d) => {
              const m = data.members.find((x) => x.id === d.member_id);
              const status = d.status ?? "approved";
              const isAuto = !!d.source_expense_id;

              if (resubmittingId === d.id) {
                return (
                  <div key={d.id} className="p-4 bg-warning/5 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center gap-2 text-xs font-medium text-warning">
                      <RotateCcw className="w-3.5 h-3.5" /> Resubmitting — edit and send back to admin
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={resubmitForm.amount}
                        onChange={(ev) => setResubmitForm({ ...resubmitForm, amount: ev.target.value })}
                        placeholder="Amount"
                        className="h-9"
                      />
                      <Select value={resubmitForm.method} onValueChange={(v) => setResubmitForm({ ...resubmitForm, method: v })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="bkash">bKash</SelectItem>
                          <SelectItem value="nagad">Nagad</SelectItem>
                          <SelectItem value="bank">Bank</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="date"
                        value={resubmitForm.date}
                        onChange={(ev) => setResubmitForm({ ...resubmitForm, date: ev.target.value })}
                        className="h-9"
                      />
                    </div>
                    <Input
                      value={resubmitForm.note}
                      onChange={(ev) => setResubmitForm({ ...resubmitForm, note: ev.target.value })}
                      placeholder="Note (optional)"
                      maxLength={200}
                      className="h-9"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={cancelResubmit} disabled={resubmitSaving}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={saveResubmit} disabled={resubmitSaving}>
                        <Check className="w-4 h-4 mr-2" /> {resubmitSaving ? "Sending…" : "Resubmit"}
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={d.id} className="flex items-center justify-between p-4 gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{m?.name}</span>
                      {statusBadge(status)}
                      {isAuto && (
                        <Badge variant="outline" className="gap-1 bg-primary/10 text-primary border-primary/30">
                          From bazar
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {format(new Date(d.date), "MMM d")} · {d.method}
                      {d.note && ` · ${d.note}`}
                      {d.review_note && ` · "${d.review_note}"`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold tabular-nums">৳{fmtMoney(Number(d.amount))}</span>
                    {isAdmin && status === "pending" && !locked && !isAuto && (
                      <Button size="sm" onClick={() => { setReviewing(d); setReviewNote(""); }}>Review</Button>
                    )}
                    {!isAdmin && !isAuto && status === "rejected" && d.submitted_by === user?.id && !locked && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="transition-transform active:scale-[0.97]"
                        onClick={() => startResubmit(d)}
                      >
                        <RotateCcw className="w-4 h-4 mr-2" /> Resubmit
                      </Button>
                    )}
                    {!isAuto && ((isAdmin && !locked) ||
                      (!isAdmin && status === "pending" && d.submitted_by === user?.id && !locked)) && (
                      <Button size="icon" variant="ghost" aria-label="Delete deposit" onClick={() => remove(d.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                    {isAuto && (
                      <span className="text-xs text-muted-foreground italic">Edit on Bazar</span>
                    )}
                  </div>
                </div>
              );
            })}
          {visible.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">No deposits.</div>
          )}
        </div>
      </Card>

      <Dialog open={!!reviewing} onOpenChange={(o) => { if (!o) setReviewing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Review deposit</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <p className="font-medium">
              {reviewing && data.members.find((x) => x.id === reviewing.member_id)?.name}
            </p>
            <p className="text-sm text-muted-foreground">
              ৳{reviewing && fmtMoney(Number(reviewing.amount))} · {reviewing?.method}
              {reviewing?.note && ` · ${reviewing.note}`}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Textarea
              rows={3}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Why approve / reject?"
              maxLength={300}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => review("rejected")}>
              <X className="w-4 h-4 mr-2" /> Reject
            </Button>
            <Button onClick={() => review("approved")}>
              <Check className="w-4 h-4 mr-2" /> Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Deposits;
