import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CSVRow {
  [key: string]: string | number;
}

interface ParsedTrade {
  symbol: string;
  tradeDate: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  pnl: number;
  tradeType: string;
  category: string;
  broker: string;
}

interface ErrorDetail {
  row: number;
  reason: string;
  data: any;
  suggestion: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { trades } = await req.json();

    if (!Array.isArray(trades) || trades.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No trades data provided' 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Processing ${trades.length} rows from uploaded file (CSV/Excel)`);
    console.log('First row sample:', trades[0]);

    // Get existing trades to avoid duplicates
    const { data: existingTrades } = await supabase
      .from('trades')
      .select('symbol, entry_date, entry_price, position_size')
      .eq('user_id', user.id);

    const existingTradeKeys = new Set(
      existingTrades?.map(t => 
        `${t.symbol}_${t.entry_date}_${t.entry_price}_${t.position_size}`
      ) || []
    );

    const transformedTrades = [];
    const errorDetails: ErrorDetail[] = [];
    let skipped = 0;
    let errors = 0;
    let withPnL = 0;
    let withoutPnL = 0;

    // Helper function to determine trade category
    const determineCategory = (symbol: string): string => {
      const symbolUpper = symbol.toUpperCase();
      if (symbolUpper.includes('FUT') || symbolUpper.includes('FUTURE')) return 'futures';
      if (symbolUpper.includes('CE') || symbolUpper.includes('PE') || 
          symbolUpper.includes('CALL') || symbolUpper.includes('PUT') || 
          symbolUpper.includes('OPT')) return 'options';
      return 'equity';
    };

    // Helper function to parse Zerodha format (both tradebook and P&L report)
    const parseZerodhaRow = (row: CSVRow): ParsedTrade | null => {
      const symbol = String(row['symbol'] || row['Symbol'] || row['SYMBOL'] || row['scrip_name'] || '').trim();
      
      // Skip summary rows and headers
      if (!symbol || 
          symbol.includes('Summary') || 
          symbol.includes('Charges') ||
          symbol.includes('Client ID') ||
          symbol.includes('P&L Statement') ||
          symbol.includes('Other Debits')) {
        return null;
      }

      // Try P&L report format first (has Buy Value, Sell Value columns)
      const buyValue = parseFloat(String(row['Buy Value'] || row['buy_value'] || '0'));
      const sellValue = parseFloat(String(row['Sell Value'] || row['sell_value'] || '0'));
      const quantity = parseFloat(String(row['quantity'] || row['Quantity'] || row['qty'] || '0'));
      const realizedPnL = parseFloat(String(row['Realized P&L'] || row['Realised P&L'] || row['pnl'] || row['P&L'] || row['profit_loss'] || '0'));
      
      // P&L Report format (aggregate data)
      if (buyValue > 0 && sellValue > 0 && quantity > 0) {
        const avgBuyPrice = buyValue / quantity;
        const avgSellPrice = sellValue / quantity;
        
        return {
          symbol,
          tradeDate: new Date().toISOString().split('T')[0], // Use today's date for P&L reports
          quantity,
          buyPrice: avgBuyPrice,
          sellPrice: avgSellPrice,
          pnl: realizedPnL,
          tradeType: 'both',
          category: determineCategory(symbol),
          broker: 'zerodha'
        };
      }

      // Tradebook format (individual trades with dates)
      const tradeDate = String(row['trade_date'] || row['Trade date'] || row['Date'] || row['date'] || '').trim();
      const buyPrice = parseFloat(String(row['trade_price'] || row['Price'] || row['price'] || row['buy_price'] || '0'));
      const sellPrice = parseFloat(String(row['sell_price'] || row['Sell Price'] || '0'));
      const pnl = parseFloat(String(row['pnl'] || row['P&L'] || row['profit_loss'] || '0'));
      const tradeType = String(row['trade_type'] || row['Type'] || row['type'] || '').toLowerCase();

      if (!tradeDate || !quantity || (buyPrice === 0 && sellPrice === 0)) {
        return null;
      }

      return {
        symbol,
        tradeDate,
        quantity,
        buyPrice,
        sellPrice,
        pnl,
        tradeType,
        category: determineCategory(symbol),
        broker: 'zerodha'
      };
    };

    // Helper function to parse Groww format
    const parseGrowwRow = (row: CSVRow): ParsedTrade | null => {
      // Try equity format first (Stock name column)
      let symbol = String(row['Stock name'] || row['Name'] || row['Scrip Name'] || row['Symbol'] || '').trim();
      
      // Skip header/summary rows
      if (!symbol || 
          symbol.includes('Summary') || 
          symbol.includes('Statement') || 
          symbol.includes('Realised') ||
          symbol.includes('Unrealised') ||
          symbol.includes('Charges') ||
          symbol.includes('Total') ||
          symbol.includes('Disclaimer') ||
          symbol.includes('P&L') ||
          symbol.includes('Exchange') ||
          symbol.includes('SEBI') ||
          symbol.includes('STT') ||
          symbol.includes('Stamp') ||
          symbol.includes('IPFT') ||
          symbol.includes('Brokerage') ||
          symbol.includes('GST') ||
          symbol.includes('Unique Client') ||
          symbol.includes('trades') ||
          symbol === 'Stock name' ||
          symbol === 'Scrip Name') {
        return null;
      }

      // Parse dates - Groww uses multiple formats
      const parseDateString = (dateStr: string): string => {
        if (!dateStr || dateStr.trim() === '') return '';
        
        // Format 1: DD-MM-YYYY (equity reports)
        const ddmmyyyy = dateStr.match(/(\d{2})-(\d{2})-(\d{4})/);
        if (ddmmyyyy) {
          return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
        }
        
        // Format 2: DD MMM YYYY (F&O reports)
        const ddmmmyyyy = dateStr.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
        if (ddmmmyyyy) {
          const monthMap: { [key: string]: string } = {
            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
            'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
          };
          const day = ddmmmyyyy[1].padStart(2, '0');
          const month = monthMap[ddmmmyyyy[2]];
          return `${ddmmmyyyy[3]}-${month}-${day}`;
        }
        
        return dateStr;
      };

      // Equity format - direct column names
      const quantity = parseFloat(String(row['Quantity'] || '0'));
      const buyDateStr = String(row['Buy date'] || row['Buy Date'] || '').trim();
      const sellDateStr = String(row['Sell date'] || row['Sell Date'] || '').trim();
      const buyPrice = parseFloat(String(row['Buy price'] || row['Buy Price'] || row['Avg Buy Price'] || '0'));
      const sellPrice = parseFloat(String(row['Sell price'] || row['Sell Price'] || row['Avg Sell Price'] || '0'));
      const pnl = parseFloat(String(row['Realised P&L'] || row['Realized P&L'] || row['P&L'] || '0'));

      const buyDate = parseDateString(buyDateStr);
      const sellDate = parseDateString(sellDateStr);
      
      // Use buy date if available, otherwise sell date
      const tradeDate = buyDate || sellDate;

      // Skip rows with invalid or empty dates
      if (!tradeDate || tradeDate === '' || tradeDate.length < 8) {
        return null;
      }

      if (!symbol || !quantity || (buyPrice === 0 && sellPrice === 0)) {
        return null;
      }

      return {
        symbol,
        tradeDate,
        quantity,
        buyPrice,
        sellPrice,
        pnl,
        tradeType: buyPrice > 0 && sellPrice > 0 ? 'both' : 'unknown',
        category: determineCategory(symbol),
        broker: 'groww'
      };
    };

    for (let i = 0; i < (trades as CSVRow[]).length; i++) {
      const row = (trades as CSVRow[])[i];
      try {
        // Try parsing as Zerodha format first, then Groww
        let parsedTrade = parseZerodhaRow(row);
        let detectedBroker = 'zerodha';
        
        if (!parsedTrade) {
          parsedTrade = parseGrowwRow(row);
          detectedBroker = 'groww';
        }

        if (!parsedTrade) {
          const rowPreview = Object.entries(row).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ');
          errorDetails.push({
            row: i + 2, // +2 because Excel/CSV is 1-indexed and has header row
            reason: 'Could not parse row - missing required fields',
            data: rowPreview,
            suggestion: `Ensure the file contains columns for symbol, date, quantity, and price. Expected format: ${detectedBroker === 'zerodha' ? 'Zerodha tradebook' : 'Groww P&L report'}`
          });
          errors++;
          continue;
        }

        const { symbol, tradeDate, quantity, buyPrice, sellPrice, pnl, tradeType, category, broker } = parsedTrade;

        // Use buy price for entry, or sell price if no buy price (for short trades)
        const entryPrice = buyPrice > 0 ? buyPrice : sellPrice;
        
        const tradeKey = `${symbol}_${tradeDate}_${entryPrice}_${quantity}`;
        if (existingTradeKeys.has(tradeKey)) {
          console.log('Skipping duplicate:', tradeKey);
          skipped++;
          continue;
        }

        const hasPnL = !isNaN(pnl) && pnl !== 0;
        if (hasPnL) {
          withPnL++;
        } else {
          withoutPnL++;
        }

        // Determine position type
        let positionType = 'long';
        if (tradeType === 'both') {
          positionType = buyPrice < sellPrice ? 'long' : 'short';
        } else if (tradeType.includes('sell') || tradeType.includes('short')) {
          positionType = 'short';
        }

        // Create tags array with category and broker
        const tags = [category, broker];
        if (category === 'futures') tags.push('f&o');
        if (category === 'options') tags.push('f&o');

        transformedTrades.push({
          user_id: user.id,
          symbol: symbol,
          entry_date: tradeDate,
          entry_price: entryPrice,
          exit_price: buyPrice > 0 && sellPrice > 0 ? sellPrice : null,
          position_size: Math.abs(quantity),
          position_type: positionType,
          profit_loss: hasPnL ? pnl : null,
          tags: tags,
          notes: `Imported from ${broker}\nCategory: ${category}\nBuy: ${buyPrice || 'N/A'} | Sell: ${sellPrice || 'N/A'}`,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const rowPreview = Object.entries(row).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ');
        errorDetails.push({
          row: i + 2,
          reason: `Processing error: ${errorMessage}`,
          data: rowPreview,
          suggestion: 'Check if the row has valid data types (numbers for prices/quantity, valid dates)'
        });
        console.error('Error processing row:', error, row);
        errors++;
      }
    }

    if (transformedTrades.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No new trades to import',
          report: {
            totalRows: trades.length,
            imported: 0,
            skipped,
            errors,
            withPnL: 0,
            withoutPnL: 0,
            errorDetails
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: insertedTrades, error: insertError } = await supabase
      .from('trades')
      .insert(transformedTrades)
      .select();

    if (insertError) {
      console.error('Error inserting trades:', insertError);
      throw insertError;
    }

    console.log(`Successfully imported ${transformedTrades.length} trades from uploaded file`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully imported ${transformedTrades.length} trades`,
        report: {
          totalRows: trades.length,
          imported: transformedTrades.length,
          skipped,
          errors,
          withPnL,
          withoutPnL,
          errorDetails
        },
        trades: insertedTrades
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error importing CSV:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
