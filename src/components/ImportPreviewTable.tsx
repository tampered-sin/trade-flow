import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ParsedTrade {
  valid: boolean;
  symbol: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  pnl: number;
  category: string;
  broker: string;
  issues?: string[];
  rowIndex: number;
}

interface ImportPreviewTableProps {
  trades: ParsedTrade[];
  selectedRows: Set<number>;
  onToggleRow: (index: number) => void;
  onToggleAll: (checked: boolean) => void;
}

export function ImportPreviewTable({ trades, selectedRows, onToggleRow, onToggleAll }: ImportPreviewTableProps) {
  const validTrades = trades.filter(t => t.valid);
  const allValidSelected = validTrades.every(t => selectedRows.has(t.rowIndex));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allValidSelected}
              onCheckedChange={onToggleAll}
            />
            <span className="text-sm font-medium">Select All Valid ({validTrades.length})</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {validTrades.length} Valid
          </Badge>
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
            <AlertCircle className="h-3 w-3 mr-1" />
            {trades.length - validTrades.length} Issues
          </Badge>
        </div>
      </div>

      <ScrollArea className="h-[400px] rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Buy</TableHead>
              <TableHead className="text-right">Sell</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Issues</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.map((trade) => (
              <TableRow 
                key={trade.rowIndex}
                className={!trade.valid ? 'bg-destructive/5' : ''}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedRows.has(trade.rowIndex)}
                    onCheckedChange={() => onToggleRow(trade.rowIndex)}
                    disabled={!trade.valid}
                  />
                </TableCell>
                <TableCell>
                  {trade.valid ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{trade.symbol || '-'}</TableCell>
                <TableCell className="text-right">{trade.quantity || '-'}</TableCell>
                <TableCell className="text-right">{trade.buyPrice ? `₹${trade.buyPrice.toFixed(2)}` : '-'}</TableCell>
                <TableCell className="text-right">{trade.sellPrice ? `₹${trade.sellPrice.toFixed(2)}` : '-'}</TableCell>
                <TableCell className="text-right">
                  {trade.pnl !== 0 ? (
                    <span className={trade.pnl >= 0 ? 'text-success' : 'text-destructive'}>
                      ₹{trade.pnl.toFixed(2)}
                    </span>
                  ) : '-'}
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={
                      trade.category === 'equity' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                      trade.category === 'futures' ? 'bg-purple-500/10 text-purple-600 border-purple-500/20' :
                      trade.category === 'options' ? 'bg-orange-500/10 text-orange-600 border-orange-500/20' :
                      'bg-muted text-muted-foreground'
                    }
                  >
                    {trade.category}
                  </Badge>
                </TableCell>
                <TableCell>
                  {trade.issues && trade.issues.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {trade.issues.map((issue, idx) => (
                        <span key={idx} className="text-xs text-destructive">
                          • {issue}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
