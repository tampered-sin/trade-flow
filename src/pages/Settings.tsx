import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

const Settings = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState<any>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message?: string; error?: string } | null>(null);

  useEffect(() => {
    fetchCredentials();
  }, []);

  const fetchCredentials = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("zerodha_credentials")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setCredentials(data);
        setApiKey(data.api_key);
        setApiSecret(data.api_secret || "");
        setIsConnected(!!data.access_token);
        
        // Check if token is expired
        if (data.token_expires_at) {
          const expiresAt = new Date(data.token_expires_at);
          setTokenExpired(expiresAt < new Date());
        }
      }
    } catch (error) {
      console.error("Error fetching credentials:", error);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      toast({
        title: "Error",
        description: "Please enter your API key",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (credentials) {
        const { error } = await supabase
          .from("zerodha_credentials")
          .update({ api_key: apiKey, api_secret: apiSecret || null })
          .eq("user_id", user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("zerodha_credentials")
          .insert({ 
            user_id: user.id, 
            api_key: apiKey,
            api_secret: apiSecret || null
          });

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "API credentials saved successfully",
      });
      fetchCredentials();
    } catch (error) {
      console.error("Error saving credentials:", error);
      toast({
        title: "Error",
        description: "Failed to save API credentials",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConnectZerodha = () => {
    if (!apiKey.trim()) {
      toast({
        title: "Error",
        description: "Please save your API key first",
        variant: "destructive",
      });
      return;
    }

    if (!apiSecret.trim()) {
      toast({
        title: "Error",
        description: "API secret is required for OAuth connection. Please save it first.",
        variant: "destructive",
      });
      return;
    }

    // Redirect to Zerodha OAuth
    const redirectUri = `${window.location.origin}/auth/zerodha/callback`;
    const zerodhaAuthUrl = `https://kite.zerodha.com/connect/login?api_key=${apiKey}&redirect_url=${encodeURIComponent(redirectUri)}`;
    window.location.href = zerodhaAuthUrl;
  };

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      toast({
        title: "Error",
        description: "Please save your API key first",
        variant: "destructive",
      });
      return;
    }

    setTestingConnection(true);
    setTestResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke('test-zerodha-connection', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      setTestResult(data);

      if (data.valid) {
        toast({
          title: "Success",
          description: data.message || "API key is valid!",
        });
      } else {
        toast({
          title: "Validation Failed",
          description: data.error || "API key validation failed",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error testing connection:", error);
      toast({
        title: "Error",
        description: "Failed to test connection",
        variant: "destructive",
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("zerodha_credentials")
        .update({ access_token: null, request_token: null, token_expires_at: null })
        .eq("user_id", user.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Disconnected from Zerodha",
      });
      setIsConnected(false);
      fetchCredentials();
    } catch (error) {
      console.error("Error disconnecting:", error);
      toast({
        title: "Error",
        description: "Failed to disconnect",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Zerodha Integration</CardTitle>
          <CardDescription>
            Connect your Zerodha account to automatically sync trades
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Token Expiry Warning */}
          {tokenExpired && isConnected && (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <XCircle className="text-destructive h-5 w-5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-destructive">Token Expired</p>
                <p className="text-sm text-muted-foreground">Your Zerodha access token has expired. Please reconnect to continue syncing trades.</p>
              </div>
            </div>
          )}

          {/* Connection Status */}
          <div className="flex items-center gap-2 p-4 rounded-lg bg-muted">
            {isConnected && !tokenExpired ? (
              <>
                <CheckCircle className="text-green-500 h-5 w-5" />
                <span className="font-medium">Connected to Zerodha</span>
              </>
            ) : (
              <>
                <XCircle className="text-muted-foreground h-5 w-5" />
                <span className="font-medium">Not connected</span>
              </>
            )}
          </div>

          {/* API Key Input */}
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Zerodha API key"
            />
            <p className="text-sm text-muted-foreground">
              Get your API key from{" "}
              <a
                href="https://developers.kite.trade/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Zerodha Kite Connect
              </a>
            </p>
          </div>

          {/* API Secret Input */}
          <div className="space-y-2">
            <Label htmlFor="apiSecret">API Secret</Label>
            <Input
              id="apiSecret"
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="Enter your Zerodha API secret"
            />
            <p className="text-sm text-muted-foreground">
              Required for OAuth connection. Keep this secure.
            </p>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`p-4 rounded-lg border ${
              testResult.valid 
                ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400' 
                : 'bg-destructive/10 border-destructive/20 text-destructive'
            }`}>
              <p className="text-sm font-medium">
                {testResult.valid ? '✓ ' : '✗ '}
                {testResult.message || testResult.error}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-4">
            <Button
              onClick={handleSaveApiKey}
              disabled={loading || testingConnection}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save API Credentials
            </Button>

            <Button
              onClick={handleTestConnection}
              disabled={loading || testingConnection || !apiKey}
              variant="secondary"
            >
              {testingConnection && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Connection
            </Button>

            {!isConnected || tokenExpired ? (
              <Button
                onClick={handleConnectZerodha}
                disabled={loading || testingConnection || !apiKey || !apiSecret}
                variant="outline"
              >
                {tokenExpired ? 'Reconnect to Zerodha' : 'Connect to Zerodha'}
              </Button>
            ) : (
              <Button
                onClick={handleDisconnect}
                disabled={loading || testingConnection}
                variant="destructive"
              >
                Disconnect
              </Button>
            )}
          </div>

          {/* Instructions */}
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h3 className="font-semibold mb-2">Setup Instructions:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Create an app on Zerodha Kite Connect developer portal</li>
              <li>Copy your API key and API secret and paste them above</li>
              <li>Set redirect URL to: <code className="text-xs bg-background px-1 py-0.5 rounded">{window.location.origin}/auth/zerodha/callback</code></li>
              <li>Save your API credentials</li>
              <li>Click "Connect to Zerodha" to authorize access</li>
              <li>You'll be redirected back after authorization</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
