import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { monthRange, computeRate } from "@/lib/mess";

export const useMembers = () =>
  useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, name, room, seat_name, rent_amount, is_active, created_at")
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
      const [meals, deposits, expenses, members, monthRow, billsRes, billItemsRes, awayRes] = await Promise.all([
        supabase.from("meals").select("*").gte("date", r.start).lte("date", r.end),
        supabase.from("deposits").select("*").gte("date", r.start).lte("date", r.end),
        supabase.from("expenses").select("*").gte("date", r.start).lte("date", r.end),
        supabase.from("members").select("id, name, room, seat_name, rent_amount, is_active, created_at").order("name"),
        supabase.from("months").select("*").eq("month", r.monthKey).maybeSingle(),
        supabase.from("bills_v2").select("*").gte("due_date", r.start).lte("due_date", r.end),
        supabase.from("bill_items").select("*"),
        supabase
          .from("member_away_periods")
          .select("*")
          .eq("status", "approved")
          .lte("start_date", r.end)
          .gte("end_date", r.start),
      ]);


      const allExpenses = expenses.data ?? [];
      const approvedExpenses = allExpenses.filter((e) => e.status === "approved");
      const pendingExpenses = allExpenses.filter((e) => e.status === "pending");
      const rejectedExpenses = allExpenses.filter((e) => e.status === "rejected");

      const allDeposits = (deposits.data ?? []) as any[];
      const approvedDeposits = allDeposits.filter((d) => (d.status ?? "approved") === "approved");
      const pendingDeposits = allDeposits.filter((d) => d.status === "pending");

      const totalMeals = (meals.data ?? []).reduce((s, m) => s + Number(m.meal_count), 0);
      const totalExpense = approvedExpenses.reduce((s, e) => s + Number(e.amount), 0);
      const pendingTotal = pendingExpenses.reduce((s, e) => s + Number(e.amount), 0);
      const totalDeposits = approvedDeposits.reduce((s, d) => s + Number(d.amount), 0);
      const pendingDepositTotal = pendingDeposits.reduce((s, d) => s + Number(d.amount), 0);
      const isClosed = monthRow.data?.is_closed ?? false;
      const liveRate = computeRate(totalExpense, totalMeals);
      const rate = isClosed ? Number(monthRow.data?.final_meal_rate ?? 0) : liveRate;

      // Bills summary for the month
      const monthBills = billsRes.data ?? [];
      const monthBillIds = new Set(monthBills.map((b: any) => b.id));
      const monthItems = (billItemsRes.data ?? []).filter((it: any) => monthBillIds.has(it.bill_id));
      const billTypeById: Record<string, string> = Object.fromEntries(
        monthBills.map((b: any) => [b.id, b.bill_type])
      );
      let rentCollected = 0,
        rentUnpaid = 0,
        utilCollected = 0,
        utilUnpaid = 0;
      for (const it of monthItems) {
        const t = billTypeById[it.bill_id];
        const amt = Number(it.amount);
        if (t === "rent") {
          if (it.status === "paid") rentCollected += amt;
          else rentUnpaid += amt;
        } else if (t === "utility") {
          if (it.status === "paid") utilCollected += amt;
          else utilUnpaid += amt;
        }
      }
      const memberDuesMap: Record<string, { rent: number; utility: number }> = {};
      for (const it of monthItems) {
        if (it.status === "paid") continue;
        const t = billTypeById[it.bill_id];
        memberDuesMap[it.member_id] ||= { rent: 0, utility: 0 };
        if (t === "rent") memberDuesMap[it.member_id].rent += Number(it.amount);
        else if (t === "utility") memberDuesMap[it.member_id].utility += Number(it.amount);
      }

      const perMember = (members.data ?? []).map((m) => {
        const memberMeals = (meals.data ?? [])
          .filter((x) => x.member_id === m.id)
          .reduce((s, x) => s + Number(x.meal_count), 0);
        const memberDeposits = (deposits.data ?? [])
          .filter((x) => x.member_id === m.id)
          .reduce((s, x) => s + Number(x.amount), 0);
        const cost = memberMeals * rate;
        const dues = memberDuesMap[m.id] ?? { rent: 0, utility: 0 };
        return {
          ...m,
          meals: memberMeals,
          deposits: memberDeposits,
          cost,
          balance: memberDeposits - cost,
          rentDue: dues.rent,
          utilityDue: dues.utility,
        };
      });

      // Away periods → awayByMemberDate map (member_id -> Set<yyyy-MM-dd>)
      const awayRows = (awayRes.data ?? []) as any[];
      const awayByMemberDate = new Map<string, Set<string>>();
      const rangeStart = new Date(r.start);
      const rangeEnd = new Date(r.end);
      for (const a of awayRows) {
        const s = new Date(a.start_date < r.start ? r.start : a.start_date);
        const e = new Date(a.end_date > r.end ? r.end : a.end_date);
        const set = awayByMemberDate.get(a.member_id) ?? new Set<string>();
        const d = new Date(s);
        while (d <= e) {
          const key = d.toISOString().slice(0, 10);
          set.add(key);
          d.setDate(d.getDate() + 1);
        }
        awayByMemberDate.set(a.member_id, set);
        void rangeStart; void rangeEnd;
      }

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
        rentCollected,
        rentUnpaid,
        utilCollected,
        utilUnpaid,
        awayPeriods: awayRows,
        awayByMemberDate,
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
