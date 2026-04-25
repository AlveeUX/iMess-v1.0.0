import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  ScrollText,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Lock,
  Unlock,
  RefreshCw,
} from "lucide-react";

const actionMeta: Record<string, { icon: any; cls: string; label: string }> = {
  created: { icon: Plus, cls: "bg-success/15 text-success", label: "Created" },
  updated: { icon: Pencil, cls: "bg-info/15 text-info", label: "Updated" },
  deleted: { icon: Trash2, cls: "bg-destructive/15 text-destructive", label: "Deleted" },
  approved: { icon: Check, cls: "bg-success/15 text-success", label: "Approved" },
  rejected: { icon: X, cls: "bg-destructive/15 text-destructive", label: "Rejected" },
  closed: { icon: Lock, cls: "bg-warning/15 text-warning", label: "Closed" },
  reopened: { icon: Unlock, cls: "bg-info/15 text-info", label: "Reopened" },
  open: { icon: Plus, cls: "bg-info/15 text-info", label: "Opened" },
};

const entityLabel: Record<string, string> = {
  meals: "Meal",
  deposits: "Deposit",
  expenses: "Bazar",
  members: "Member",
  months: "Month",
  user_roles: "Role",
  correction_requests: "Correction",
};

const Transparency = () => {
  const qc = useQueryClient();
  const [entity, setEntity] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["activity_logs", entity, action, page],
    queryFn: async () => {
      let q = supabase
        .from("activity_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (entity !== "all") q = q.eq("entity_type", entity);
      if (action !== "all") q = q.eq("action", action);
      const { data, count } = await q;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const filtered = (data?.rows ?? []).filter((r) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      r.actor_email?.toLowerCase().includes(s) ||
      r.entity_type.toLowerCase().includes(s) ||
      JSON.stringify(r.diff ?? {}).toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ScrollText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Transparency Log</h1>
            <p className="text-muted-foreground mt-1">
              Append-only audit trail. Nobody can edit or delete past entries.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["activity_logs"] })}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card className="p-4 gradient-card border-border/50 shadow-card">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select value={entity} onValueChange={(v) => { setEntity(v); setPage(0); }}>
            <SelectTrigger><SelectValue placeholder="Entity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entities</SelectItem>
              {Object.entries(entityLabel).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={(v) => { setAction(v); setPage(0); }}>
            <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.keys(actionMeta).map((k) => (
                <SelectItem key={k} value={k}>{actionMeta[k].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Search email or content…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </Card>

      <Card className="gradient-card border-border/50 shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <ScrollText className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No activity matches your filters.</p>
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {filtered.map((r) => {
              const meta = actionMeta[r.action] ?? actionMeta.updated;
              const Icon = meta.icon;
              const diff = r.diff as any;
              const summary =
                diff?.after && Object.keys(diff.after).length
                  ? Object.entries(diff.after).slice(0, 3).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · ")
                  : diff?.before && Object.keys(diff.before).length
                  ? `was ${JSON.stringify(diff.before).slice(0, 80)}`
                  : "";
              return (
                <li key={r.id} className="p-4 flex items-start gap-3 hover:bg-secondary/30 transition-colors">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${meta.cls}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {entityLabel[r.entity_type] ?? r.entity_type}
                      </span>
                      <Badge variant="outline" className="text-xs">{meta.label}</Badge>
                      {r.month && (
                        <Badge variant="secondary" className="text-xs">
                          {format(new Date(r.month), "MMM yyyy")}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      {r.actor_email ?? "system"} · {format(new Date(r.created_at), "MMM d, h:mm a")}
                    </div>
                    {summary && (
                      <div className="text-xs text-muted-foreground/80 mt-1 font-mono truncate">
                        {summary}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {data && data.count > PAGE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, data.count)} of {data.count}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" disabled={(page + 1) * PAGE >= data.count} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transparency;
