import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";

const Trades = () => {
  const [trades, setTrades] = useState<any[]>([]);
  const [filteredTrades, setFilteredTrades] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBroker, setSelectedBroker] = useState<string>('all');
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();

  useEffect(() => {
    fetchTrades();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [trades, selectedCategory, selectedBroker]);

  const applyFilters = () => {
    let filtered = [...trades];

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(trade => {
        const tags = trade.tags || [];
        if (selectedCategory === 'f&o') {
          return tags.includes('futures') || tags.includes('options') || tags.includes('f&o');
        }
        return tags.includes(selectedCategory);
      });
    }

    // Filter by broker
    if (selectedBroker !== 'all') {
      filtered = filtered.filter(trade => {
        const tags = trade.tags || [];
        return tags.includes(selectedBroker);
      });
    }

    setFilteredTrades(filtered);
  };

  const fetchTrades = async () => {
    const { data } = await supabase
      .from("trades")
      .select("*")
      .order("entry_date", { ascending: false });

    if (data) {
      setTrades(data);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("trades").delete().eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Trade deleted successfully",
      });
      fetchTrades();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Trade History</h2>
        <p className="text-muted-foreground">View and manage all your trades</p>
      </div>

      {/* Filter Section */}
      <Card className="border-none shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Category Filters */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">Category</p>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={selectedCategory === 'all' ? 'default' : 'outline'}
                className="cursor-pointer transition-all hover:scale-105"
                onClick={() => setSelectedCategory('all')}
              >
                All
              </Badge>
              <Badge
                variant={selectedCategory === 'equity' ? 'default' : 'outline'}
                className="cursor-pointer transition-all hover:scale-105"
                onClick={() => setSelectedCategory('equity')}
              >
                Equity
              </Badge>
              <Badge
                variant={selectedCategory === 'futures' ? 'default' : 'outline'}
                className="cursor-pointer transition-all hover:scale-105"
                onClick={() => setSelectedCategory('futures')}
              >
                Futures
              </Badge>
              <Badge
                variant={selectedCategory === 'options' ? 'default' : 'outline'}
                className="cursor-pointer transition-all hover:scale-105"
                onClick={() => setSelectedCategory('options')}
              >
                Options
              </Badge>
              <Badge
                variant={selectedCategory === 'f&o' ? 'default' : 'outline'}
                className="cursor-pointer transition-all hover:scale-105"
                onClick={() => setSelectedCategory('f&o')}
              >
                F&O (All)
              </Badge>
            </div>
          </div>

          {/* Broker Filters */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">Broker</p>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={selectedBroker === 'all' ? 'default' : 'outline'}
                className="cursor-pointer transition-all hover:scale-105"
                onClick={() => setSelectedBroker('all')}
              >
                All Brokers
              </Badge>
              <Badge
                variant={selectedBroker === 'zerodha' ? 'default' : 'outline'}
                className="cursor-pointer transition-all hover:scale-105"
                onClick={() => setSelectedBroker('zerodha')}
              >
                Zerodha
              </Badge>
              <Badge
                variant={selectedBroker === 'groww' ? 'default' : 'outline'}
                className="cursor-pointer transition-all hover:scale-105"
                onClick={() => setSelectedBroker('groww')}
              >
                Groww
              </Badge>
            </div>
          </div>

          {/* Results count */}
          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{filteredTrades.length}</span> of <span className="font-semibold text-foreground">{trades.length}</span> trades
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-lg">
        <CardHeader>
          <CardTitle>All Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTrades.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {trades.length === 0 
                ? "No trades recorded yet. Add your first trade to get started!"
                : "No trades match the selected filters. Try adjusting your filter criteria."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Entry Date</TableHead>
                    <TableHead>Exit Date</TableHead>
                    <TableHead className="text-right">Entry Price</TableHead>
                    <TableHead className="text-right">Exit Price</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead className="text-right">P/L</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTrades.map((trade) => (
                    <TableRow key={trade.id}>
                      <TableCell className="font-medium">{trade.symbol}</TableCell>
                      <TableCell className="capitalize">{trade.position_type}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {trade.tags && trade.tags.map((tag: string, idx: number) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{new Date(trade.entry_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {trade.exit_date ? new Date(trade.exit_date).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(trade.entry_price))}</TableCell>
                      <TableCell className="text-right">
                        {trade.exit_price ? formatCurrency(Number(trade.exit_price)) : '-'}
                      </TableCell>
                      <TableCell className="text-right">{Number(trade.position_size).toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        {trade.profit_loss ? (
                          <span className={Number(trade.profit_loss) >= 0 ? 'text-success' : 'text-destructive'}>
                            {formatCurrency(Number(trade.profit_loss))}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(trade.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Trades;
