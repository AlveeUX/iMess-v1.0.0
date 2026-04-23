import { startOfMonth, endOfMonth, format } from "date-fns";

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);

export const monthRange = (date: Date = new Date()) => ({
  start: format(startOfMonth(date), "yyyy-MM-dd"),
  end: format(endOfMonth(date), "yyyy-MM-dd"),
  monthKey: format(startOfMonth(date), "yyyy-MM-dd"),
  label: format(date, "MMMM yyyy"),
});

export const computeRate = (totalExpense: number, totalMeals: number) =>
  totalMeals > 0 ? totalExpense / totalMeals : 0;
