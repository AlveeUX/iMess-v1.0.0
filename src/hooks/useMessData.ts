import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { monthRange, computeRate } from "@/lib/mess";

export const useMembers = () =>
  useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, name, room, is_active, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

export const useCurrentMonth = () => {
  const r = monthRange();
  return useQuery({
    queryKey: ["month", r.monthKey],
    queryFn: async () => {
      const { data } = await supabase
        .from("months")
        .select("*")
        .eq("month", r.monthKey)
        .maybeSingle();
      return data;
    },
  });
};

export const useMonthData = (date: Date = new Date()) => {
  const r = monthRange(date);
  return useQuery({
    queryKey: ["month-data", r.monthKey],
    queryFn: async () => {
      const [meals, deposits, expenses, members, monthRow] = await Promise.all([
        supabase.from("meals").select("*").gte("date", r.start).lte("date", r.end),
        supabase.from("deposits").select("*").gte("date", r.start).lte("date", r.end),
        supabase.from("expenses").select("*").gte("date", r.start).lte("date", r.end),
        supabase.from("members").select("*").order("name"),
        supabase.from("months").select("*").eq("month", r.monthKey).maybeSingle(),
      ]);

      const allExpenses = expenses.data ?? [];
      const approvedExpenses = allExpenses.filter((e) => e.status === "approved");
      const pendingExpenses = allExpenses.filter((e) => e.status === "pending");
      const rejectedExpenses = allExpenses.filter((e) => e.status === "rejected");

      const totalMeals = (meals.data ?? []).reduce((s, m) => s + Number(m.meal_count), 0);
      const totalExpense = approvedExpenses.reduce((s, e) => s + Number(e.amount), 0);
      const pendingTotal = pendingExpenses.reduce((s, e) => s + Number(e.amount), 0);
      const totalDeposits = (deposits.data ?? []).reduce((s, d) => s + Number(d.amount), 0);
      const isClosed = monthRow.data?.is_closed ?? false;
      const liveRate = computeRate(totalExpense, totalMeals);
      const rate = isClosed ? Number(monthRow.data?.final_meal_rate ?? 0) : liveRate;

      const perMember = (members.data ?? []).map((m) => {
        const memberMeals = (meals.data ?? [])
          .filter((x) => x.member_id === m.id)
          .reduce((s, x) => s + Number(x.meal_count), 0);
        const memberDeposits = (deposits.data ?? [])
          .filter((x) => x.member_id === m.id)
          .reduce((s, x) => s + Number(x.amount), 0);
        const cost = memberMeals * rate;
        return {
          ...m,
          meals: memberMeals,
          deposits: memberDeposits,
          cost,
          balance: memberDeposits - cost,
        };
      });

      return {
        range: r,
        meals: meals.data ?? [],
        deposits: deposits.data ?? [],
        expenses: allExpenses,
        approvedExpenses,
        pendingExpenses,
        rejectedExpenses,
        members: members.data ?? [],
        totalMeals,
        totalExpense,
        pendingTotal,
        totalDeposits,
        rate,
        liveRate,
        isClosed,
        monthRow: monthRow.data,
        perMember,
        pendingCount: pendingExpenses.length,
        advanceBalance: perMember.reduce((s, m) => s + Math.max(0, m.balance), 0),
        dueBalance: perMember.reduce((s, m) => s + Math.max(0, -m.balance), 0),
      };
    },
  });
};

export const useOpenCorrectionsCount = () =>
  useQuery({
    queryKey: ["corrections-open-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("correction_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "open");
      return count ?? 0;
    },
  });
