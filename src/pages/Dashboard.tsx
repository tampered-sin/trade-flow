import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Activity, DollarSign, Calculator, RefreshCw, Upload, BarChart3 } from "lucide-react";
import { PositionSizeCalculator } from "@/components/PositionSizeCalculator";
import { SyncReportDialog } from "@/components/SyncReportDialog";
import { CSVImportDialog } from "@/components/CSVImportDialog";
import { PLCalendarWidget } from "@/components/PLCalendarWidget";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface TradeStats {
  totalTrades: number;
  totalProfitLoss: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
}

interface SyncReport {
  totalFetched: number;
  imported: number;
  skipped: number;
  withPnL: number;
  withoutPnL: number;
}

const Dashboard = () => {
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const [stats, setStats] = useState<TradeStats>({
    totalTrades: 0,
    totalProfitLoss: 0,
    winRate: 0,
    avgWin: 0,
    avgLoss: 0,
  });
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [showCalculator, setShowCalculator] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);
  const [showSyncReport, setShowSyncReport] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [profitTrendData, setProfitTrendData] = useState<any[]>([]);
  const [winRateData, setWinRateData] = useState<any[]>([]);
  const [distributionData, setDistributionData] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
    fetchRecentTrades();
    fetchChartData();
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

  const fetchChartData = async () => {
    const { data: trades } = await supabase
      .from("trades")
      .select("*")
      .not("profit_loss", "is", null)
      .order("entry_date", { ascending: true });

    if (trades && trades.length > 0) {
      // Profit Trend Data - aggregate by date
      const profitByDate = trades.reduce((acc: any, trade) => {
        const date = new Date(trade.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (!acc[date]) {
          acc[date] = 0;
        }
        acc[date] += Number(trade.profit_loss);
        return acc;
      }, {});

      const profitTrend = Object.entries(profitByDate).map(([date, profit]) => ({
        date,
        profit: Number(profit),
      }));
      setProfitTrendData(profitTrend);

      // Win Rate Over Time - calculate cumulative win rate
      let wins = 0;
      let total = 0;
      const winRateOverTime = trades.map((trade) => {
        total++;
        if (Number(trade.profit_loss) > 0) wins++;
        return {
          date: new Date(trade.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          winRate: (wins / total) * 100,
        };
      });
      // Sample every few points to avoid overcrowding
      const sampledWinRate = winRateOverTime.filter((_, index) => index % Math.max(1, Math.floor(winRateOverTime.length / 15)) === 0);
      setWinRateData(sampledWinRate);

      // Trade Distribution Data
      const longTrades = trades.filter(t => t.position_type.toLowerCase() === 'long').length;
      const shortTrades = trades.filter(t => t.position_type.toLowerCase() === 'short').length;
      const wins_count = trades.filter(t => Number(t.profit_loss) > 0).length;
      const losses_count = trades.filter(t => Number(t.profit_loss) < 0).length;

      setDistributionData([
        { name: 'Long', value: longTrades, color: 'hsl(var(--chart-1))' },
        { name: 'Short', value: shortTrades, color: 'hsl(var(--chart-2))' },
        { name: 'Wins', value: wins_count, color: 'hsl(var(--success))' },
        { name: 'Losses', value: losses_count, color: 'hsl(var(--destructive))' },
      ]);
    }
  };

  const handleSyncZerodha = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Error",
          description: "You must be logged in to sync trades",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('sync-zerodha-trades', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        // Show sync report
        if (data.report) {
          setSyncReport(data.report);
          setShowSyncReport(true);
        }
        
        toast({
          title: "Success",
          description: data.message,
        });
        
        // Refresh the dashboard data
        fetchStats();
        fetchRecentTrades();
        fetchChartData();
      } else {
        // Check if it's a token expiration or connection issue
        if (data.isTokenExpired) {
          toast({
            title: "Zerodha Not Connected",
            description: data.instructions || "Please go to Settings to connect your Zerodha account. You'll need to save your API key and secret, then complete the OAuth connection.",
            variant: "destructive",
            duration: 10000,
          });
        } else {
          throw new Error(data.error || 'Failed to sync trades');
        }
      }
    } catch (error) {
      console.error('Sync error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync trades from Zerodha';
      toast({
        title: "Sync Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground mt-1">Track your trading performance</p>
        </div>
      </div>

      {/* Trading Tools Section */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="cursor-pointer border-none shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]" onClick={() => setShowCalculator(true)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl">
              <div className="p-3 gradient-primary rounded-xl">
                <Calculator className="h-6 w-6 text-white" />
              </div>
              Position Size & Risk Calculator
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Calculate optimal position size based on account balance, risk percentage, and stop loss distance. Includes risk-reward ratio analysis.
            </p>
            <Button variant="outline" className="mt-6 w-full border-primary/20 hover:bg-primary/5" onClick={(e) => { e.stopPropagation(); setShowCalculator(true); }}>
              Open Calculator
            </Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer border-none shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl">
              <div className="p-3 gradient-primary rounded-xl">
                <RefreshCw className={`h-6 w-6 text-white ${syncing ? 'animate-spin' : ''}`} />
              </div>
              Sync & Import Trades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Import trades from Zerodha: sync today's orders via API or upload historical data via CSV/Excel.
            </p>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1 border-primary/20 hover:bg-primary/5" 
                onClick={handleSyncZerodha}
                disabled={syncing}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Today'}
              </Button>
              <Button 
                variant="outline" 
                className="flex-1 border-primary/20 hover:bg-primary/5"
                onClick={() => setShowCSVImport(true)}
              >
                <Upload className="mr-2 h-4 w-4" />
                Import File
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Overview - TradeZella Style */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden border-none shadow-lg transition-shadow hover:shadow-xl">
          <div className="absolute inset-0 gradient-card"></div>
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total P/L</CardTitle>
            <div className="p-2 bg-primary/10 rounded-lg">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className={`text-3xl font-bold ${stats.totalProfitLoss >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(stats.totalProfitLoss)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {stats.totalTrades} trades completed
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-none shadow-lg transition-shadow hover:shadow-xl">
          <div className="absolute inset-0 gradient-card"></div>
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
            <div className="p-2 bg-primary/10 rounded-lg">
              <Activity className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-3xl font-bold">{stats.winRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-2">Success percentage</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-none shadow-lg transition-shadow hover:shadow-xl">
          <div className="absolute inset-0 bg-success/5"></div>
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Win</CardTitle>
            <div className="p-2 bg-success/10 rounded-lg">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-3xl font-bold text-success">{formatCurrency(stats.avgWin)}</div>
            <p className="text-xs text-muted-foreground mt-2">Per winning trade</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-none shadow-lg transition-shadow hover:shadow-xl">
          <div className="absolute inset-0 bg-destructive/5"></div>
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Loss</CardTitle>
            <div className="p-2 bg-destructive/10 rounded-lg">
              <TrendingDown className="h-5 w-5 text-destructive" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-3xl font-bold text-destructive">{formatCurrency(Math.abs(stats.avgLoss))}</div>
            <p className="text-xs text-muted-foreground mt-2">Per losing trade</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <PLCalendarWidget />

      {profitTrendData.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-primary" />
                </div>
                Profit Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={profitTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: any) => formatCurrency(value)}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="profit" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--primary))', r: 5 }}
                    animationDuration={1500}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                Win Rate Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={winRateData}>
                  <defs>
                    <linearGradient id="colorWinRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    domain={[0, 100]}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: any) => `${value.toFixed(1)}%`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="winRate" 
                    stroke="hsl(var(--success))" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorWinRate)"
                    animationDuration={1500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {distributionData.length > 0 && (
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 bg-primary/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              Trade Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-8">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={distributionData.slice(0, 2)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    animationDuration={1500}
                  >
                    {distributionData.slice(0, 2).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={distributionData.slice(2, 4)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    animationDuration={1500}
                  >
                    {distributionData.slice(2, 4).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-none shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Recent Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTrades.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No trades yet. Add your first trade to get started!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-semibold text-lg">{trade.symbol}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(trade.entry_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-lg ${trade.profit_loss && Number(trade.profit_loss) >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {trade.profit_loss ? formatCurrency(Number(trade.profit_loss)) : '-'}
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

      <SyncReportDialog 
        open={showSyncReport} 
        onOpenChange={setShowSyncReport}
        report={syncReport}
      />
      <CSVImportDialog 
        open={showCSVImport}
        onOpenChange={setShowCSVImport}
      />
    </div>
  );
};

export default Dashboard;
