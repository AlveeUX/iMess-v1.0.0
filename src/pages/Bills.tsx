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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, Plus, Trash2, Receipt, Home, Zap, ClipboardCheck, X, Clock, Pencil } from "lucide-react";

type Member = {
  id: string;
  name: string;
  room: string | null;
  seat_name: string | null;
  rent_amount: number;
  is_active: boolean;
};

type Bill = {
  id: string;
  bill_type: "rent" | "utility";
  title: string;
  total_amount: number;
  due_date: string;
  due_month: string | null;
  notes: string | null;
  created_at: string;
};

type BillItem = {
  id: string;
  bill_id: string;
  member_id: string;
  amount: number;
  status: "unpaid" | "pending_review" | "paid";
  paid_on: string | null;
  requested_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  note: string | null;
};

const fmt = (n: number) => `৳${Number(n || 0).toFixed(2)}`;

const StatusBadge = ({ s }: { s: BillItem["status"] }) => {
  if (s === "paid")
    return (
      <Badge className="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/15 gap-1">
        <Check className="w-3 h-3" /> Paid
      </Badge>
    );
  if (s === "pending_review")
    return (
      <Badge className="bg-amber-500/15 text-amber-500 hover:bg-amber-500/15 gap-1">
        <Clock className="w-3 h-3" /> Pending review
      </Badge>
    );
  return <Badge variant="secondary">Unpaid</Badge>;
};

