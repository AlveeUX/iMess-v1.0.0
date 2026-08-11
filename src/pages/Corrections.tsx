import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { MessageSquareWarning, Plus, Check, X, Zap } from "lucide-react";

type RequestKind = "away" | "back" | "other";

const statusMeta: Record<string, { cls: string; label: string }> = {
  open: { cls: "bg-warning/15 text-warning border-warning/30", label: "Open" },
  approved: { cls: "bg-success/15 text-success border-success/30", label: "Approved" },
  rejected: { cls: "bg-destructive/15 text-destructive border-destructive/30", label: "Rejected" },
};

const Corrections = () => {
  const { isAdmin, user, memberId } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState<any>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [kind, setKind] = useState<RequestKind>("away");
  const [form, setForm] = useState({
    reason: "",
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

  const { data: awayRows } = useQuery({
    queryKey: ["away-requests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("member_away_periods")
        .select("*, members(name)")
        .in("status", ["pending", "rejected"])
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const reviewAway = async (id: string, approve: boolean, note?: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("member_away_periods")
      .update({
        status: approve ? "approved" : "rejected",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: note?.trim() || null,
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(approve ? "Away period approved" : "Away period rejected");
    qc.invalidateQueries({ queryKey: ["away-requests"] });
    qc.invalidateQueries({ queryKey: ["month-data"] });
  };


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error("Sign in first");
    if (kind !== "other" && !memberId) {
      return toast.error("Your account isn't linked to a member yet. Ask an admin.");
    }
    if (form.reason.trim().length < 5) {
      return toast.error("Please describe the reason (5+ chars)");
    }

    let entity_type = "other";
    let requested_value: any = null;
    let month: string | null = null;

    if (kind === "away") {
      entity_type = "members";
      requested_value = { member_id: memberId, is_active: false };
    } else if (kind === "back") {
      entity_type = "members";
      requested_value = { member_id: memberId, is_active: true };
    }

    const { error } = await supabase.from("correction_requests").insert({
      requested_by: user.id,
      member_id: memberId,
      entity_type,
      month,
      reason: form.reason.trim(),
      requested_value,
    });
    if (error) return toast.error(error.message);
    toast.success("Request sent to admin");
    qc.invalidateQueries({ queryKey: ["corrections"] });
    qc.invalidateQueries({ queryKey: ["corrections-open-count"] });
    setOpen(false);
    setForm({ reason: "" });
    setKind("away");
  };

  const reject = async () => {
    if (!reviewing || !user) return;
    const { error } = await supabase
      .from("correction_requests")
      .update({
        status: "rejected",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote.trim() || null,
      })
      .eq("id", reviewing.id);
    if (error) return toast.error(error.message);
    toast.success("Request rejected");
    qc.invalidateQueries({ queryKey: ["corrections"] });
    qc.invalidateQueries({ queryKey: ["corrections-open-count"] });
    setReviewing(null);
    setReviewNote("");
  };

  const applyAuto = async () => {
    if (!reviewing) return;
    const { error } = await supabase.rpc("apply_correction", {
      _request_id: reviewing.id,
      _note: reviewNote.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Approved & applied");
    qc.invalidateQueries({ queryKey: ["corrections"] });
    qc.invalidateQueries({ queryKey: ["corrections-open-count"] });
    qc.invalidateQueries({ queryKey: ["month-data"] });
    qc.invalidateQueries({ queryKey: ["members"] });
    setReviewing(null);
    setReviewNote("");
  };

  const approveOnly = async () => {
    if (!reviewing || !user) return;
    const { error } = await supabase
      .from("correction_requests")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote.trim() || null,
      })
      .eq("id", reviewing.id);
    if (error) return toast.error(error.message);
    toast.success("Marked approved (apply manually)");
    qc.invalidateQueries({ queryKey: ["corrections"] });
    qc.invalidateQueries({ queryKey: ["corrections-open-count"] });
    setReviewing(null);
    setReviewNote("");
  };

  const canAutoApply = (r: any) =>
    r?.requested_value &&
    ((r.entity_type === "meals" && r.requested_value.member_id && r.requested_value.date) ||
      (r.entity_type === "members" && r.requested_value.member_id && typeof r.requested_value.is_active === "boolean"));

  const summarize = (r: any) => {
    const v = r.requested_value;
    if (!v) return null;
    if (r.entity_type === "meals") return `Set meals on ${v.date} → ${v.meal_count}`;
    if (r.entity_type === "members") return v.is_active ? "Mark me active (back)" : "Mark me inactive (away)";
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <MessageSquareWarning className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Requests</h1>
            <p className="text-muted-foreground mt-1">
              Ask admin to mark you away, mark you back, or flag something else.
            </p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="lg"><Plus className="w-4 h-4 mr-2" /> New request</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New request</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as RequestKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="away">I'll be away (mark inactive)</SelectItem>
                    <SelectItem value="back">I'm back (mark active)</SelectItem>
                    <SelectItem value="other">Something else</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reason / note *</Label>
                <Textarea
                  rows={3}
                  value={form.reason}
                  maxLength={500}
                  placeholder="e.g. Skipped dinner, going home for the weekend, etc."
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  required
                />
              </div>
              {!memberId && kind !== "other" && (
                <p className="text-xs text-warning">
                  Your login isn't linked to a member yet — ask an admin to link you.
                </p>
              )}
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
            const summary = summarize(r);
            return (
              <Card key={r.id} className="p-4 gradient-card border-border/50 shadow-card">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                      <span className="text-xs text-muted-foreground capitalize">{r.entity_type}</span>
                      <span className="text-xs text-muted-foreground">· {format(new Date(r.created_at), "MMM d, h:mm a")}</span>
                    </div>
                    {summary && <p className="text-sm font-medium text-primary">{summary}</p>}
                    <p className="text-sm mt-1">{r.reason}</p>
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

      {(awayRows?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold mt-6">Away period requests</h2>
          {awayRows!.map((a: any) => {
            const meta = statusMeta[a.status] ?? statusMeta.open;
            const label = a.status === "pending" ? "Pending" : meta.label;
            const cls = a.status === "pending" ? statusMeta.open.cls : meta.cls;
            return (
              <Card key={a.id} className="p-4 gradient-card border-border/50 shadow-card">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="outline" className={cls}>{label}</Badge>
                      <span className="text-xs text-muted-foreground">Away period</span>
                      <span className="text-xs text-muted-foreground">
                        · {format(new Date(a.created_at), "MMM d, h:mm a")}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-primary">
                      {a.members?.name ?? "Member"}: {format(new Date(a.start_date), "MMM d")} → {format(new Date(a.end_date), "MMM d, yyyy")}
                    </p>
                    {a.note && <p className="text-sm mt-1">{a.note}</p>}
                    {a.review_note && (
                      <p className="text-xs text-muted-foreground mt-2 italic">
                        Admin note: {a.review_note}
                      </p>
                    )}
                  </div>
                  {isAdmin && a.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => reviewAway(a.id, false)}>
                        <X className="w-4 h-4 mr-1" /> Reject
                      </Button>
                      <Button size="sm" onClick={() => reviewAway(a.id, true)}>
                        <Check className="w-4 h-4 mr-1" /> Approve
                      </Button>
                    </div>
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
          {reviewing && summarize(reviewing) && (
            <Card className="p-3 bg-primary/5 border-primary/30">
              <p className="text-sm font-medium">{summarize(reviewing)}</p>
            </Card>
          )}
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
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={reject}>
              <X className="w-4 h-4 mr-2" /> Reject
            </Button>
            {canAutoApply(reviewing) ? (
              <Button onClick={applyAuto}>
                <Zap className="w-4 h-4 mr-2" /> Approve & Apply
              </Button>
            ) : (
              <Button onClick={approveOnly}>
                <Check className="w-4 h-4 mr-2" /> Approve (manual)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Corrections;
