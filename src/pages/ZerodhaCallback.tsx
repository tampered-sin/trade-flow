import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const ZerodhaCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const requestToken = params.get("request_token");
      const status = params.get("status");

      if (status === "error" || !requestToken) {
        console.error("Authorization failed");
        navigate("/settings?error=auth_failed");
        return;
      }

      try {
        // Get current session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          navigate("/auth");
          return;
        }

        // Call the callback edge function
        const { data, error } = await supabase.functions.invoke('zerodha-callback', {
          body: { request_token: requestToken },
        });

        if (error) throw error;

        if (data.success) {
          navigate("/settings?success=connected");
        } else {
          navigate("/settings?error=token_exchange_failed");
        }
      } catch (error) {
        console.error("Callback error:", error);
        navigate("/settings?error=callback_failed");
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Connecting to Zerodha...</p>
      </div>
    </div>
  );
};

export default ZerodhaCallback;
