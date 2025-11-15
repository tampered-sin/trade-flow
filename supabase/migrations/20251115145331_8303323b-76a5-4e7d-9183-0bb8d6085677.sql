-- Create trades table
CREATE TABLE public.trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  entry_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  exit_date TIMESTAMP WITH TIME ZONE,
  entry_price DECIMAL(20, 8) NOT NULL,
  exit_price DECIMAL(20, 8),
  position_size DECIMAL(20, 8) NOT NULL,
  position_type TEXT NOT NULL CHECK (position_type IN ('long', 'short')),
  profit_loss DECIMAL(20, 8),
  notes TEXT,
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own trades" 
ON public.trades 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own trades" 
ON public.trades 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trades" 
ON public.trades 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trades" 
ON public.trades 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_trades_updated_at
BEFORE UPDATE ON public.trades
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_trades_user_id ON public.trades(user_id);
CREATE INDEX idx_trades_entry_date ON public.trades(entry_date DESC);