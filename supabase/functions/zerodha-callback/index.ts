import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Read request token from request body (sent by ZerodhaCallback component)
    const body = await req.json();
    const requestToken = body.request_token;
    const status = body.status;

    console.log('OAuth callback received:', { requestToken, status });

    if (status === 'error' || !requestToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get authorization header to identify the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not authenticated' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('User authentication error:', userError);
      return new Response(
        JSON.stringify({ success: false, error: 'User not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    console.log('User authenticated:', user.id);

    // Get user's API key and secret from database
    const { data: credentials, error: credError } = await supabase
      .from('zerodha_credentials')
      .select('api_key, api_secret')
      .eq('user_id', user.id)
      .single();

    if (credError || !credentials) {
      console.error('Credentials fetch error:', credError);
      return new Response(
        JSON.stringify({ success: false, error: 'API credentials not found. Please set up your API key first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Exchange request token for access token
    const { api_key, api_secret } = credentials;
    
    if (!api_secret) {
      console.error('API secret is required but not found');
      return new Response(
        JSON.stringify({ success: false, error: 'API secret is required. Please add it in settings.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Generate checksum using crypto
    const encoder = new TextEncoder();
    const data = encoder.encode(`${api_key}${requestToken}${api_secret}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    console.log('Exchanging request token for access token');

    // Exchange request token for access token
    const tokenResponse = await fetch('https://api.kite.trade/session/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Kite-Version': '3',
      },
      body: new URLSearchParams({
        api_key,
        request_token: requestToken,
        checksum,
      }),
    });

    const tokenData = await tokenResponse.json();
    console.log('Token exchange response status:', tokenResponse.status);

    if (!tokenResponse.ok || tokenData.status === 'error') {
      console.error('Token exchange failed:', tokenData);
      return new Response(
        JSON.stringify({ success: false, error: tokenData.message || 'Failed to exchange token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { access_token } = tokenData.data;

    // Store access token in database
    const { error: updateError } = await supabase
      .from('zerodha_credentials')
      .update({
        access_token,
        request_token: requestToken,
        token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Database update error:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to store credentials' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log('Successfully stored access token for user:', user.id);

    // Success response
    return new Response(
      JSON.stringify({ success: true, message: 'Successfully connected to Zerodha' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('OAuth callback error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
