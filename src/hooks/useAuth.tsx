import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "bazar_contributor" | "member" | "super_admin";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isContributor: boolean;
  memberId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  roles: [],
  isAdmin: false,
  isSuperAdmin: false,
  isContributor: false,
  memberId: null,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const [rolesRes, linkRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("member_links").select("member_id").eq("user_id", userId).maybeSingle(),
    ]);
    setRoles(((rolesRes.data ?? []) as { role: AppRole }[]).map((r) => r.role));
    setMemberId(linkRes.data?.member_id ?? null);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setLoading(true);
        setTimeout(() => {
          loadProfile(s.user.id).finally(() => setLoading(false));
        }, 0);
      } else {
        setRoles([]);
        setMemberId(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) await loadProfile(s.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const isSuperAdmin = roles.includes("super_admin");
  const isAdmin = isSuperAdmin || roles.includes("admin");
  const isContributor = isAdmin || roles.includes("bazar_contributor");

  return (
    <Ctx.Provider
      value={{
        user,
        session,
        roles,
        isAdmin,
        isSuperAdmin,
        isContributor,
        memberId,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
