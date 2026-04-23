import { useState } from "react";
import { useMonthData } from "@/hooks/useMessData";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtMoney } from "@/lib/mess";
import { format, subMonths, addMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Lock, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const Report = () => {
  const [month, setMonth] = useState(new Date());
  const { data, isLoading } = useMonthData(month);

  if (isLoading || !data) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monthly Report</h1>
          <p className="text-muted-foreground mt-1">Final summary & member-wise breakdown</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setMonth(subMonths(month, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="font-semibold min-w-[140px] text-center">{format(month, "MMMM yyyy")}</div>
          <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
        </div>
      </div>

      <Card className="p-6 gradient-card border-border/50 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{format(month, "MMMM yyyy")} summary</h2>
          {data.isClosed && (
            <Badge className="gap-1"><Lock className="w-3 h-3" /> Closed</Badge>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-secondary/40">
            <div className="text-xs uppercase text-muted-foreground">Expense</div>
            <div className="text-xl font-bold mt-1">৳{fmtMoney(data.totalExpense)}</div>
          </div>
          <div className="p-4 rounded-lg bg-secondary/40">
            <div className="text-xs uppercase text-muted-foreground">Deposits</div>
            <div className="text-xl font-bold mt-1">৳{fmtMoney(data.totalDeposits)}</div>
          </div>
          <div className="p-4 rounded-lg bg-secondary/40">
            <div className="text-xs uppercase text-muted-foreground">Meals</div>
            <div className="text-xl font-bold mt-1">{fmtMoney(data.totalMeals)}</div>
          </div>
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
            <div className="text-xs uppercase text-primary">Meal rate</div>
            <div className="text-xl font-bold mt-1 text-primary">৳{fmtMoney(data.rate)}</div>
          </div>
        </div>
      </Card>

      <Card className="gradient-card border-border/50 shadow-card overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">Member-wise breakdown</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground bg-secondary/30">
                <th className="p-3">Member</th>
                <th className="p-3 text-right">Meals</th>
                <th className="p-3 text-right">Cost</th>
                <th className="p-3 text-right">Deposits</th>
                <th className="p-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.perMember.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="p-3 font-medium">{m.name}</td>
                  <td className="p-3 text-right tabular-nums">{fmtMoney(m.meals)}</td>
                  <td className="p-3 text-right tabular-nums">৳{fmtMoney(m.cost)}</td>
                  <td className="p-3 text-right tabular-nums">৳{fmtMoney(m.deposits)}</td>
                  <td className={`p-3 text-right tabular-nums font-bold ${m.balance >= 0 ? "text-success" : "text-destructive"}`}>
                    {m.balance >= 0 ? "+" : "−"}৳{fmtMoney(Math.abs(m.balance))}
                  </td>
                </tr>
              ))}
              {data.perMember.length === 0 && (
                <tr><td colSpan={5} className="p-12 text-center text-muted-foreground">No data</td></tr>
              )}
            </tbody>
            {data.perMember.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-secondary/30 font-bold">
                  <td className="p-3">Total</td>
                  <td className="p-3 text-right tabular-nums">{fmtMoney(data.totalMeals)}</td>
                  <td className="p-3 text-right tabular-nums">৳{fmtMoney(data.totalExpense)}</td>
                  <td className="p-3 text-right tabular-nums">৳{fmtMoney(data.totalDeposits)}</td>
                  <td className="p-3 text-right tabular-nums">
                    ৳{fmtMoney(data.totalDeposits - data.totalExpense)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
};

export default Report;
