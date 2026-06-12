import { useState, useMemo } from "react";
import { format } from "date-fns";
import { z } from "zod";
import { useMonthData } from "@/hooks/useMessData";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Plus, Trash2, Lock, Check, X, Clock, ShoppingBasket, Pencil } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/mess";
import { useSearchParams, Link } from "react-router-dom";

const schema = z.object({
  title: z.string().trim().min(1, "Title required").max(80),
  amount: z.number().positive("Amount must be > 0").max(10_000_000),
  category: z.string().max(20),
  date: z.string(),
});

const statusBadge = (status: string) => {
  const m: Record<string, { cls: string; label: string; icon: any }> = {
    pending: { cls: "bg-warning/15 text-warning border-warning/30", label: "Pending", icon: Clock },
    approved: { cls: "bg-success/15 text-success border-success/30", label: "Approved", icon: Check },
    rejected: { cls: "bg-destructive/15 text-destructive border-destructive/30", label: "Rejected", icon: X },
  };
  const s = m[status] ?? m.pending;
  const Icon = s.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${s.cls}`}>
      <Icon className="w-3 h-3" /> {s.label}
    </Badge>
  );
};

const Bazar = () => {
  const { data, isLoading } = useMonthData();
  const { isAdmin, isContributor, user } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as "pending" | "approved" | "rejected" | "all") ?? "all";
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<any>(null);
  const [reviewNote, setReviewNote] = useState("");
  const blankForm = () => ({
    title: "",
    amount: "",
    category: "bazar",
    date: format(new Date(), "yyyy-MM-dd"),
  });
  const [form, setForm] = useState(blankForm());

  const openCreate = () => {
    setEditingId(null);
    setForm(blankForm());
    setOpen(true);
  };

  const openEdit = (e: any) => {
    setEditingId(e.id);
    setForm({
      title: e.title,
      amount: String(e.amount),
      category: e.category,
      date: e.date,
    });
    setOpen(true);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const parsed = schema.safeParse({ ...form, amount: parseFloat(form.amount) });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    const payload = {
      title: form.title.trim(),
      amount: parseFloat(form.amount),
      category: form.category,
      date: form.date,
    };
    if (editingId) {
      const { error } = await supabase.from("expenses").update(payload).eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Bazar updated");
    } else {
      const { error } = await supabase.from("expenses").insert(payload);
      if (error) return toast.error(error.message);
      toast.success(isAdmin ? "Bazar added" : "Bazar submitted for approval");
    }
    qc.invalidateQueries({ queryKey: ["month-data"] });
    setOpen(false);
    setEditingId(null);
    setForm(blankForm());
  };

  const review = async (status: "approved" | "rejected") => {
    if (!reviewing || !user) return;
    const { error } = await supabase
      .from("expenses")
      .update({
        status,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote.trim() || null,
      })
      .eq("id", reviewing.id);
    if (error) return toast.error(error.message);
    toast.success(`Bazar ${status}`);
    qc.invalidateQueries({ queryKey: ["month-data"] });
    setReviewing(null);
    setReviewNote("");
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this bazar entry?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["month-data"] });
  };

  // Profile lookup for submitter names (community transparency)
  const { data: profiles } = useQuery({
    queryKey: ["profiles-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, display_name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    (profiles ?? []).forEach((p: any) => m.set(p.user_id, p.display_name || "Member"));
    return (uid?: string | null) => (uid ? m.get(uid) ?? "Member" : "—");
  }, [profiles]);

  if (isLoading || !data) return <div className="text-muted-foreground">Loading…</div>;
  const locked = data.isClosed;

  // Visibility: approved items are public to all signed-in users.
  // Pending / rejected items only show to the submitter (or admin).
  let visible = data.expenses.filter(
    (e) => e.status === "approved" || isAdmin || e.submitted_by === user?.id
  );
  if (tab !== "all") visible = visible.filter((e) => e.status === tab);

  const ownPendingOrRejected = (status: string) =>
    data.expenses.filter(
      (e) => e.status === status && (isAdmin || e.submitted_by === user?.id)
    ).length;
  const counts = {
    pending: ownPendingOrRejected("pending"),
    approved: data.expenses.filter((e) => e.status === "approved").length,
    rejected: ownPendingOrRejected("rejected"),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShoppingBasket className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Bazar</h1>
            <p className="text-muted-foreground mt-1">
              Approved: ৳{fmtMoney(data.totalExpense)} · Pending: ৳{fmtMoney(data.pendingTotal)}
            </p>
          </div>
        </div>
        {!locked && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setForm(blankForm()); } }}>
            <DialogTrigger asChild>
              <Button size="lg" onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Submit bazar</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Edit bazar" : isAdmin ? "New bazar" : "Submit bazar for approval"}
                </DialogTitle>
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
                {!isAdmin && !editingId && (
                  <p className="text-xs text-muted-foreground">
                    Your submission will be marked <strong>pending</strong> until admin approves it.
                  </p>
                )}
                <Button type="submit" className="w-full" size="lg">
                  {editingId ? "Save changes" : isAdmin ? "Save bazar" : "Submit for approval"}
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
          <TabsTrigger value="all">All <span className="ml-1 opacity-60">{data.expenses.length}</span></TabsTrigger>
          <TabsTrigger value="pending">Pending <span className="ml-1 opacity-60">{counts.pending}</span></TabsTrigger>
          <TabsTrigger value="approved">Approved <span className="ml-1 opacity-60">{counts.approved}</span></TabsTrigger>
          <TabsTrigger value="rejected">Rejected <span className="ml-1 opacity-60">{counts.rejected}</span></TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="gradient-card border-border/50 shadow-card overflow-hidden">
        <div className="divide-y divide-border">
          {visible
            .slice()
            .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
            .map((e) => (
              <div key={e.id} className="p-4 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{e.title}</span>
                    {statusBadge(e.status)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {format(new Date(e.date), "MMM d")} · {e.category} · by{" "}
                    {e.submitted_by === user?.id ? (
                      <span className="text-foreground/80 font-medium">You</span>
                    ) : e.submitted_by ? (
                      <Link
                        to={`/bazar/member/${e.submitted_by}`}
                        className="text-primary font-medium hover:underline"
                      >
                        {nameOf(e.submitted_by)}
                      </Link>
                    ) : (
                      <span className="text-foreground/80 font-medium">—</span>
                    )}
                    {e.review_note && ` · "${e.review_note}"`}
                  </div>
                </div>
                <div className="font-bold tabular-nums text-lg">৳{fmtMoney(Number(e.amount))}</div>
                {isAdmin && e.status === "pending" && !locked && (
                  <Button size="sm" onClick={() => { setReviewing(e); setReviewNote(""); }}>Review</Button>
                )}
                {!isAdmin && e.submitted_by === user?.id && e.status === "pending" && !locked && (
                  <Button size="icon" variant="ghost" aria-label="Edit bazar entry" onClick={() => openEdit(e)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                )}
                {!locked && (isAdmin || (e.submitted_by === user?.id && e.status === "pending")) && (
                  <Button size="icon" variant="ghost" aria-label="Delete bazar entry" onClick={() => remove(e.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          {visible.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">Nothing here.</div>
          )}
        </div>
      </Card>

      <Dialog open={!!reviewing} onOpenChange={(o) => { if (!o) setReviewing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Review bazar</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <p className="font-medium">{reviewing?.title}</p>
            <p className="text-sm text-muted-foreground">৳{reviewing && fmtMoney(Number(reviewing.amount))} · {reviewing?.category}</p>
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

export default Bazar;
