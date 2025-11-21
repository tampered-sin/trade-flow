import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfDay, endOfDay } from "date-fns";
import { useCurrency } from "@/hooks/useCurrency";

interface DailyPL {
  [key: string]: number;
}

interface Trade {
  id: string;
  symbol: string;
  entry_price: number;
  exit_price: number | null;
  profit_loss: number | null;
  position_type: string;
  position_size: number;
  notes: string | null;
  entry_date: string;
  exit_date: string | null;
}

export const PLCalendarWidget = () => {
  const { formatCurrency } = useCurrency();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dailyPL, setDailyPL] = useState<DailyPL>({});
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedDayTrades, setSelectedDayTrades] = useState<Trade[]>([]);

  useEffect(() => {
    fetchMonthData();
  }, [currentDate]);

  const fetchMonthData = async () => {
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
    }
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

  const handleDayClick = async (date: Date) => {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    const { data: trades } = await supabase
      .from("trades")
      .select("*")
      .gte("entry_date", dayStart.toISOString())
      .lte("entry_date", dayEnd.toISOString())
      .order("entry_date", { ascending: true });

    if (trades) {
      setSelectedDayTrades(trades);
      setSelectedDate(date);
    }
  };

  return (
    <>
      <Card className="border-none shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-3 text-xl">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            P/L Calendar - {format(currentDate, "MMMM yyyy")}
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
                  onClick={() => pl !== 0 && handleDayClick(day)}
                  className={`aspect-square border rounded-lg p-2 flex flex-col items-center justify-center transition-all ${getDayColor(pl)} ${
                    isToday ? "ring-2 ring-primary" : ""
                  } ${pl !== 0 ? "cursor-pointer hover:scale-105 hover:shadow-md" : ""}`}
                >
                  <div className="text-sm font-medium">{format(day, "d")}</div>
                  {pl !== 0 && (
                    <div className="text-xs font-semibold mt-1">
                      {formatCurrency(pl).replace(/\.\d+$/, '')}
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

      <Dialog open={selectedDate !== null} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Trades for {selectedDate && format(selectedDate, "MMMM d, yyyy")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedDayTrades.map((trade) => (
              <Card key={trade.id}>
                <CardContent className="pt-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-lg font-semibold">{trade.symbol}</h3>
                        <Badge variant={trade.position_type === "long" ? "default" : "secondary"}>
                          {trade.position_type}
                        </Badge>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Entry Price:</span>
                          <span className="font-medium">{formatCurrency(Number(trade.entry_price))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Exit Price:</span>
                          <span className="font-medium">
                            {trade.exit_price ? formatCurrency(Number(trade.exit_price)) : "Open"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Position Size:</span>
                          <span className="font-medium">{Number(trade.position_size)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">P/L:</span>
                        <span className={`text-lg font-bold ${
                          trade.profit_loss && Number(trade.profit_loss) >= 0 
                            ? "text-success" 
                            : "text-destructive"
                        }`}>
                          {trade.profit_loss ? formatCurrency(Number(trade.profit_loss)) : "N/A"}
                        </span>
                      </div>
                      {trade.notes && (
                        <div className="mt-3">
                          <p className="text-sm text-muted-foreground mb-1">Notes:</p>
                          <p className="text-sm bg-muted p-2 rounded">{trade.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
