import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";

const Trades = () => {
  const [trades, setTrades] = useState<any[]>([]);
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();

  useEffect(() => {
    fetchTrades();
  }, []);

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

      <Card>
        <CardHeader>
          <CardTitle>All Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {trades.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No trades recorded yet. Add your first trade to get started!
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Type</TableHead>
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
                  {trades.map((trade) => (
                    <TableRow key={trade.id}>
                      <TableCell className="font-medium">{trade.symbol}</TableCell>
                      <TableCell className="capitalize">{trade.position_type}</TableCell>
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
