import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { UserPlus, Trash2, Mail } from "lucide-react";
import { z } from "zod";

interface AllowlistEntry {
  id: string;
  email: string;
  note: string | null;
  created_at: string;
}

const emailSchema = z.string().trim().email("Invalid email").max(255);

export const SignupAllowlist = () => {
  const [rows, setRows] = useState<AllowlistEntry[]>([]);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    // signup_allowlist is not yet in generated types; cast through any
    const { data, error } = await (supabase as any)
      .from("signup_allowlist")
      .select("id,email,note,created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data as AllowlistEntry[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    const { error } = await (supabase as any)
      .from("signup_allowlist")
      .insert({ email: parsed.data.toLowerCase(), note: note.trim() || null });
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Email already on the list" : error.message);
      return;
    }
    setEmail("");
    setNote("");
    toast.success("Email approved for signup");
    load();
  };

  const remove = async (id: string, em: string) => {
    if (!confirm(`Remove ${em} from the allowlist?`)) return;
    const { error } = await (supabase as any).from("signup_allowlist").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    load();
  };

  return (
    <Card className="p-6 gradient-card border-border/50 shadow-card">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Mail className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold">Signup allowlist</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Only emails you add here can register. Random visitors are blocked.
          </p>
        </div>
      </div>

      <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 mb-4">
        <Input
          type="email"
          placeholder="housemate@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={255}
        />
        <Input
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={120}
        />
        <Button type="submit" disabled={busy}>
          <UserPlus className="w-4 h-4 mr-2" />
          {busy ? "Adding…" : "Add"}
        </Button>
      </form>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No emails approved yet. The first signup automatically becomes admin.
        </p>
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((r) => (
            <li key={r.id} className="py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{r.email}</div>
                {r.note && <div className="text-xs text-muted-foreground truncate">{r.note}</div>}
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(r.id, r.email)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};
