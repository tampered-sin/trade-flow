import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { SyncReportDialog } from './SyncReportDialog';

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportReport {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: number;
  withPnL: number;
  withoutPnL: number;
}

export function CSVImportDialog({ open, onOpenChange }: CSVImportDialogProps) {
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [showReport, setShowReport] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isCSV = file.name.endsWith('.csv');
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (!isCSV && !isExcel) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a CSV or Excel file (.csv, .xlsx, .xls)',
        variant: 'destructive',
      });
      return;
    }

    setImporting(true);

    try {
      let parsedData: any[] = [];

      if (isCSV) {
        // Parse CSV file
        await new Promise((resolve, reject) => {
          Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
              parsedData = results.data;
              resolve(results);
            },
            error: (error) => reject(error),
          });
        });
      } else {
        // Parse Excel file
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        parsedData = XLSX.utils.sheet_to_json(firstSheet);
      }

      // Send parsed data to backend
      const { data, error } = await supabase.functions.invoke('import-zerodha-csv', {
        body: { trades: parsedData },
      });

      if (error) throw error;

      if (data.success) {
        setReport(data.report);
        setShowReport(true);
        onOpenChange(false);
        toast({
          title: 'Import successful',
          description: `Imported ${data.report.imported} trades from ${isCSV ? 'CSV' : 'Excel'}`,
        });
      } else {
        throw new Error(data.error || 'Import failed');
      }
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Failed to import file',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Trades from CSV/Excel</DialogTitle>
          <DialogDescription>
            Upload your Zerodha tradebook file (CSV or Excel) to import historical trades with P&L data.
          </DialogDescription>
        </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-1">File Format Requirements:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Download from Zerodha Console → Reports → Tradebook</li>
                  <li>Supports CSV (.csv) and Excel (.xlsx, .xls) files</li>
                  <li>File must include: Symbol, Trade Date, Quantity, Price, P&L</li>
                  <li>Supports both Buy and Sell orders</li>
                </ul>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-lg hover:border-primary/50 transition-colors">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <Button disabled={importing} asChild>
                  <span>
                    <Upload className="mr-2 h-4 w-4" />
                    {importing ? 'Importing...' : 'Select CSV/Excel File'}
                  </span>
                </Button>
                <input
                  id="csv-upload"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={importing}
                />
              </label>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SyncReportDialog
        open={showReport}
        onOpenChange={setShowReport}
        report={report ? {
          totalFetched: report.totalRows,
          imported: report.imported,
          skipped: report.skipped,
          withPnL: report.withPnL,
          withoutPnL: report.withoutPnL,
        } : null}
        title="CSV Import Report"
      />
    </>
  );
}
