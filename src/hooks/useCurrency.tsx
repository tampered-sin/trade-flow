import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface CurrencyContextType {
  currency: string;
  currencySymbol: string;
  formatCurrency: (amount: number) => string;
  updateCurrency: (currency: string, symbol: string) => Promise<void>;
  loading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState('USD');
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCurrency();
  }, []);

  const fetchCurrency = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_preferences')
        .select('currency, currency_symbol')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching currency:', error);
        setLoading(false);
        return;
      }

      if (data) {
        setCurrency(data.currency);
        setCurrencySymbol(data.currency_symbol);
      } else {
        // Create default preferences
        await supabase
          .from('user_preferences')
          .insert({
            user_id: user.id,
            currency: 'USD',
            currency_symbol: '$',
          });
      }
    } catch (error) {
      console.error('Error in fetchCurrency:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateCurrency = async (newCurrency: string, newSymbol: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('user_preferences')
        .update({
          currency: newCurrency,
          currency_symbol: newSymbol,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      setCurrency(newCurrency);
      setCurrencySymbol(newSymbol);
    } catch (error) {
      console.error('Error updating currency:', error);
      throw error;
    }
  };

  const formatCurrency = (amount: number) => {
    const absAmount = Math.abs(amount);
    const formattedAmount = absAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    
    return `${currencySymbol}${formattedAmount}`;
  };

  return (
    <CurrencyContext.Provider
      value={{ currency, currencySymbol, formatCurrency, updateCurrency, loading }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
