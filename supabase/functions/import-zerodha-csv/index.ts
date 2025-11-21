import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CSVRow {
  [key: string]: string;
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

    for (const row of trades as CSVRow[]) {
      try {
        // Handle different Excel formats
        let symbol = '';
        let tradeDate = '';
        let quantity = 0;
        let buyPrice = 0;
        let sellPrice = 0;
        let pnl = 0;
        let tradeType = '';

        // Check if it's Groww P&L format (uses "Name" for symbol and dynamic user column)
        if (row['Name'] || row['Scrip Name']) {
          symbol = row['Name'] || row['Scrip Name'] || '';
          
          // Skip header/summary rows
          if (!symbol || 
              symbol.includes('Summary') || 
              symbol.includes('Statement') || 
              symbol.includes('Realised') ||
              symbol.includes('Charges') ||
              symbol.includes('Total') ||
              symbol.includes('Disclaimer') ||
              symbol.includes('Exchange') ||
              symbol.includes('SEBI') ||
              symbol.includes('STT') ||
              symbol.includes('Stamp') ||
              symbol.includes('IPFT') ||
              symbol.includes('Brokerage') ||
              symbol.includes('GST') ||
              symbol.includes('Futures') ||
              symbol.includes('Options') ||
              symbol.includes('Unique Client')) {
            console.log('Skipping header/summary row:', symbol);
            continue;
          }

          // Find the quantity column (could be user name or "Quantity")
          const userNameKey = Object.keys(row).find(key => 
            key !== 'Name' && 
            key !== 'Scrip Name' && 
            key !== '__EMPTY' && 
            !key.startsWith('__EMPTY_') &&
            !isNaN(parseFloat(row[key]))
          );
          
          quantity = parseFloat(userNameKey ? row[userNameKey] : row['Quantity'] || '0');
          tradeDate = row['__EMPTY'] || row['Buy Date'] || row['Date'] || '';
          buyPrice = parseFloat(row['__EMPTY_1'] || row['Buy Price'] || '0');
          sellPrice = parseFloat(row['__EMPTY_4'] || row['Sell Price'] || '0');
          pnl = parseFloat(row['__EMPTY_6'] || row['Realized P&L'] || row['P&L'] || '0');
          
          // Determine trade type based on having buy/sell prices
          tradeType = buyPrice > 0 && sellPrice > 0 ? 'both' : 'unknown';
        } else {
          // Standard Zerodha CSV format
          symbol = row['symbol'] || row['Symbol'] || row['SYMBOL'] || '';
          tradeDate = row['trade_date'] || row['Trade date'] || row['Date'] || '';
          quantity = parseFloat(row['quantity'] || row['Quantity'] || row['qty'] || '0');
          buyPrice = parseFloat(row['trade_price'] || row['Price'] || row['price'] || '0');
          tradeType = (row['trade_type'] || row['Type'] || row['type'] || '').toLowerCase();
          pnl = parseFloat(row['pnl'] || row['P&L'] || row['profit_loss'] || '0');
        }

        // Validate required fields
        if (!symbol || !tradeDate || !quantity || (buyPrice === 0 && sellPrice === 0)) {
          console.log('Skipping invalid row - missing required fields:', { symbol, tradeDate, quantity, buyPrice, sellPrice });
          errors++;
          continue;
        }

        // Use buy price for entry, or sell price if no buy price (for short trades)
        const entryPrice = buyPrice > 0 ? buyPrice : sellPrice;
        
        const tradeKey = `${symbol}_${tradeDate}_${entryPrice}_${quantity}`;
        if (existingTradeKeys.has(tradeKey)) {
          skipped++;
          continue;
        }

        const hasPnL = !isNaN(pnl) && pnl !== 0;
        if (hasPnL) {
          withPnL++;
        } else {
          withoutPnL++;
        }

        // Determine position type: if we have both buy and sell, it's a completed trade
        let positionType = 'long';
        if (tradeType === 'both') {
          // For completed trades with P&L, determine type from P&L and prices
          positionType = buyPrice < sellPrice ? 'long' : 'short';
        } else if (tradeType.includes('sell') || tradeType.includes('short')) {
          positionType = 'short';
        }

        transformedTrades.push({
          user_id: user.id,
          symbol: symbol.trim(),
          entry_date: tradeDate,
          entry_price: entryPrice,
          exit_price: buyPrice > 0 && sellPrice > 0 ? sellPrice : null,
          position_size: Math.abs(quantity),
          position_type: positionType,
          profit_loss: hasPnL ? pnl : null,
          notes: `Imported from Groww/Zerodha file\nBuy Price: ${buyPrice}\nSell Price: ${sellPrice}`,
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
