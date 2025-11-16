import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator } from "lucide-react";
import { PositionSizeCalculator } from "@/components/PositionSizeCalculator";

const AddTrade = () => {
  const [loading, setLoading] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    symbol: "",
    entryDate: new Date().toISOString().slice(0, 16),
    exitDate: "",
    entryPrice: "",
    exitPrice: "",
    positionSize: "",
    positionType: "long",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to add trades",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    let profitLoss = null;
    if (formData.exitPrice) {
      const entry = parseFloat(formData.entryPrice);
      const exit = parseFloat(formData.exitPrice);
      const size = parseFloat(formData.positionSize);
      
      if (formData.positionType === "long") {
        profitLoss = (exit - entry) * size;
      } else {
        profitLoss = (entry - exit) * size;
      }
    }

    const { error } = await supabase.from("trades").insert({
      user_id: user.id,
      symbol: formData.symbol,
      entry_date: formData.entryDate,
      exit_date: formData.exitDate || null,
      entry_price: parseFloat(formData.entryPrice),
      exit_price: formData.exitPrice ? parseFloat(formData.exitPrice) : null,
      position_size: parseFloat(formData.positionSize),
      position_type: formData.positionType,
      profit_loss: profitLoss,
      notes: formData.notes || null,
    });

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Trade added successfully",
      });
      navigate("/trades");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight">Add Trade</h2>
        <p className="text-muted-foreground">Record a new trade entry</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trade Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol *</Label>
                <Input
                  id="symbol"
                  placeholder="AAPL, BTC/USD, etc."
                  value={formData.symbol}
                  onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="positionType">Position Type *</Label>
                <Select
                  value={formData.positionType}
                  onValueChange={(value) => setFormData({ ...formData, positionType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="long">Long</SelectItem>
                    <SelectItem value="short">Short</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="entryDate">Entry Date *</Label>
                <Input
                  id="entryDate"
                  type="datetime-local"
                  value={formData.entryDate}
                  onChange={(e) => setFormData({ ...formData, entryDate: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exitDate">Exit Date</Label>
                <Input
                  id="exitDate"
                  type="datetime-local"
                  value={formData.exitDate}
                  onChange={(e) => setFormData({ ...formData, exitDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="entryPrice">Entry Price *</Label>
                <Input
                  id="entryPrice"
                  type="number"
                  step="0.00000001"
                  placeholder="0.00"
                  value={formData.entryPrice}
                  onChange={(e) => setFormData({ ...formData, entryPrice: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exitPrice">Exit Price</Label>
                <Input
                  id="exitPrice"
                  type="number"
                  step="0.00000001"
                  placeholder="0.00"
                  value={formData.exitPrice}
                  onChange={(e) => setFormData({ ...formData, exitPrice: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="positionSize">Position Size *</Label>
                <div className="flex gap-2">
                  <Input
                    id="positionSize"
                    type="number"
                    step="0.00000001"
                    placeholder="Number of units"
                    value={formData.positionSize}
                    onChange={(e) => setFormData({ ...formData, positionSize: e.target.value })}
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowCalculator(true)}
                    title="Open Position Size Calculator"
                  >
                    <Calculator className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Add any notes about this trade..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={4}
              />
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? "Adding..." : "Add Trade"}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate("/trades")}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <PositionSizeCalculator
        open={showCalculator}
        onOpenChange={setShowCalculator}
        onApply={(positionSize) => {
          setFormData({ ...formData, positionSize: positionSize.toString() });
        }}
        initialEntryPrice={formData.entryPrice}
      />
    </div>
  );
};

export default AddTrade;
