import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { MessageSquareWarning, Plus, Check, X } from "lucide-react";

const schema = z.object({
  entity_type: z.string().min(1),
  reason: z.string().trim().min(5, "Please describe the issue (5+ chars)").max(500),
  month: z.string().optional(),
});

const statusMeta: Record<string, { cls: string; label: string }> = {
  open: { cls: "bg-warning/15 text-warning border-warning/30", label: "Open" },
  approved: { cls: "bg-success/15 text-success border-success/30", label: "Approved" },
  rejected: { cls: "bg-destructive/15 text-destructive border-destructive/30", label: "Rejected" },
};

const Corrections = () => {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState<any>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [form, setForm] = useState({
    entity_type: "meals",
    reason: "",
    month: format(new Date(), "yyyy-MM-01"),
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["corrections"],
    queryFn: async () => {
      const { data } = await supabase
        .from("correction_requests")
        .select("*")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!user) return toast.error("Sign in first");
    const { error } = await supabase.from("correction_requests").insert({
      requested_by: user.id,
      entity_type: form.entity_type,
      month: form.month,
      reason: form.reason.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success("Request sent to admin");
    qc.invalidateQueries({ queryKey: ["corrections"] });
    qc.invalidateQueries({ queryKey: ["corrections-open-count"] });
    setOpen(false);
    setForm({ entity_type: "meals", reason: "", month: format(new Date(), "yyyy-MM-01") });
  };

  const review = async (status: "approved" | "rejected") => {
    if (!reviewing || !user) return;
    const { error } = await supabase
      .from("correction_requests")
      .update({
        status,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote.trim() || null,
      })
      .eq("id", reviewing.id);
    if (error) return toast.error(error.message);
    toast.success(`Request ${status}`);
    qc.invalidateQueries({ queryKey: ["corrections"] });
    qc.invalidateQueries({ queryKey: ["corrections-open-count"] });
    setReviewing(null);
    setReviewNote("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <MessageSquareWarning className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Correction Requests</h1>
            <p className="text-muted-foreground mt-1">
              Spot something wrong? Ask the admin to fix it.
            </p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="lg"><Plus className="w-4 h-4 mr-2" /> New request</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Request a correction</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label>What's wrong?</Label>
                <Select value={form.entity_type} onValueChange={(v) => setForm({ ...form, entity_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meals">A meal entry</SelectItem>
                    <SelectItem value="deposits">A deposit</SelectItem>
                    <SelectItem value="expenses">A bazar entry</SelectItem>
                    <SelectItem value="members">Member info</SelectItem>
                    <SelectItem value="other">Something else</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Month</Label>
                <Input type="month" value={form.month.slice(0, 7)} onChange={(e) => setForm({ ...form, month: e.target.value + "-01" })} />
              </div>
              <div className="space-y-2">
                <Label>Describe the issue *</Label>
                <Textarea
                  rows={4}
                  value={form.reason}
                  maxLength={500}
                  placeholder="e.g. My meal count on April 12 should be 1.5, not 0.5"
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  required
                />
              </div>
              <Button type="submit" className="w-full" size="lg">Send request</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : rows?.length === 0 ? (
        <Card className="p-16 text-center gradient-card border-border/50">
          <MessageSquareWarning className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No requests yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows?.map((r) => {
            const meta = statusMeta[r.status] ?? statusMeta.open;
            return (
              <Card key={r.id} className="p-4 gradient-card border-border/50 shadow-card">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                      <span className="text-xs text-muted-foreground capitalize">{r.entity_type}</span>
                      {r.month && (
                        <span className="text-xs text-muted-foreground">· {format(new Date(r.month), "MMM yyyy")}</span>
                      )}
                      <span className="text-xs text-muted-foreground">· {format(new Date(r.created_at), "MMM d, h:mm a")}</span>
                    </div>
                    <p className="text-sm">{r.reason}</p>
                    {r.review_note && (
                      <p className="text-xs text-muted-foreground mt-2 italic">
                        Admin note: {r.review_note}
                      </p>
                    )}
                  </div>
                  {isAdmin && r.status === "open" && (
                    <Button size="sm" variant="outline" onClick={() => { setReviewing(r); setReviewNote(""); }}>
                      Review
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!reviewing} onOpenChange={(o) => { if (!o) setReviewing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Review request</DialogTitle></DialogHeader>
          <p className="text-sm">{reviewing?.reason}</p>
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Textarea
              rows={3}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="What did you do? (logged for transparency)"
              maxLength={300}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Approving marks the request resolved. You still need to manually edit the data — both actions are logged.
          </p>
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

export default Corrections;
