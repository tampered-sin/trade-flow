import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns";

interface DailyPL {
  [key: string]: number;
}

interface MonthlyStats {
  totalPL: number;
  winningDays: number;
  losingDays: number;
  bestDay: { date: string; amount: number } | null;
  worstDay: { date: string; amount: number } | null;
}

const PLCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dailyPL, setDailyPL] = useState<DailyPL>({});
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats>({
    totalPL: 0,
    winningDays: 0,
    losingDays: 0,
    bestDay: null,
    worstDay: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMonthData();
  }, [currentDate]);

  const fetchMonthData = async () => {
    setLoading(true);
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);

    const { data: trades } = await supabase
      .from("trades")
      .select("entry_date, profit_loss")
      .gte("entry_date", start.toISOString())
      .lte("entry_date", end.toISOString())
      .not("profit_loss", "is", null);

    if (trades) {
      const plByDay: DailyPL = {};
      trades.forEach((trade) => {
        const dateKey = format(new Date(trade.entry_date), "yyyy-MM-dd");
        plByDay[dateKey] = (plByDay[dateKey] || 0) + Number(trade.profit_loss);
      });
      setDailyPL(plByDay);

      // Calculate monthly stats
      let totalPL = 0;
      let winningDays = 0;
      let losingDays = 0;
      let bestDay: { date: string; amount: number } | null = null;
      let worstDay: { date: string; amount: number } | null = null;

      Object.entries(plByDay).forEach(([date, amount]) => {
        totalPL += amount;
        if (amount > 0) winningDays++;
        if (amount < 0) losingDays++;
        
        if (!bestDay || amount > bestDay.amount) {
          bestDay = { date, amount };
        }
        if (!worstDay || amount < worstDay.amount) {
          worstDay = { date, amount };
        }
      });

      setMonthlyStats({
        totalPL,
        winningDays,
        losingDays,
        bestDay,
        worstDay,
      });
    }
    setLoading(false);
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const startDayOfWeek = monthStart.getDay();
  const emptyDays = Array(startDayOfWeek).fill(null);

  const getPLForDay = (date: Date) => {
    const dateKey = format(date, "yyyy-MM-dd");
    return dailyPL[dateKey] || 0;
  };

  const getDayColor = (pl: number) => {
    if (pl > 0) return "bg-success/20 border-success/40 text-success";
    if (pl < 0) return "bg-destructive/20 border-destructive/40 text-destructive";
    return "bg-muted/50 border-border";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">P/L Calendar</h2>
        <p className="text-muted-foreground">Daily profit and loss overview</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total P/L</p>
              <p className={`text-2xl font-bold ${monthlyStats.totalPL >= 0 ? "text-success" : "text-destructive"}`}>
                ${monthlyStats.totalPL.toFixed(2)}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Trading Days</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-success">{monthlyStats.winningDays}</span>
                <span className="text-sm text-muted-foreground">wins</span>
                <span className="text-2xl font-bold text-destructive">{monthlyStats.losingDays}</span>
                <span className="text-sm text-muted-foreground">losses</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Best Day</p>
              {monthlyStats.bestDay ? (
                <>
                  <p className="text-2xl font-bold text-success">
                    ${monthlyStats.bestDay.amount.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(monthlyStats.bestDay.date), "MMM d")}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No data</p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Worst Day</p>
              {monthlyStats.worstDay ? (
                <>
                  <p className="text-2xl font-bold text-destructive">
                    ${monthlyStats.worstDay.amount.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(monthlyStats.worstDay.date), "MMM d")}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No data</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {format(currentDate, "MMMM yyyy")}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentDate(new Date())}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground p-2">
                {day}
              </div>
            ))}
            {emptyDays.map((_, index) => (
              <div key={`empty-${index}`} className="aspect-square" />
            ))}
            {daysInMonth.map((day) => {
              const pl = getPLForDay(day);
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={day.toISOString()}
                  className={`aspect-square border rounded-lg p-2 flex flex-col items-center justify-center transition-colors ${getDayColor(pl)} ${
                    isToday ? "ring-2 ring-primary" : ""
                  }`}
                >
                  <div className="text-sm font-medium">{format(day, "d")}</div>
                  {pl !== 0 && (
                    <div className="text-xs font-semibold mt-1">
                      ${pl.toFixed(0)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-success/20 border border-success/40" />
              <span className="text-sm text-muted-foreground">Profit</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-destructive/20 border border-destructive/40" />
              <span className="text-sm text-muted-foreground">Loss</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-muted/50 border border-border" />
              <span className="text-sm text-muted-foreground">No trades</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PLCalendar;
