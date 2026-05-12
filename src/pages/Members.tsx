import { useState } from "react";
import { useMembers, useMonthData } from "@/hooks/useMessData";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Plus, Pencil, Trash2, Link2, Unlink, Crown, Utensils, Wallet, ShoppingBasket, Zap } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { fmtMoney } from "@/lib/mess";

const schema = z.object({
  name: z.string().trim().min(1, "Name required").max(60),
  phone: z.string().trim().max(20).optional(),
  room: z.string().trim().max(20).optional(),
  seat_name: z.string().trim().max(40).optional(),
  rent_amount: z.number().min(0).max(10_000_000),
});

type AuthUser = { id: string; email: string; display_name: string | null };
type RoleRow = { user_id: string; role: "admin" | "bazar_contributor" | "member" | "super_admin" };
type LinkRow = { member_id: string; user_id: string };

const Members = () => {
  const { data: members, isLoading } = useMembers();
  const { data: monthData } = useMonthData();
  const { isAdmin, isSuperAdmin, memberId: myMemberId } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", phone: "", room: "", seat_name: "", rent_amount: "" });
  const [transferTo, setTransferTo] = useState<{ userId: string; email: string } | null>(null);

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

  const { data: authUsers } = useQuery({
    queryKey: ["auth-users"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_auth_users");
      if (error) throw error;
      return (data ?? []) as AuthUser[];
    },
  });

  const { data: links } = useQuery({
    queryKey: ["member-links-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("member_links").select("member_id,user_id");
      if (error) throw error;
      return (data ?? []) as LinkRow[];
    },
  });

  const { data: allRoles } = useQuery({
    queryKey: ["all-roles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id,role");
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
  });

  const linkByMember = new Map<string, string>((links ?? []).map((l) => [l.member_id, l.user_id]));
  const userById = new Map<string, AuthUser>((authUsers ?? []).map((u) => [u.id, u]));
  const rolesByUser = (() => {
    const m = new Map<string, Set<string>>();
    (allRoles ?? []).forEach((r) => {
      if (!m.has(r.user_id)) m.set(r.user_id, new Set());
      m.get(r.user_id)!.add(r.role);
    });
    return m;
  })();

  const reset = () => {
    setForm({ name: "", phone: "", room: "", seat_name: "", rent_amount: "" });
    setEditing(null);
  };
  const openNew = () => { reset(); setOpen(true); };
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
    const parsed = schema.safeParse({ ...form, rent_amount: parseFloat(form.rent_amount || "0") });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
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
    const { error } = await supabase.from("members").update({ is_active: !m.is_active }).eq("id", m.id);
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

  const linkAccount = async (memberId: string, userId: string) => {
    // delete any existing link for this member, then insert new one
    await supabase.from("member_links").delete().eq("member_id", memberId);
    const { error } = await supabase.from("member_links").insert({ member_id: memberId, user_id: userId });
    if (error) return toast.error(error.message);
    toast.success("Account linked");
    qc.invalidateQueries({ queryKey: ["member-links-all"] });
  };

  const unlinkAccount = async (memberId: string) => {
    const { error } = await supabase.from("member_links").delete().eq("member_id", memberId);
    if (error) return toast.error(error.message);
    toast.success("Unlinked");
    qc.invalidateQueries({ queryKey: ["member-links-all"] });
  };

  const toggleRole = async (userId: string, role: "admin" | "bazar_contributor", on: boolean) => {
    if (on) {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["all-roles"] });
  };

  const grantSuperAdmin = async (userId: string) => {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "super_admin" });
    if (error) return toast.error(error.message);
    toast.success("Super admin granted");
    qc.invalidateQueries({ queryKey: ["all-roles"] });
    setTransferTo(null);
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
          {members?.map((m) => {
            const linkedUserId = linkByMember.get(m.id);
            const linkedUser = linkedUserId ? userById.get(linkedUserId) : null;
            const userRoles = linkedUserId ? rolesByUser.get(linkedUserId) ?? new Set<string>() : new Set<string>();
            const linkedMemberIds = new Set((links ?? []).map((l) => l.member_id));
            const availableUsers = (authUsers ?? []).filter((u) => {
              // hide users already linked to another member
              const usedBy = (links ?? []).find((l) => l.user_id === u.id);
              return !usedBy || usedBy.member_id === m.id;
            });
            return (
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
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1.5">
                        <Link2 className="w-3 h-3" /> Linked account
                      </Label>
                      <div className="flex gap-1.5">
                        <Select
                          value={linkedUserId ?? ""}
                          onValueChange={(v) => linkAccount(m.id, v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="No account linked" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableUsers.length === 0 && (
                              <div className="text-xs text-muted-foreground p-2">No users available</div>
                            )}
                            {availableUsers.map((u) => (
                              <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {linkedUserId && (
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => unlinkAccount(m.id)}>
                            <Unlink className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {linkedUserId && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Roles</Label>
                        <div className="flex gap-3 text-xs">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <Checkbox
                              checked={userRoles.has("admin")}
                              onCheckedChange={(v) => toggleRole(linkedUserId, "admin", !!v)}
                            />
                            Admin
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <Checkbox
                              checked={userRoles.has("bazar_contributor")}
                              onCheckedChange={(v) => toggleRole(linkedUserId, "bazar_contributor", !!v)}
                            />
                            Bazar contributor
                          </label>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
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
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Members;
