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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Checking for expiring Zerodha tokens...');

    // Check for tokens expiring in the next 6 hours or already expired
    const sixHoursFromNow = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    
    const { data: expiringCredentials, error } = await supabase
      .from('zerodha_credentials')
      .select('id, user_id, token_expires_at, api_key')
      .not('access_token', 'is', null)
      .lte('token_expires_at', sixHoursFromNow);

    if (error) {
      console.error('Error fetching credentials:', error);
      throw error;
    }

    if (!expiringCredentials || expiringCredentials.length === 0) {
      console.log('No expiring tokens found');
      return new Response(
        JSON.stringify({ 
          message: 'No expiring tokens found',
          checked: new Date().toISOString() 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${expiringCredentials.length} expiring token(s)`);

    // Log each expiring token (in production, you might send emails here)
    for (const cred of expiringCredentials) {
      const expiresAt = new Date(cred.token_expires_at);
      const isExpired = expiresAt < new Date();
      
      console.log(`User ${cred.user_id}: Token ${isExpired ? 'expired' : 'expiring soon'} at ${expiresAt.toISOString()}`);
      
      // You could send email notifications here using Resend
      // or create in-app notifications in a notifications table
    }

    return new Response(
      JSON.stringify({ 
        message: `Found ${expiringCredentials.length} expiring token(s)`,
        expiringCount: expiringCredentials.length,
        checked: new Date().toISOString()
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error in check-zerodha-tokens:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
