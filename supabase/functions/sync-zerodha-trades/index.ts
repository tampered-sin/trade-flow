import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ZerodhaTrade {
  trade_id: string;
  order_id: string;
  exchange: string;
  tradingsymbol: string;
  instrument_token: number;
  product: string;
  average_price: number;
  quantity: number;
  exchange_order_id: string;
  transaction_type: 'BUY' | 'SELL';
  fill_timestamp: string;
  order_timestamp: string;
  exchange_timestamp: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get Zerodha credentials from environment
    const apiKey = Deno.env.get('ZERODHA_API_KEY');
    const accessToken = Deno.env.get('ZERODHA_ACCESS_TOKEN');

    if (!apiKey || !accessToken) {
      throw new Error('Zerodha API credentials not configured');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log('Fetching trades from Zerodha for user:', user.id);

    // Fetch trades from Zerodha API
    const zerodhaTrades = await fetchZerodhaTrades(apiKey, accessToken);
    
    console.log(`Fetched ${zerodhaTrades.length} trades from Zerodha`);

    // Get existing trades to avoid duplicates
    const { data: existingTrades } = await supabase
      .from('trades')
      .select('notes')
      .eq('user_id', user.id)
      .like('notes', '%Zerodha Trade ID:%');

    const existingTradeIds = new Set(
      existingTrades?.map(t => {
        const match = t.notes?.match(/Zerodha Trade ID: (\w+)/);
        return match ? match[1] : null;
      }).filter(Boolean) || []
    );

    // Transform and filter new trades
    const newTrades = zerodhaTrades
      .filter(zt => !existingTradeIds.has(zt.trade_id))
      .map(zt => ({
        user_id: user.id,
        symbol: zt.tradingsymbol,
        entry_date: zt.fill_timestamp,
        entry_price: zt.average_price,
        position_size: zt.quantity,
        position_type: zt.transaction_type === 'BUY' ? 'long' : 'short',
        notes: `Imported from Zerodha\nZerodha Trade ID: ${zt.trade_id}\nOrder ID: ${zt.order_id}\nExchange: ${zt.exchange}\nProduct: ${zt.product}`,
      }));

    if (newTrades.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No new trades to sync',
          synced: 0,
          total: zerodhaTrades.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert new trades
    const { data: insertedTrades, error: insertError } = await supabase
      .from('trades')
      .insert(newTrades)
      .select();

    if (insertError) {
      console.error('Error inserting trades:', insertError);
      throw insertError;
    }

    console.log(`Successfully synced ${newTrades.length} new trades`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully synced ${newTrades.length} new trades`,
        synced: newTrades.length,
        total: zerodhaTrades.length,
        trades: insertedTrades
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error syncing Zerodha trades:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Check if it's a token expiration error
    const isTokenError = errorMessage.includes('TokenException') || errorMessage.includes('403');
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        isTokenExpired: isTokenError,
        instructions: isTokenError ? 
          'Your Zerodha access token has expired. Please generate a new token:\n\n1. Visit https://kite.zerodha.com/\n2. Login to your account\n3. Go to Apps > API apps > Your app\n4. Generate new access token\n5. Update the token in Settings' : 
          null
      }),
      { 
        status: isTokenError ? 401 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function fetchZerodhaTrades(apiKey: string, accessToken: string): Promise<ZerodhaTrade[]> {
  const url = 'https://api.kite.trade/trades';
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Kite-Version': '3',
      'Authorization': `token ${apiKey}:${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Zerodha API error:', errorText);
    throw new Error(`Failed to fetch trades from Zerodha: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  
  if (result.status !== 'success') {
    throw new Error('Zerodha API returned error status');
  }

  return result.data || [];
}
