import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileText, AlertCircle, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { SyncReportDialog } from './SyncReportDialog';
import { ImportPreviewTable } from './ImportPreviewTable';

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ErrorDetail {
  row: number;
  reason: string;
  data: any;
  suggestion: string;
}

interface ImportReport {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: number;
  withPnL: number;
  withoutPnL: number;
  errorDetails?: ErrorDetail[];
}

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
  rawData: any;
}

export function CSVImportDialog({ open, onOpenChange }: CSVImportDialogProps) {
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<ParsedTrade[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [fileName, setFileName] = useState<string>('');
  const { toast } = useToast();

  const validateAndParseRow = (row: any, index: number): ParsedTrade => {
    const issues: string[] = [];
    let valid = true;

    // Extract symbol - must have letters
    const symbol = String(row.Symbol || row.symbol || row['Stock name'] || row.Name || row['Scrip Name'] || '').trim();
    if (!symbol || !/[A-Za-z]{2,}/.test(symbol)) {
      issues.push('Invalid or missing symbol');
      valid = false;
    }

    // Extract numeric values
    const quantity = parseFloat(String(row.Quantity || row.quantity || row.Qty || '0'));
    const buyPrice = parseFloat(String(row['Buy Price'] || row['Buy price'] || row['Avg Buy Price'] || '0'));
    const sellPrice = parseFloat(String(row['Sell Price'] || row['Sell price'] || row['Avg Sell Price'] || '0'));
    const buyValue = parseFloat(String(row['Buy Value'] || row['buy_value'] || '0'));
    const sellValue = parseFloat(String(row['Sell Value'] || row['sell_value'] || '0'));
    const pnl = parseFloat(String(row['Realized P&L'] || row['Realised P&L'] || row['P&L'] || '0'));

    // Calculate prices from values if needed
    let finalBuyPrice = buyPrice;
    let finalSellPrice = sellPrice;
    if (buyValue > 0 && quantity > 0 && buyPrice === 0) {
      finalBuyPrice = buyValue / quantity;
    }
    if (sellValue > 0 && quantity > 0 && sellPrice === 0) {
      finalSellPrice = sellValue / quantity;
    }

    if (quantity <= 0) {
      issues.push('Invalid quantity');
      valid = false;
    }
    if (finalBuyPrice <= 0 && finalSellPrice <= 0) {
      issues.push('Missing price data');
      valid = false;
    }

    // Determine category
    const symbolUpper = symbol.toUpperCase();
    let category = 'equity';
    if (symbolUpper.includes('FUT') || symbolUpper.includes('FUTURE')) category = 'futures';
    if (symbolUpper.includes('CE') || symbolUpper.includes('PE') || 
        symbolUpper.includes('CALL') || symbolUpper.includes('PUT')) category = 'options';

    // Determine broker
    const broker = row.broker || 'unknown';

    return {
      valid,
      symbol,
      quantity,
      buyPrice: finalBuyPrice,
      sellPrice: finalSellPrice,
      pnl,
      category,
      broker,
      issues: issues.length > 0 ? issues : undefined,
      rowIndex: index,
      rawData: row
    };
  };

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
    setFileName(file.name);

    try {
      let parsedData: any[] = [];

      if (isCSV) {
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
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        parsedData = XLSX.utils.sheet_to_json(firstSheet);
      }

      // Parse and validate each row
      const parsed = parsedData.map((row, idx) => validateAndParseRow(row, idx));
      
      // Filter out completely empty rows
      const filteredParsed = parsed.filter(p => 
        p.symbol || p.quantity > 0 || p.buyPrice > 0 || p.sellPrice > 0
      );

      if (filteredParsed.length === 0) {
        throw new Error('No valid data found in the file');
      }

      // Auto-select valid rows
      const validIndices = new Set(
        filteredParsed.filter(p => p.valid).map(p => p.rowIndex)
      );

      setPreviewData(filteredParsed);
      setSelectedRows(validIndices);
      setShowPreview(true);
      
      toast({
        title: 'File parsed successfully',
        description: `Found ${validIndices.size} valid trades out of ${filteredParsed.length} rows`,
      });
    } catch (error) {
      console.error('Parse error:', error);
      toast({
        title: 'Parse failed',
        description: error instanceof Error ? error.message : 'Failed to parse file',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const handleConfirmImport = async () => {
    setImporting(true);
    try {
      // Get selected trades' raw data
      const selectedTrades = previewData
        .filter(t => selectedRows.has(t.rowIndex))
        .map(t => t.rawData);

      if (selectedTrades.length === 0) {
        toast({
          title: 'No trades selected',
          description: 'Please select at least one trade to import',
          variant: 'destructive',
        });
        return;
      }

      // Send to backend
      const { data, error } = await supabase.functions.invoke('import-zerodha-csv', {
        body: { trades: selectedTrades },
      });

      if (error) throw error;

      if (data.success) {
        setReport(data.report);
        setShowReport(true);
        setShowPreview(false);
        onOpenChange(false);
        toast({
          title: 'Import successful',
          description: `Imported ${data.report.imported} trades`,
        });
      } else {
        throw new Error(data.error || 'Import failed');
      }
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Failed to import trades',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const handleToggleRow = (index: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
  };

  const handleToggleAll = (checked: boolean) => {
    if (checked) {
      const validIndices = new Set(
        previewData.filter(p => p.valid).map(p => p.rowIndex)
      );
      setSelectedRows(validIndices);
    } else {
      setSelectedRows(new Set());
    }
  };

  const handleBack = () => {
    setShowPreview(false);
    setPreviewData([]);
    setSelectedRows(new Set());
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={showPreview ? "sm:max-w-6xl" : "sm:max-w-md"}>
          <DialogHeader>
            <DialogTitle>
              {showPreview ? `Preview Import - ${fileName}` : 'Import Trades from CSV/Excel'}
            </DialogTitle>
            <DialogDescription>
              {showPreview 
                ? 'Review and select trades to import. Deselect any rows with issues.'
                : 'Upload your broker\'s tradebook file (CSV or Excel) to import historical trades with P&L data. Supports Zerodha and Groww formats.'
              }
            </DialogDescription>
          </DialogHeader>

          {!showPreview ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium mb-1">Supported Formats:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Zerodha:</strong> Console → Reports → P&L Statement</li>
                    <li><strong>Groww:</strong> Reports → P&L Statement (Equity/F&O)</li>
                    <li>Supports CSV (.csv) and Excel (.xlsx, .xls)</li>
                    <li>Auto-detects Equity, Futures, and Options</li>
                    <li>Preview and validate before importing</li>
                  </ul>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-lg hover:border-primary/50 transition-colors">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <label htmlFor="csv-upload" className="cursor-pointer">
                  <Button disabled={importing} asChild>
                    <span>
                      <Upload className="mr-2 h-4 w-4" />
                      {importing ? 'Processing...' : 'Select CSV/Excel File'}
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
          ) : (
            <>
              <ImportPreviewTable
                trades={previewData}
                selectedRows={selectedRows}
                onToggleRow={handleToggleRow}
                onToggleAll={handleToggleAll}
              />
              <DialogFooter className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={importing}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={handleConfirmImport}
                  disabled={importing || selectedRows.size === 0}
                >
                  {importing ? 'Importing...' : `Import ${selectedRows.size} Trade${selectedRows.size !== 1 ? 's' : ''}`}
                </Button>
              </DialogFooter>
            </>
          )}
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
          errorDetails: report.errorDetails,
        } : null}
        title="CSV Import Report"
      />
    </>
  );
}
