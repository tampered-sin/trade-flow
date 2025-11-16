import { useState, useEffect } from "react";
import { Calculator } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PositionSizeCalculatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (positionSize: number) => void;
  initialEntryPrice?: string;
}

export const PositionSizeCalculator = ({
  open,
  onOpenChange,
  onApply,
  initialEntryPrice = "",
}: PositionSizeCalculatorProps) => {
  const [accountBalance, setAccountBalance] = useState("");
  const [riskPercentage, setRiskPercentage] = useState("1");
  const [entryPrice, setEntryPrice] = useState(initialEntryPrice);
  const [stopLossPrice, setStopLossPrice] = useState("");

  // Load saved account balance from localStorage
  useEffect(() => {
    const savedBalance = localStorage.getItem("accountBalance");
    if (savedBalance) {
      setAccountBalance(savedBalance);
    }
  }, []);

  // Update entry price if it changes in the parent form
  useEffect(() => {
    if (initialEntryPrice) {
      setEntryPrice(initialEntryPrice);
    }
  }, [initialEntryPrice]);

  // Save account balance to localStorage
  useEffect(() => {
    if (accountBalance) {
      localStorage.setItem("accountBalance", accountBalance);
    }
  }, [accountBalance]);

  const calculateResults = () => {
    const balance = parseFloat(accountBalance);
    const risk = parseFloat(riskPercentage);
    const entry = parseFloat(entryPrice);
    const stopLoss = parseFloat(stopLossPrice);

    if (!balance || !risk || !entry || !stopLoss) {
      return {
        riskAmount: 0,
        stopLossDistance: 0,
        positionSize: 0,
        isValid: false,
      };
    }

    const riskAmount = balance * (risk / 100);
    const stopLossDistance = Math.abs(entry - stopLoss);
    const positionSize = stopLossDistance > 0 ? riskAmount / stopLossDistance : 0;

    return {
      riskAmount,
      stopLossDistance,
      positionSize,
      isValid: stopLossDistance > 0,
    };
  };

  const results = calculateResults();

  const handleReset = () => {
    setRiskPercentage("1");
    setEntryPrice(initialEntryPrice);
    setStopLossPrice("");
  };

  const handleApply = () => {
    if (results.isValid && results.positionSize > 0) {
      onApply(results.positionSize);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Position Size Calculator
          </DialogTitle>
          <DialogDescription>
            Calculate optimal position size based on your risk management parameters
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Input Parameters */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Input Parameters</h4>
            
            <div className="space-y-2">
              <Label htmlFor="accountBalance">Account Balance ($)</Label>
              <Input
                id="accountBalance"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="10000.00"
                value={accountBalance}
                onChange={(e) => setAccountBalance(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="riskPercentage">Risk Per Trade (%)</Label>
              <Input
                id="riskPercentage"
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                placeholder="1.0"
                value={riskPercentage}
                onChange={(e) => setRiskPercentage(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Typically 1-2% of account balance
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="calcEntryPrice">Entry Price ($)</Label>
              <Input
                id="calcEntryPrice"
                type="number"
                step="0.00000001"
                min="0.00000001"
                placeholder="100.00"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stopLossPrice">Stop Loss Price ($)</Label>
              <Input
                id="stopLossPrice"
                type="number"
                step="0.00000001"
                min="0.00000001"
                placeholder="95.00"
                value={stopLossPrice}
                onChange={(e) => setStopLossPrice(e.target.value)}
              />
            </div>
          </div>

          {/* Calculation Results */}
          <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
            <h4 className="text-sm font-semibold">Calculation Results</h4>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Risk Amount:</span>
                <span className="font-medium">
                  ${results.riskAmount.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Stop Loss Distance:</span>
                <span className="font-medium">
                  ${results.stopLossDistance.toFixed(8)}
                </span>
              </div>

              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">Position Size:</span>
                <span className="font-bold text-primary">
                  {results.positionSize > 0 
                    ? results.positionSize.toFixed(8) + " units"
                    : "—"}
                </span>
              </div>
            </div>

            {!results.isValid && accountBalance && entryPrice && stopLossPrice && (
              <p className="text-xs text-destructive">
                Stop loss price must be different from entry price
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              className="flex-1"
            >
              Reset
            </Button>
            <Button
              type="button"
              onClick={handleApply}
              disabled={!results.isValid || results.positionSize <= 0}
              className="flex-1"
            >
              Apply to Form
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
