import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { CurrencyProvider } from "@/hooks/useCurrency";
import Auth from "./pages/Auth";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import AddTrade from "./pages/AddTrade";
import Trades from "./pages/Trades";
import PLCalendar from "./pages/PLCalendar";
import Settings from "./pages/Settings";
import ZerodhaCallback from "./pages/ZerodhaCallback";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => {
  const [apiOk, setApiOk] = useState(false);
  useEffect(() => {
    const base = import.meta.env.VITE_API_URL || "http://localhost:8000";
    fetch(`${base}/health`).then((r) => setApiOk(r.ok)).catch(() => setApiOk(false));
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider>
        <TooltipProvider>
          {apiOk && (
            <div className="fixed top-2 right-2 z-50 px-2 py-1 rounded bg-green-600 text-white text-xs">API OK</div>
          )}
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/auth" element={<Auth />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/add-trade" element={<AddTrade />} />
                  <Route path="/trades" element={<Trades />} />
                  <Route path="/pl-calendar" element={<PLCalendar />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>
              </Route>
              <Route path="/auth/zerodha/callback" element={<ZerodhaCallback />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </CurrencyProvider>
    </QueryClientProvider>
  );
};

export default App;