const Bills = () => {
  const { isAdmin, memberId } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [items, setItems] = useState<BillItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [rentOpen, setRentOpen] = useState(false);
  const [utilOpen, setUtilOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailBill, setDetailBill] = useState<Bill | null>(null);

  // Amount editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [paidConfirm, setPaidConfirm] = useState<{ item: BillItem; amount: number } | null>(null);
  const [rentDefaultPrompt, setRentDefaultPrompt] = useState<
    { memberId: string; memberName: string; amount: number } | null
  >(null);

  // rent form
  const [rMember, setRMember] = useState("");
  const [rTitle, setRTitle] = useState("Monthly Rent");
  const [rAmount, setRAmount] = useState("");
  const [rDue, setRDue] = useState(new Date().toISOString().slice(0, 10));
  const [rMonth, setRMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rNotes, setRNotes] = useState("");

  // utility form
  const [uTitle, setUTitle] = useState("");
  const [uAmount, setUAmount] = useState("");
  const [uDue, setUDue] = useState(new Date().toISOString().slice(0, 10));
  const [uMonth, setUMonth] = useState(new Date().toISOString().slice(0, 7));
  const [uNotes, setUNotes] = useState("");

  const load = async () => {
    setLoading(true);
    const [m, b, i] = await Promise.all([
      supabase.from("members").select("id,name,room,seat_name,rent_amount,is_active").order("name"),
      supabase.from("bills_v2").select("*").order("due_date", { ascending: false }),
      supabase.from("bill_items").select("*"),
    ]);
    if (m.data) setMembers(m.data as Member[]);
    if (b.data) setBills(b.data as Bill[]);
    if (i.data) setItems(i.data as BillItem[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const memberMap = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m])),
    [members]
  );

  const itemsByBill = useMemo(() => {
    const map: Record<string, BillItem[]> = {};
    for (const it of items) (map[it.bill_id] ||= []).push(it);
    return map;
  }, [items]);

  const rentBills = bills.filter((b) => b.bill_type === "rent");
  const utilityBills = bills.filter((b) => b.bill_type === "utility");

  // KPIs
  const totals = useMemo(() => {
    let rentDue = 0,
      utilDue = 0,
      paid = 0,
      unpaid = 0;
    for (const it of items) {
      const bill = bills.find((b) => b.id === it.bill_id);
      if (!bill) continue;
      if (it.status === "paid") paid += Number(it.amount);
      else unpaid += Number(it.amount);
      if (it.status !== "paid") {
        if (bill.bill_type === "rent") rentDue += Number(it.amount);
        else utilDue += Number(it.amount);
      }
    }
    return { rentDue, utilDue, paid, unpaid };
  }, [items, bills]);

  const myItems = useMemo(
    () => items.filter((it) => it.member_id === memberId),
    [items, memberId]
  );
  const myUnpaidTotal = myItems
    .filter((i) => i.status !== "paid")
    .reduce((s, i) => s + Number(i.amount), 0);
  const pendingReviewItems = items.filter((i) => i.status === "pending_review");

  // ---- Admin: create rent ----
  const handleCreateRent = async () => {
    if (!rMember || !rTitle || !rAmount) {
      toast({ title: "Missing fields", description: "Member, title, amount required", variant: "destructive" });
      return;
    }
    const amount = Number(rAmount);
    const { data: bill, error } = await supabase
      .from("bills_v2")
      .insert({
        bill_type: "rent",
        title: rTitle,
        total_amount: amount,
        due_date: rDue,
        due_month: `${rMonth}-01`,
        notes: rNotes || null,
      })
      .select()
      .single();
    if (error || !bill) {
      toast({ title: "Failed", description: error?.message, variant: "destructive" });
      return;
    }
    const { error: e2 } = await supabase.from("bill_items").insert({
      bill_id: bill.id,
      member_id: rMember,
      amount,
    });
    if (e2) {
      toast({ title: "Failed", description: e2.message, variant: "destructive" });
      return;
    }
    toast({ title: "Rent bill created" });
    setRentOpen(false);
    setRMember("");
    setRAmount("");
    setRTitle("Monthly Rent");
    setRNotes("");
    load();
  };

  // Auto-fill rent amount when member changes
  useEffect(() => {
    if (rMember) {
      const m = memberMap[rMember];
      if (m && Number(m.rent_amount) > 0) setRAmount(String(m.rent_amount));
    }
  }, [rMember, memberMap]);

  // ---- Admin: create utility ----
  const handleCreateUtility = async () => {
    if (!uTitle || !uAmount) {
      toast({ title: "Missing fields", description: "Title and amount required", variant: "destructive" });
      return;
    }
    const total = Number(uAmount);
    const active = members.filter((m) => m.is_active);
    if (active.length === 0) {
      toast({ title: "No active members", variant: "destructive" });
      return;
    }
    const share = Math.round((total / active.length) * 100) / 100;
    const { data: bill, error } = await supabase
      .from("bills_v2")
      .insert({
        bill_type: "utility",
        title: uTitle,
        total_amount: total,
        due_date: uDue,
        due_month: `${uMonth}-01`,
        notes: uNotes || null,
      })
      .select()
      .single();
    if (error || !bill) {
      toast({ title: "Failed", description: error?.message, variant: "destructive" });
      return;
    }
    const rows = active.map((m) => ({ bill_id: bill.id, member_id: m.id, amount: share }));
    const { error: e2 } = await supabase.from("bill_items").insert(rows);
    if (e2) {
      toast({ title: "Failed", description: e2.message, variant: "destructive" });
      return;
    }
    toast({ title: "Utility bill created", description: `${active.length} members · ${fmt(share)} each` });
    setUtilOpen(false);
    setUTitle("");
    setUAmount("");
    setUNotes("");
    load();
  };

  const deleteBill = async (id: string) => {
    const { error } = await supabase.from("bills_v2").delete().eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Bill deleted" });
    setDeleteId(null);
    load();
  };

  // ---- Admin: review payment ----
  const adminSetStatus = async (item: BillItem, status: BillItem["status"]) => {
    const patch: any = { status };
    if (status === "paid") {
      patch.paid_on = new Date().toISOString().slice(0, 10);
      patch.approved_at = new Date().toISOString();
    } else if (status === "unpaid") {
      patch.paid_on = null;
      patch.approved_at = null;
      patch.requested_at = null;
    }
    const { error } = await supabase.from("bill_items").update(patch).eq("id", item.id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    load();
  };

  // ---- Admin: edit bill item amount ----
  const startEdit = (it: BillItem) => {
    setEditingId(it.id);
    setEditValue(String(it.amount));
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };
  const trySaveEdit = (it: BillItem) => {
    const n = Number(editValue);
    if (!Number.isFinite(n) || n <= 0) {
      toast({ title: "Invalid amount", description: "Enter a number greater than 0", variant: "destructive" });
      return;
    }
    if (n === Number(it.amount)) {
      cancelEdit();
      return;
    }
    if (it.status === "paid") {
      setPaidConfirm({ item: it, amount: n });
      return;
    }
    void commitEdit(it, n);
  };
  const commitEdit = async (it: BillItem, n: number) => {
    const { error } = await supabase.from("bill_items").update({ amount: n }).eq("id", it.id);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Amount updated" });
    cancelEdit();
    setPaidConfirm(null);
    // For rent bills, offer to update the member default
    const bill = bills.find((b) => b.id === it.bill_id);
    if (bill?.bill_type === "rent") {
      const m = memberMap[it.member_id];
      if (m && Number(m.rent_amount) !== n) {
        setRentDefaultPrompt({ memberId: it.member_id, memberName: m.name, amount: n });
      }
    }
    load();
  };
  const updateMemberDefaultRent = async () => {
    if (!rentDefaultPrompt) return;
    const { error } = await supabase
      .from("members")
      .update({ rent_amount: rentDefaultPrompt.amount })
      .eq("id", rentDefaultPrompt.memberId);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Default rent updated" });
    setRentDefaultPrompt(null);
    load();
  };

  // ---- Member: request review or cancel ----
  const memberToggleRequest = async (item: BillItem) => {
    const next = item.status === "pending_review" ? "unpaid" : "pending_review";
    const { error } = await supabase.from("bill_items").update({ status: next }).eq("id", item.id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({
      title: next === "pending_review" ? "Marked as paid — awaiting admin review" : "Request canceled",
    });
    load();
  };

  const memberLabel = (id: string) => {
    const m = memberMap[id];
    if (!m) return "—";
    const seat = m.seat_name || m.room;
    return seat ? `${m.name} · ${seat}` : m.name;
  };

  // -------------------- RENDER --------------------
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="w-7 h-7" /> Bills
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin
              ? "Manage rent and utility bills. Utility is divided equally across active members."
              : "View your rent, shared utility bills, and update your payment status."}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRentOpen(true)}>
              <Home className="w-4 h-4 mr-2" /> Create rent bill
            </Button>
            <Button onClick={() => setUtilOpen(true)}>
              <Zap className="w-4 h-4 mr-2" /> Create utility bill
            </Button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Home className="w-3 h-3" /> Total Rent Due
            </div>
            <div className="text-2xl font-bold mt-1">{fmt(totals.rentDue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Zap className="w-3 h-3" /> Total Utility Due
            </div>
            <div className="text-2xl font-bold mt-1">{fmt(totals.utilDue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Paid</div>
            <div className="text-2xl font-bold mt-1 text-emerald-500">{fmt(totals.paid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Unpaid</div>
            <div className="text-2xl font-bold mt-1 text-amber-500">{fmt(totals.unpaid)}</div>
          </CardContent>
        </Card>
      </div>

      {!isAdmin && memberId && myUnpaidTotal > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your outstanding balance</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            You owe <b>{fmt(myUnpaidTotal)}</b> across{" "}
            <b>{myItems.filter((i) => i.status !== "paid").length}</b> bill(s).
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Loading…</CardContent></Card>
      ) : isAdmin ? (
        <AdminView
          rentBills={rentBills}
          utilityBills={utilityBills}
          itemsByBill={itemsByBill}
          memberLabel={memberLabel}
          memberMap={memberMap}
          pendingReviewItems={pendingReviewItems}
          onDeleteBill={(id) => setDeleteId(id)}
          onOpenDetail={(b) => setDetailBill(b)}
          onSetStatus={adminSetStatus}
          items={items}
          bills={bills}
          editingId={editingId}
          editValue={editValue}
          setEditValue={setEditValue}
          onStartEdit={startEdit}
          onCancelEdit={cancelEdit}
          onSaveEdit={trySaveEdit}
        />
      ) : (
        <MemberView
          memberId={memberId}
          rentBills={rentBills}
          utilityBills={utilityBills}
          itemsByBill={itemsByBill}
          onToggle={memberToggleRequest}
        />
      )}

      {/* Create rent dialog */}
      <Dialog open={rentOpen} onOpenChange={setRentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create rent bill</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Member</Label>
              <Select value={rMember} onValueChange={setRMember}>
                <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  {members.filter((m) => m.is_active).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                      {m.seat_name ? ` · ${m.seat_name}` : m.room ? ` · Room ${m.room}` : ""}
                      {Number(m.rent_amount) > 0 ? ` (৳${Number(m.rent_amount).toFixed(0)})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={rTitle} onChange={(e) => setRTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Amount</Label>
                <Input type="number" value={rAmount} onChange={(e) => setRAmount(e.target.value)} />
              </div>
              <div>
                <Label>Due date</Label>
                <Input type="date" value={rDue} onChange={(e) => setRDue(e.target.value)} />
              </div>
              <div>
                <Label>Month</Label>
                <Input type="month" value={rMonth} onChange={(e) => setRMonth(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={rNotes} onChange={(e) => setRNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRentOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateRent}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create utility dialog */}
      <Dialog open={utilOpen} onOpenChange={setUtilOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create utility bill</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={uTitle} onChange={(e) => setUTitle(e.target.value)} placeholder="Electricity, WiFi, Gas..." />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Total amount</Label>
                <Input type="number" value={uAmount} onChange={(e) => setUAmount(e.target.value)} />
              </div>
              <div>
                <Label>Due date</Label>
                <Input type="date" value={uDue} onChange={(e) => setUDue(e.target.value)} />
              </div>
              <div>
                <Label>Month</Label>
                <Input type="month" value={uMonth} onChange={(e) => setUMonth(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={uNotes} onChange={(e) => setUNotes(e.target.value)} />
            </div>
            {uAmount && (
              <div className="text-xs text-muted-foreground p-3 rounded-md bg-secondary/40">
                Will divide <b>{fmt(Number(uAmount))}</b> across{" "}
                <b>{members.filter((m) => m.is_active).length}</b> active members ={" "}
                <b>{fmt(Number(uAmount) / Math.max(1, members.filter((m) => m.is_active).length))}</b> each
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUtilOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateUtility}>Create &amp; split</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this bill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the bill and all member shares. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteBill(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Utility detail */}
      <Dialog open={!!detailBill} onOpenChange={(o) => !o && setDetailBill(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailBill?.title}</DialogTitle>
          </DialogHeader>
          {detailBill && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Total {fmt(detailBill.total_amount)} · Due {detailBill.due_date}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paid on</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(itemsByBill[detailBill.id] ?? []).map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>{memberLabel(it.member_id)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(it.amount)}</TableCell>
                      <TableCell><StatusBadge s={it.status} /></TableCell>
                      <TableCell className="text-muted-foreground">{it.paid_on ?? "—"}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          {it.status !== "paid" ? (
                            <Button size="sm" variant="ghost" onClick={() => adminSetStatus(it, "paid")}>
                              <Check className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => adminSetStatus(it, "unpaid")}>
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// =================== Admin View ===================
const AdminView = ({
  rentBills,
  utilityBills,
  itemsByBill,
  memberLabel,
  memberMap,
  pendingReviewItems,
  onDeleteBill,
  onOpenDetail,
  onSetStatus,
  items,
  bills,
}: any) => {
  return (
    <Tabs defaultValue="rent" className="space-y-4">
      <TabsList>
        <TabsTrigger value="rent"><Home className="w-4 h-4 mr-2" /> Rent bills</TabsTrigger>
        <TabsTrigger value="utility"><Zap className="w-4 h-4 mr-2" /> Utility bills</TabsTrigger>
        <TabsTrigger value="review">
          <ClipboardCheck className="w-4 h-4 mr-2" /> Payment review
          {pendingReviewItems.length > 0 && (
            <Badge variant="secondary" className="ml-2">{pendingReviewItems.length}</Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="rent">
        <Card>
          <CardHeader><CardTitle>Rent bills</CardTitle></CardHeader>
          <CardContent>
            {rentBills.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No rent bills yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Room/Seat</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Due month</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paid on</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rentBills.map((b: Bill) => {
                    const it = (itemsByBill[b.id] ?? [])[0];
                    if (!it) return null;
                    const m = memberMap[it.member_id];
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{m?.name ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {m?.seat_name || (m?.room ? `Room ${m.room}` : "—")}
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmt(it.amount)}</TableCell>
                        <TableCell>{b.due_month?.slice(0, 7) ?? b.due_date}</TableCell>
                        <TableCell><StatusBadge s={it.status} /></TableCell>
                        <TableCell className="text-muted-foreground">{it.paid_on ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {it.status !== "paid" ? (
                              <Button size="sm" variant="ghost" onClick={() => onSetStatus(it, "paid")} title="Mark paid">
                                <Check className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => onSetStatus(it, "unpaid")} title="Mark unpaid">
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => onDeleteBill(b.id)} title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="utility">
        <Card>
          <CardHeader><CardTitle>Utility bills</CardTitle></CardHeader>
          <CardContent>
            {utilityBills.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No utility bills yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    <TableHead className="text-right">Per share</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Paid / Unpaid</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {utilityBills.map((b: Bill) => {
                    const its = itemsByBill[b.id] ?? [];
                    const paid = its.filter((i: BillItem) => i.status === "paid").length;
                    const unpaid = its.length - paid;
                    const share = its[0]?.amount ?? 0;
                    return (
                      <TableRow key={b.id} className="cursor-pointer" onClick={() => onOpenDetail(b)}>
                        <TableCell className="font-medium">{b.title}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(b.total_amount)}</TableCell>
                        <TableCell className="text-right">{its.length}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(share)}</TableCell>
                        <TableCell>{b.due_date}</TableCell>
                        <TableCell>
                          <span className="text-emerald-500">{paid}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className="text-amber-500">{unpaid}</span>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" onClick={() => onDeleteBill(b.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="review">
        <Card>
          <CardHeader>
            <CardTitle>Pending payment requests</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingReviewItems.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No pending requests.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Bill</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingReviewItems.map((it: BillItem) => {
                    const bill = bills.find((b: Bill) => b.id === it.bill_id);
                    return (
                      <TableRow key={it.id}>
                        <TableCell className="font-medium">{memberLabel(it.member_id)}</TableCell>
                        <TableCell>
                          {bill?.title}{" "}
                          <Badge variant="outline" className="ml-1 text-xs">{bill?.bill_type}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmt(it.amount)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {it.requested_at ? new Date(it.requested_at).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" onClick={() => onSetStatus(it, "paid")}>
                              <Check className="w-4 h-4 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => onSetStatus(it, "unpaid")}>
                              <X className="w-4 h-4 mr-1" /> Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

// =================== Member View ===================
const MemberView = ({
  memberId,
  rentBills,
  utilityBills,
  itemsByBill,
  onToggle,
}: {
  memberId: string | null;
  rentBills: Bill[];
  utilityBills: Bill[];
  itemsByBill: Record<string, BillItem[]>;
  onToggle: (it: BillItem) => void;
}) => {
  if (!memberId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Your account isn't linked to a member yet. Ask the admin to link you.
        </CardContent>
      </Card>
    );
  }

  const myRent = rentBills
    .map((b) => ({ b, it: (itemsByBill[b.id] ?? []).find((i) => i.member_id === memberId) }))
    .filter((x) => x.it);
  const myUtil = utilityBills
    .map((b) => ({ b, it: (itemsByBill[b.id] ?? []).find((i) => i.member_id === memberId) }))
    .filter((x) => x.it);

  const Section = ({
    title,
    icon: Icon,
    rows,
  }: {
    title: string;
    icon: any;
    rows: { b: Bill; it: BillItem | undefined }[];
  }) => (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Icon className="w-4 h-4" /> {title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Nothing here.</div>
        ) : (
          <div className="space-y-2">
            {rows.map(({ b, it }) => {
              if (!it) return null;
              return (
                <div key={it.id} className="flex flex-wrap items-center gap-3 p-3 rounded-md border border-border/60 bg-secondary/20">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{b.title}</div>
                    <div className="text-xs text-muted-foreground">
                      Due {b.due_date}
                      {b.bill_type === "utility" && ` · Total ${fmt(b.total_amount)}`}
                    </div>
                  </div>
                  <div className="font-bold tabular-nums">{fmt(it.amount)}</div>
                  <StatusBadge s={it.status} />
                  {it.status !== "paid" && (
                    <Button
                      size="sm"
                      variant={it.status === "pending_review" ? "outline" : "default"}
                      onClick={() => onToggle(it)}
                    >
                      {it.status === "pending_review" ? "Cancel request" : "Mark as paid"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <Section title="My rent" icon={Home} rows={myRent} />
      <Section title="Shared utility bills" icon={Zap} rows={myUtil} />
    </div>
  );
};

export default Bills;
