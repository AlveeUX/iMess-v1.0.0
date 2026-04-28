import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Check, Plus, Trash2, Receipt } from "lucide-react";

type Member = { id: string; name: string; room: string | null; is_active: boolean };
type Bill = {
  id: string;
  member_id: string;
  title: string;
  amount: number;
  due_date: string;
  is_paid: boolean;
  paid_date: string | null;
  note: string | null;
};

const Bills = () => {
  const { isAdmin, memberId } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unpaid" | "paid" | "mine">(
    isAdmin ? "all" : "mine"
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  // form
  const [fMember, setFMember] = useState<string>("");
  const [fTitle, setFTitle] = useState("");
  const [fAmount, setFAmount] = useState<string>("");
  const [fDue, setFDue] = useState<string>(new Date().toISOString().slice(0, 10));
  const [fNote, setFNote] = useState("");

  const load = async () => {
    setLoading(true);
    const [m, b] = await Promise.all([
      supabase.from("members").select("id,name,room,is_active").order("name"),
      supabase.from("bills").select("*").order("due_date", { ascending: false }),
    ]);
    if (m.data) setMembers(m.data as Member[]);
    if (b.data) setBills(b.data as Bill[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const memberMap = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m])),
    [members]
  );

  const filtered = useMemo(() => {
    let list = bills;
    if (filter === "unpaid") list = list.filter((b) => !b.is_paid);
    else if (filter === "paid") list = list.filter((b) => b.is_paid);
    else if (filter === "mine" && memberId)
      list = list.filter((b) => b.member_id === memberId);
    return list;
  }, [bills, filter, memberId]);

  const totals = useMemo(() => {
    const unpaid = filtered.filter((b) => !b.is_paid);
    const paid = filtered.filter((b) => b.is_paid);
    return {
      unpaidAmt: unpaid.reduce((s, b) => s + Number(b.amount), 0),
      paidAmt: paid.reduce((s, b) => s + Number(b.amount), 0),
      unpaidCount: unpaid.length,
      paidCount: paid.length,
    };
  }, [filtered]);

  const myUnpaid = useMemo(
    () => bills.filter((b) => b.member_id === memberId && !b.is_paid),
    [bills, memberId]
  );

  const resetForm = () => {
    setFMember("");
    setFTitle("");
    setFAmount("");
    setFDue(new Date().toISOString().slice(0, 10));
    setFNote("");
  };

  const handleCreate = async () => {
    if (!fMember || !fTitle || !fAmount) {
      toast({ title: "Missing fields", description: "Member, title, amount required", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("bills").insert({
      member_id: fMember,
      title: fTitle,
      amount: Number(fAmount),
      due_date: fDue,
      note: fNote || null,
    });
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Bill added" });
    resetForm();
    setDialogOpen(false);
    load();
  };

  const togglePaid = async (b: Bill) => {
    const { error } = await supabase
      .from("bills")
      .update({
        is_paid: !b.is_paid,
        paid_date: !b.is_paid ? new Date().toISOString().slice(0, 10) : null,
      })
      .eq("id", b.id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this bill?")) return;
    const { error } = await supabase.from("bills").delete().eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="w-7 h-7" /> Bills
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin
              ? "Assign bills to members and track payments."
              : "View bills assigned to you and the rest of the mess."}
          </p>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" /> New bill
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create bill</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Member</Label>
                  <Select value={fMember} onValueChange={setFMember}>
                    <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}{m.room ? ` · ${m.room}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Title</Label>
                  <Input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="Electricity, WiFi, Gas..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Amount</Label>
                    <Input type="number" value={fAmount} onChange={(e) => setFAmount(e.target.value)} />
                  </div>
                  <div>
                    <Label>Due date</Label>
                    <Input type="date" value={fDue} onChange={(e) => setFDue(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Note (optional)</Label>
                  <Input value={fNote} onChange={(e) => setFNote(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {memberId && myUnpaid.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your unpaid bills</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            You have <b>{myUnpaid.length}</b> unpaid bill{myUnpaid.length > 1 ? "s" : ""} totaling{" "}
            <b>৳{myUnpaid.reduce((s, b) => s + Number(b.amount), 0).toFixed(2)}</b>.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Unpaid</div>
            <div className="text-2xl font-bold">৳{totals.unpaidAmt.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-1">{totals.unpaidCount} bills</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Paid</div>
            <div className="text-2xl font-bold">৳{totals.paidAmt.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-1">{totals.paidCount} bills</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">View</div>
            <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All bills</SelectItem>
                <SelectItem value="unpaid">Unpaid only</SelectItem>
                <SelectItem value="paid">Paid only</SelectItem>
                {memberId && <SelectItem value="mine">My bills</SelectItem>}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Bills checklist</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">No bills found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Paid on</TableHead>
                  {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => {
                  const m = memberMap[b.member_id];
                  const overdue = !b.is_paid && b.due_date < new Date().toISOString().slice(0, 10);
                  return (
                    <TableRow key={b.id}>
                      <TableCell>
                        {b.is_paid ? (
                          <Badge className="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/15">Paid</Badge>
                        ) : overdue ? (
                          <Badge className="bg-red-500/15 text-red-500 hover:bg-red-500/15">Overdue</Badge>
                        ) : (
                          <Badge variant="secondary">Unpaid</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{m?.name ?? "—"}</div>
                        {m?.room && <div className="text-xs text-muted-foreground">Room {m.room}</div>}
                      </TableCell>
                      <TableCell>
                        <div>{b.title}</div>
                        {b.note && <div className="text-xs text-muted-foreground">{b.note}</div>}
                      </TableCell>
                      <TableCell className="text-right font-mono">৳{Number(b.amount).toFixed(2)}</TableCell>
                      <TableCell>{b.due_date}</TableCell>
                      <TableCell className="text-muted-foreground">{b.paid_date ?? "—"}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => togglePaid(b)} title={b.is_paid ? "Mark unpaid" : "Mark paid"}>
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => remove(b.id)} title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Bills;
