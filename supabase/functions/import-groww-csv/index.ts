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

    console.log(`Processing ${trades.length} rows from Groww file`);

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

    // Helper function to parse Groww date format
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

    // Parse Groww format
    const parseGrowwRow = (row: CSVRow): ParsedTrade | null => {
      // Extract symbol - Groww uses "Stock name" column
      const symbol = String(
        row['Stock name'] || 
        row['Name'] || 
        row['Scrip Name'] || 
        row['Symbol'] || 
        ''
      ).trim();
      
      // Skip header/summary rows
      if (!symbol || 
          symbol === 'Stock name' ||
          symbol === 'Scrip Name' ||
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
          /^\d+$/.test(symbol)) {
        return null;
      }

      // Parse Groww specific columns
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

      // Skip rows with invalid data
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
      };
    };

    for (let i = 0; i < (trades as CSVRow[]).length; i++) {
      const row = (trades as CSVRow[])[i];
      try {
        const parsedTrade = parseGrowwRow(row);

        if (!parsedTrade) {
          // Skip silently for header/summary rows
          continue;
        }

        const { symbol, tradeDate, quantity, buyPrice, sellPrice, pnl, tradeType, category } = parsedTrade;

        // Use buy price for entry, or sell price if no buy price
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
        }

        // Create tags array with category and broker
        const tags = [category, 'groww'];
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
          notes: `Imported from Groww\nCategory: ${category}\nBuy: ${buyPrice || 'N/A'} | Sell: ${sellPrice || 'N/A'}`,
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

    console.log(`Successfully imported ${transformedTrades.length} Groww trades`);

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
    console.error('Error importing Groww CSV:', error);
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
