import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Activity, DollarSign, Calculator } from "lucide-react";
import { PositionSizeCalculator } from "@/components/PositionSizeCalculator";
import { Button } from "@/components/ui/button";

interface TradeStats {
  totalTrades: number;
  totalProfitLoss: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<TradeStats>({
    totalTrades: 0,
    totalProfitLoss: 0,
    winRate: 0,
    avgWin: 0,
    avgLoss: 0,
  });
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [showCalculator, setShowCalculator] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchRecentTrades();
  }, []);

  const fetchStats = async () => {
    const { data: trades } = await supabase
      .from("trades")
      .select("profit_loss")
      .not("profit_loss", "is", null);

    if (trades && trades.length > 0) {
      const totalPL = trades.reduce((sum, t) => sum + (Number(t.profit_loss) || 0), 0);
      const wins = trades.filter((t) => Number(t.profit_loss) > 0);
      const losses = trades.filter((t) => Number(t.profit_loss) < 0);

      const avgWin = wins.length > 0 
        ? wins.reduce((sum, t) => sum + Number(t.profit_loss), 0) / wins.length 
        : 0;
      const avgLoss = losses.length > 0 
        ? losses.reduce((sum, t) => sum + Number(t.profit_loss), 0) / losses.length 
        : 0;

      setStats({
        totalTrades: trades.length,
        totalProfitLoss: totalPL,
        winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
        avgWin,
        avgLoss,
      });
    }
  };

  const fetchRecentTrades = async () => {
    const { data } = await supabase
      .from("trades")
      .select("*")
      .order("entry_date", { ascending: false })
      .limit(5);

    if (data) {
      setRecentTrades(data);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Your trading performance overview</p>
      </div>

      {/* Trading Calculators Section */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setShowCalculator(true)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Position Size & Risk Calculator
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Calculate optimal position size based on account balance, risk percentage, and stop loss distance. Includes risk-reward ratio analysis.
            </p>
            <Button variant="outline" className="mt-4 w-full" onClick={(e) => { e.stopPropagation(); setShowCalculator(true); }}>
              Open Calculator
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total P/L</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.totalProfitLoss >= 0 ? 'text-success' : 'text-destructive'}`}>
              ${stats.totalProfitLoss.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.totalTrades} trades completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.winRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Success percentage</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Win</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">${stats.avgWin.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Per winning trade</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Loss</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">${Math.abs(stats.avgLoss).toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Per losing trade</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTrades.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No trades yet. Add your first trade to get started!
            </p>
          ) : (
            <div className="space-y-3">
              {recentTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{trade.symbol}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(trade.entry_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${trade.profit_loss && Number(trade.profit_loss) >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {trade.profit_loss ? `$${Number(trade.profit_loss).toFixed(2)}` : '-'}
                    </p>
                    <p className="text-sm text-muted-foreground capitalize">{trade.position_type}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PositionSizeCalculator
        open={showCalculator}
        onOpenChange={setShowCalculator}
        onApply={(positionSize) => {
          console.log("Calculated position size:", positionSize);
          setShowCalculator(false);
        }}
        positionType="long"
      />
    </div>
  );
};

export default Dashboard;
