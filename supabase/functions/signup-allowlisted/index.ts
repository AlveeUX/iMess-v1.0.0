// Creates a new auth user with email pre-confirmed, after verifying allowlist.
// This avoids Supabase's confirmation email (and its rate limit).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email, password, display_name } = await req.json();

    if (!email || !password) {
      return json({ error: "Email and password are required" }, 400);
    }
    if (typeof password !== "string" || password.length < 6) {
      return json({ error: "Password must be at least 6 characters" }, 400);
    }

    const normalized = String(email).trim().toLowerCase();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // Check whether this is the very first user (becomes admin automatically).
    const { count: userCount, error: countErr } = await admin
      .schema("auth" as any)
      .from("users" as any)
      .select("id", { count: "exact", head: true });

    if (countErr) {
      console.error("count users error", countErr);
      return json({ error: "Server error" }, 500);
    }

    const isFirstUser = (userCount ?? 0) === 0;

    if (!isFirstUser) {
      const { data: allow, error: allowErr } = await admin
        .from("signup_allowlist")
        .select("id")
        .eq("email", normalized)
        .maybeSingle();
      if (allowErr) {
        console.error("allowlist check error", allowErr);
        return json({ error: "Server error" }, 500);
      }
      if (!allow) {
        return json(
          { error: "Sign-ups are restricted. Ask an admin to add your email to the allowlist." },
          403
        );
      }
    }

    // Create the user with email already confirmed — no email is sent.
    const { data, error } = await admin.auth.admin.createUser({
      email: normalized,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: display_name || normalized.split("@")[0],
      },
    });

    if (error) {
      const msg = error.message || "Could not create account";
      const status = /already|registered|exists/i.test(msg) ? 409 : 400;
      return json({ error: msg }, status);
    }

    return json({ ok: true, user_id: data.user?.id });
  } catch (e) {
    console.error("signup-allowlisted error", e);
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
