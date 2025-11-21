import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle, XCircle, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface SyncReport {
  totalFetched: number;
  imported: number;
  skipped: number;
  withPnL: number;
  withoutPnL: number;
}

interface SyncReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: SyncReport | null;
  title?: string;
}

export const SyncReportDialog = ({ open, onOpenChange, report, title = "Sync Report" }: SyncReportDialogProps) => {
  if (!report) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-success" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Summary of trades synchronized from Zerodha
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">{report.totalFetched}</div>
                  <p className="text-sm text-muted-foreground mt-1">Orders Fetched</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-success">{report.imported}</div>
                  <p className="text-sm text-muted-foreground mt-1">New Trades Imported</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Breakdown */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-success" />
                  <div>
                    <p className="font-medium">Imported</p>
                    <p className="text-sm text-muted-foreground">New trades added to journal</p>
                  </div>
                </div>
                <div className="text-2xl font-bold text-success">{report.imported}</div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <XCircle className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Skipped</p>
                    <p className="text-sm text-muted-foreground">Already exists in journal</p>
                  </div>
                </div>
                <div className="text-2xl font-bold text-muted-foreground">{report.skipped}</div>
              </div>
            </CardContent>
          </Card>

          {/* P&L Data Status */}
          {report.imported > 0 && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  P&L Data Status
                </h3>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-success" />
                      <div>
                        <p className="font-medium text-success">With P&L Data</p>
                        <p className="text-sm text-muted-foreground">
                          Recent/active positions with profit/loss
                        </p>
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-success">{report.withPnL}</div>
                  </div>

                  {report.withoutPnL > 0 && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-warning" />
                        <div>
                          <p className="font-medium">Without P&L Data</p>
                          <p className="text-sm text-muted-foreground">
                            Can be calculated manually later
                          </p>
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-muted-foreground">{report.withoutPnL}</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Info Message */}
          {report.imported === 0 && report.totalFetched > 0 && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/10 border border-primary/20">
              <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-primary">All trades already synced</p>
                <p className="text-muted-foreground mt-1">
                  All {report.totalFetched} orders from Zerodha are already in your journal. No new trades to import.
                </p>
              </div>
            </div>
          )}

          {report.imported === 0 && report.totalFetched === 0 && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border">
              <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">No orders found</p>
                <p className="text-muted-foreground mt-1">
                  No completed orders found in your Zerodha account. Execute some trades and sync again.
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
