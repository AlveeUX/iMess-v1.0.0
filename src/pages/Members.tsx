import { useState } from "react";
import { useMembers } from "@/hooks/useMessData";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1, "Name required").max(60),
  phone: z.string().trim().max(20).optional(),
  room: z.string().trim().max(20).optional(),
  seat_name: z.string().trim().max(40).optional(),
  rent_amount: z.number().min(0).max(10_000_000),
});

const Members = () => {
  const { data: members, isLoading } = useMembers();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", phone: "", room: "", seat_name: "", rent_amount: "" });

  // Admins fetch phone numbers via a SECURITY DEFINER RPC; phones are not
  // exposed via the regular members table to non-admins.
  const { data: phoneRows } = useQuery({
    queryKey: ["members-phones"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_members_with_phone");
      if (error) throw error;
      return data ?? [];
    },
  });
  const phoneById = new Map<string, string | null>(
    (phoneRows ?? []).map((r: any) => [r.id, r.phone ?? null])
  );

  const reset = () => {
    setForm({ name: "", phone: "", room: "", seat_name: "", rent_amount: "" });
    setEditing(null);
  };

  const openNew = () => {
    reset();
    setOpen(true);
  };

  const openEdit = (m: any) => {
    setEditing(m);
    setForm({
      name: m.name,
      phone: phoneById.get(m.id) ?? "",
      room: m.room ?? "",
      seat_name: m.seat_name ?? "",
      rent_amount: m.rent_amount != null ? String(m.rent_amount) : "",
    });
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({
      ...form,
      rent_amount: parseFloat(form.rent_amount || "0"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      room: form.room.trim() || null,
      seat_name: form.seat_name.trim() || null,
      rent_amount: parseFloat(form.rent_amount || "0"),
    };
    const { error } = editing
      ? await supabase.from("members").update(payload).eq("id", editing.id)
      : await supabase.from("members").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Updated" : "Member added");
    qc.invalidateQueries({ queryKey: ["members"] });
    qc.invalidateQueries({ queryKey: ["members-phones"] });
    qc.invalidateQueries({ queryKey: ["month-data"] });
    setOpen(false);
    reset();
  };

  const toggleActive = async (m: any) => {
    const { error } = await supabase
      .from("members")
      .update({ is_active: !m.is_active })
      .eq("id", m.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["members"] });
  };

  const remove = async (m: any) => {
    if (!confirm(`Delete ${m.name}? This removes all their meals & deposits.`)) return;
    const { error } = await supabase.from("members").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["members"] });
    qc.invalidateQueries({ queryKey: ["members-phones"] });
    qc.invalidateQueries({ queryKey: ["month-data"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground mt-1">{members?.length ?? 0} total</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button onClick={openNew} size="lg">
                <Plus className="w-4 h-4 mr-2" /> Add member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit member" : "New member"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={save} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} required />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={20} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Room</Label>
                    <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} maxLength={20} placeholder="A1" />
                  </div>
                  <div className="space-y-2">
                    <Label>Seat / Bed</Label>
                    <Input value={form.seat_name} onChange={(e) => setForm({ ...form, seat_name: e.target.value })} maxLength={40} placeholder="Master Bed" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Rent amount (৳)</Label>
                  <Input type="number" step="0.01" min="0" value={form.rent_amount} onChange={(e) => setForm({ ...form, rent_amount: e.target.value })} placeholder="0" />
                </div>
                <Button type="submit" className="w-full" size="lg">
                  {editing ? "Update" : "Add member"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : members?.length === 0 ? (
        <Card className="p-12 text-center gradient-card border-border/50">
          <p className="text-muted-foreground">No members yet. {isAdmin && "Add the first one!"}</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {members?.map((m) => (
            <Card key={m.id} className="p-5 gradient-card border-border/50 shadow-card">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate">{m.name}</h3>
                    {!m.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    {isAdmin && phoneById.get(m.id) && <div>{phoneById.get(m.id)}</div>}
                    {(m.room || (m as any).seat_name) && (
                      <div>
                        {m.room && <>Room {m.room}</>}
                        {(m as any).seat_name && <> · {(m as any).seat_name}</>}
                      </div>
                    )}
                    {Number((m as any).rent_amount) > 0 && (
                      <div className="text-primary font-medium">Rent ৳{Number((m as any).rent_amount).toFixed(2)}</div>
                    )}
                  </div>
                </div>
              </div>
              {isAdmin && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Switch checked={m.is_active} onCheckedChange={() => toggleActive(m)} />
                    <span className="text-xs text-muted-foreground">Active</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(m)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(m)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Members;
