import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import logo from "@/assets/icons/Mess pilot white.png";

const schema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "Min 6 characters").max(72),
});

const Auth = () => {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
          let msg = fnError.message || "Could not create account";
          const res = (fnError as any).context as Response | undefined;
          if (res && typeof res.json === "function") {
            try {
              const body = await res.json();
              if (body?.error) msg = body.error;
            } catch {}
          }
          throw new Error(msg);
        }
        if (fnData?.error) throw new Error(fnData.error);
        toast.success("Account created. You can sign in now.");
        setMode("signin");
        setPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
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
          <img src={logo} alt="MessPilot" className="w-14 h-14 rounded-2xl mb-4 shadow-glow object-contain" />
          <h1 className="text-2xl font-bold">MessPilot</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signin" ? "Sign in to your account" : "Create your account"}
          </p>
        </div>

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
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                maxLength={72}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Sign up"}
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
        {mode === "signup" && (
          <p className="mt-4 text-xs text-center text-muted-foreground">
            The first account becomes the admin. After that, only emails approved by an admin can sign up.
          </p>
        )}
      </Card>
    </div>
  );
};

export default Auth;
