import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's API key
    const { data: credentials, error: credError } = await supabase
      .from('zerodha_credentials')
      .select('api_key')
      .eq('user_id', user.id)
      .single();

    if (credError || !credentials?.api_key) {
      return new Response(
        JSON.stringify({ error: 'API key not found. Please save your API key first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Testing API key:', credentials.api_key);

    // Test the API key by checking if it's valid format and can be used
    // We'll construct the login URL and validate it's properly formed
    const apiKey = credentials.api_key;
    
    // Basic validation
    if (!apiKey || apiKey.length < 10) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'API key appears to be invalid (too short)' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try to access Zerodha's public endpoint to verify API key format
    const testUrl = `https://kite.zerodha.com/connect/login?api_key=${apiKey}`;
    const response = await fetch(testUrl, {
      method: 'HEAD',
      redirect: 'manual' // Don't follow redirects
    });

    console.log('Test response status:', response.status);

    // If we get a redirect or 200, the API key format is accepted
    if (response.status === 200 || response.status === 302 || response.status === 301) {
      return new Response(
        JSON.stringify({ 
          valid: true, 
          message: 'API key format is valid. You can proceed with OAuth connection.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Any other status means the key is likely invalid
    return new Response(
      JSON.stringify({ 
        valid: false, 
        error: 'API key was rejected by Zerodha. Please verify your API key in the Kite Connect dashboard.' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error testing connection:', error);
    return new Response(
      JSON.stringify({ 
        valid: false,
        error: error instanceof Error ? error.message : 'Failed to test connection' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
