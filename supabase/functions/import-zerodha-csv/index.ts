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

    // Helper function to parse Zerodha format
    const parseZerodhaRow = (row: CSVRow): ParsedTrade | null => {
      const symbol = String(row['symbol'] || row['Symbol'] || row['SYMBOL'] || row['scrip_name'] || '').trim();
      const tradeDate = String(row['trade_date'] || row['Trade date'] || row['Date'] || row['date'] || '').trim();
      const quantity = parseFloat(String(row['quantity'] || row['Quantity'] || row['qty'] || '0'));
      const buyPrice = parseFloat(String(row['trade_price'] || row['Price'] || row['price'] || row['buy_price'] || '0'));
      const sellPrice = parseFloat(String(row['sell_price'] || row['Sell Price'] || '0'));
      const pnl = parseFloat(String(row['pnl'] || row['P&L'] || row['profit_loss'] || '0'));
      const tradeType = String(row['trade_type'] || row['Type'] || row['type'] || '').toLowerCase();

      if (!symbol || !tradeDate || !quantity || (buyPrice === 0 && sellPrice === 0)) {
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
      const symbol = String(row['Stock name'] || row['Name'] || row['Scrip Name'] || row['Symbol'] || '').trim();
      
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
          symbol.includes('Unique Client')) {
        return null;
      }

      // Groww P&L report format
      const quantity = parseFloat(String(row['Quantity'] || row['Qty'] || '0'));
      const buyDate = String(row['Buy Date'] || row['Buy date'] || row['Purchase Date'] || '').trim();
      const sellDate = String(row['Sell Date'] || row['Sell date'] || row['Sale Date'] || '').trim();
      const buyPrice = parseFloat(String(row['Buy Price'] || row['Buy price'] || row['Avg. buy price'] || '0'));
      const sellPrice = parseFloat(String(row['Sell Price'] || row['Sell price'] || row['Avg. sell price'] || '0'));
      const pnl = parseFloat(String(row['Realized P&L'] || row['Realised P&L'] || row['P&L'] || row['Profit/Loss'] || '0'));

      // Use buy date if available, otherwise sell date
      const tradeDate = buyDate || sellDate;

      if (!symbol || !tradeDate || !quantity || (buyPrice === 0 && sellPrice === 0)) {
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

    for (const row of trades as CSVRow[]) {
      try {
        // Try parsing as Zerodha format first, then Groww
        let parsedTrade = parseZerodhaRow(row);
        if (!parsedTrade) {
          parsedTrade = parseGrowwRow(row);
        }

        if (!parsedTrade) {
          console.log('Skipping invalid row - could not parse:', Object.keys(row).slice(0, 5));
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
