import { useQuery } from "@tanstack/react-query";
import { getDaysInMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { monthRange } from "@/lib/mess";

// per_visit_amount is derived, never stored — always the current month's
// rent split evenly across every scheduled visit that month.
export const calculatePerVisitAmount = (
  monthlyRent: number | null | undefined,
  visitsPerDay: number,
  date: Date
) => {
  const divisor = visitsPerDay * getDaysInMonth(date);
  return divisor > 0 ? Number(monthlyRent ?? 0) / divisor : 0;
};

export const useHousekeeper = () =>
  useQuery({
    queryKey: ["housekeeper"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("housekeeper")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const useHousekeeperAttendance = (
  housekeeperId: string | null | undefined,
  date: Date = new Date()
) => {
  const r = monthRange(date);
  return useQuery({
    queryKey: ["housekeeper-attendance", housekeeperId, r.monthKey],
    enabled: !!housekeeperId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("housekeeper_attendance")
        .select("*")
        .eq("housekeeper_id", housekeeperId as string)
        .gte("date", r.start)
        .lte("date", r.end);
      if (error) throw error;
      return data ?? [];
    },
  });
};
