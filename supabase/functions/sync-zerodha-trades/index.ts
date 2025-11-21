import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ZerodhaOrder {
  order_id: string;
  exchange: string;
  tradingsymbol: string;
  instrument_token: number;
  product: string;
  average_price: number;
  quantity: number;
  filled_quantity: number;
  pending_quantity: number;
  transaction_type: 'BUY' | 'SELL';
  order_timestamp: string;
  exchange_timestamp: string;
  status: string;
  order_type: string;
  variety: string;
}

interface ZerodhaPosition {
  tradingsymbol: string;
  exchange: string;
  product: string;
  quantity: number;
  buy_quantity: number;
  sell_quantity: number;
  buy_price: number;
  sell_price: number;
  pnl: number;
  average_price: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Get user's Zerodha credentials from database
    const { data: credentials, error: credError } = await supabase
      .from('zerodha_credentials')
      .select('api_key, access_token, token_expires_at')
      .eq('user_id', user.id)
      .single();

    if (credError || !credentials) {
      console.error('No Zerodha credentials found for user:', user.id);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Zerodha not connected. Please connect your account in Settings.',
          isTokenExpired: true,
          instructions: 'Please visit Settings to connect your Zerodha account.'
        }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { api_key, access_token, token_expires_at } = credentials;

    // Check if token is expired
    if (token_expires_at && new Date(token_expires_at) < new Date()) {
      console.log('Access token expired for user:', user.id);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Zerodha access token has expired. Please reconnect your account.',
          isTokenExpired: true,
          instructions: 'Your Zerodha access token has expired. Please visit Settings and click "Connect to Zerodha" again to reconnect your account.'
        }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!api_key || !access_token) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Zerodha credentials incomplete. Please reconnect your account in Settings.',
          isTokenExpired: true
        }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Fetch completed orders from Zerodha API
    const zerodhaTrades = await fetchZerodhaOrders(api_key, access_token);
    
    console.log(`Fetched ${zerodhaTrades.length} completed orders from Zerodha`);

    // Try to fetch P&L data from positions
    let positionsMap: Map<string, number> = new Map();
    try {
      const positions = await fetchZerodhaPositions(api_key, access_token);
      positions.forEach(pos => {
        const key = `${pos.tradingsymbol}_${pos.exchange}_${pos.product}`;
        positionsMap.set(key, pos.pnl);
      });
      console.log(`Fetched P&L data for ${positionsMap.size} positions`);
    } catch (error) {
      console.log('Could not fetch P&L data:', error);
      // Continue without P&L data
    }

    // Get existing trades to avoid duplicates
    const { data: existingTrades } = await supabase
      .from('trades')
      .select('notes')
      .eq('user_id', user.id)
      .like('notes', '%Order ID:%');

    const existingTradeIds = new Set(
      existingTrades?.map(t => {
        const match = t.notes?.match(/Order ID: (\w+)/);
        return match ? match[1] : null;
      }).filter(Boolean) || []
    );

    // Transform and filter new trades
    const newTrades = zerodhaTrades
      .filter(zt => !existingTradeIds.has(zt.order_id))
      .map(zt => {
        // Try to get P&L for this order
        const posKey = `${zt.tradingsymbol}_${zt.exchange}_${zt.product}`;
        const pnl = positionsMap.get(posKey);
        
        return {
          user_id: user.id,
          symbol: zt.tradingsymbol,
          entry_date: zt.order_timestamp,
          entry_price: zt.average_price,
          position_size: zt.filled_quantity,
          position_type: zt.transaction_type === 'BUY' ? 'long' : 'short',
          profit_loss: pnl || null,
          notes: `Imported from Zerodha\nOrder ID: ${zt.order_id}\nExchange: ${zt.exchange}\nProduct: ${zt.product}\nStatus: ${zt.status}\nOrder Type: ${zt.order_type}`,
        };
      });

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

async function fetchZerodhaOrders(apiKey: string, accessToken: string): Promise<ZerodhaOrder[]> {
  const url = 'https://api.kite.trade/orders';
  
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
    throw new Error(`Failed to fetch orders from Zerodha: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  
  if (result.status !== 'success') {
    throw new Error('Zerodha API returned error status');
  }

  const allOrders = result.data || [];
  
  // Filter for only COMPLETE orders with filled quantity
  const completedOrders = allOrders.filter((order: ZerodhaOrder) => 
    order.status === 'COMPLETE' && order.filled_quantity > 0
  );

  console.log(`Filtered ${completedOrders.length} completed orders from ${allOrders.length} total orders`);
  
  return completedOrders;
}

async function fetchZerodhaPositions(apiKey: string, accessToken: string): Promise<ZerodhaPosition[]> {
  const url = 'https://api.kite.trade/portfolio/positions';
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Kite-Version': '3',
      'Authorization': `token ${apiKey}:${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Zerodha positions API error:', errorText);
    throw new Error(`Failed to fetch positions from Zerodha: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  
  if (result.status !== 'success') {
    throw new Error('Zerodha API returned error status');
  }

  // Positions API returns { net: [], day: [] }
  // We'll use 'day' positions which have realized P&L
  return result.data?.day || [];
}
