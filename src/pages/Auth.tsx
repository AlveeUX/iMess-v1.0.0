import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { UtensilsCrossed, Shield, User } from "lucide-react";
import { cn } from "@/lib/utils";

const schema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "Min 6 characters").max(72),
});

type LoginType = "admin" | "member";

const Auth = () => {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loginType, setLoginType] = useState<LoginType>("member");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) nav("/", { replace: true });
  }, [user, loading, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data: fnData, error: fnError } = await supabase.functions.invoke(
          "signup-allowlisted",
          { body: { email, password, display_name: name || email.split("@")[0] } }
        );
        if (fnError) {
          // Try to surface the function's JSON error message
          const ctx: any = (fnError as any).context;
          let msg = fnError.message;
          try {
            const body = await ctx?.json?.();
            if (body?.error) msg = body.error;
          } catch {}
          throw new Error(msg);
        }
        if (fnData?.error) throw new Error(fnData.error);
        toast.success("Account created. You can sign in now.");
        setMode("signup" === mode ? "signin" : "signin");
        setPassword("");
      } else {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Enforce role-gated login: verify the signed-in user matches the selected portal.
        const userId = signInData.user?.id;
        if (userId) {
          const { data: roleRows, error: rolesErr } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId);
          if (rolesErr) throw rolesErr;
          const roles = (roleRows ?? []).map((r) => r.role);
          const isAdmin = roles.includes("admin");

          if (loginType === "admin" && !isAdmin) {
            await supabase.auth.signOut();
            toast.error("This account is not an admin. Use the Member portal.");
            setBusy(false);
            return;
          }
          if (loginType === "member" && isAdmin) {
            await supabase.auth.signOut();
            toast.error("Admins must use the Admin portal — keeping roles separate for transparency.");
            setBusy(false);
            return;
          }
        }
        toast.success(loginType === "admin" ? "Welcome, admin" : "Welcome back");
      }
    } catch (err: any) {
      const msg = err?.message || "Something went wrong";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!loading && user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-hero">
      <Card className="w-full max-w-md p-8 gradient-card shadow-elevated border-border/50">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mb-4 shadow-glow">
            <UtensilsCrossed className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Mess Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signin" ? `Sign in as ${loginType}` : "Create your account"}
          </p>
        </div>

        {mode === "signin" && (
          <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-secondary/50 mb-5">
            {(["member", "admin"] as LoginType[]).map((t) => {
              const active = loginType === t;
              const Icon = t === "admin" ? Shield : User;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setLoginType(t)}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all",
                    active
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t === "admin" ? "Admin" : "Member"}
                </button>
              );
            })}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={60} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} maxLength={72} />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy
              ? "Please wait..."
              : mode === "signin"
              ? loginType === "admin"
                ? "Sign in as Admin"
                : "Sign in as Member"
              : "Sign up"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "No account?" : "Have an account?"}{" "}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-primary hover:underline font-medium"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </div>
        <p className="mt-4 text-xs text-center text-muted-foreground">
          {mode === "signin"
            ? "Admins and members use separate portals to keep roles transparent."
            : "The first account becomes the admin. After that, only emails approved by an admin can sign up."}
        </p>
      </Card>
    </div>
  );
};

export default Auth;
