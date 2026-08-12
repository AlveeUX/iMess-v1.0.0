import { Badge } from "@/components/ui/badge";
import { Shield, User, Crown } from "lucide-react";
import type { AppRole } from "@/hooks/useAuth";

const meta: Record<AppRole, { label: string; icon: any; cls: string }> = {
  super_admin: { label: "Super Admin", icon: Crown, cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  admin: { label: "Admin", icon: Shield, cls: "bg-primary/15 text-primary border-primary/30" },
  member: { label: "Member", icon: User, cls: "bg-secondary text-foreground/80 border-border" },
};

export const RoleBadge = ({ role }: { role: AppRole }) => {
  const m = meta[role];
  if (!m) return null;
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${m.cls}`}>
      <Icon className="w-3 h-3" />
      {m.label}
    </Badge>
  );
};
