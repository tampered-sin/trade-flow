import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Activity, DollarSign, Calculator, RefreshCw, Upload } from "lucide-react";
import { PositionSizeCalculator } from "@/components/PositionSizeCalculator";
import { SyncReportDialog } from "@/components/SyncReportDialog";
import { CSVImportDialog } from "@/components/CSVImportDialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";

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
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Your trading performance overview</p>
      </div>

      {/* Trading Tools Section */}
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

        <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className={`h-5 w-5 text-primary ${syncing ? 'animate-spin' : ''}`} />
              Sync & Import Trades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Import trades from Zerodha: sync today's orders via API or upload historical data via CSV.
            </p>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={handleSyncZerodha}
                disabled={syncing}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Today'}
              </Button>
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setShowCSVImport(true)}
              >
                <Upload className="mr-2 h-4 w-4" />
                Import CSV
              </Button>
            </div>
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
              {formatCurrency(stats.totalProfitLoss)}
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
            <div className="text-2xl font-bold text-success">{formatCurrency(stats.avgWin)}</div>
            <p className="text-xs text-muted-foreground">Per winning trade</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Loss</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(Math.abs(stats.avgLoss))}</div>
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
