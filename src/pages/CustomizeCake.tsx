import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { ShoppingCart, ChevronRight } from 'lucide-react';

interface Flavour {
  id: string;
  name: string;
  base_price_per_kg: number;
  image_url: string | null;
}

interface Tier {
  id: string;
  tier_number: number;
  min_weight_kg: number;
  max_weight_kg: number;
  tier_cost: number;
}

interface DesignModel {
  id: string;
  model_number: string;
  model_name: string;
  image_url: string | null;
  price: number;
  tier_id: string;
}

interface Topping {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  is_available: boolean;
}

export default function CustomizeCake() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedFlavour, setSelectedFlavour] = useState<string>('');
  const [selectedTier, setSelectedTier] = useState<string>('');
  const [selectedWeight, setSelectedWeight] = useState<number>(1);
  const [selectedDesign, setSelectedDesign] = useState<string>('');
  const [selectedToppings, setSelectedToppings] = useState<string[]>([]);

  const { data: flavours } = useQuery({
    queryKey: ['flavours'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flavours')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Flavour[];
    },
  });

  const { data: tiers } = useQuery({
    queryKey: ['tiers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tiers')
        .select('*')
        .order('tier_number');
      if (error) throw error;
      return data as Tier[];
    },
  });

  const { data: designModels } = useQuery({
    queryKey: ['design-models', selectedTier],
    queryFn: async () => {
      if (!selectedTier) return [];
      const { data, error } = await supabase
        .from('design_models')
        .select('*')
        .eq('tier_id', selectedTier)
        .order('model_number');
      if (error) throw error;
      return data as DesignModel[];
    },
    enabled: !!selectedTier,
  });

  const { data: toppings } = useQuery({
    queryKey: ['toppings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('toppings')
        .select('*')
        .eq('is_available', true)
        .order('name');
      if (error) throw error;
      return data as Topping[];
    },
  });

  const selectedFlavourData = flavours?.find(f => f.id === selectedFlavour);
  const selectedTierData = tiers?.find(t => t.id === selectedTier);
  const selectedDesignData = designModels?.find(d => d.id === selectedDesign);

  const calculateTotalPrice = () => {
    if (!selectedFlavourData || !selectedTierData || !selectedDesignData) return 0;

    const flavourCost = selectedFlavourData.base_price_per_kg * selectedWeight;
    const tierCost = selectedTierData.tier_cost || 0;
    const modelCost = selectedDesignData.price;
    const toppingsCost = toppings
      ?.filter(t => selectedToppings.includes(t.id))
      .reduce((sum, t) => sum + t.price, 0) || 0;

    return flavourCost + tierCost + modelCost + toppingsCost;
  };

  const totalPrice = calculateTotalPrice();

  useEffect(() => {
    if (selectedTier && selectedTierData) {
      if (selectedWeight < selectedTierData.min_weight_kg) {
        setSelectedWeight(selectedTierData.min_weight_kg);
      } else if (selectedWeight > selectedTierData.max_weight_kg) {
        setSelectedWeight(selectedTierData.max_weight_kg);
      }
    }
  }, [selectedTier, selectedTierData]);

  useEffect(() => {
    setSelectedDesign('');
  }, [selectedTier]);

  const generateCustomDescription = () => {
    if (!selectedFlavourData || !selectedTierData || !selectedDesignData) return '';

    const toppingsList = toppings
      ?.filter(t => selectedToppings.includes(t.id))
      .map(t => `${t.name} (+₹${t.price})`)
      .join(', ');

    const lines = [
      '⚠️ This description is system-generated. Do not delete or manually modify.',
      '',
      `🎂 Flavour: ${selectedFlavourData.name} (₹${selectedFlavourData.base_price_per_kg}/kg)`,
      `📏 Tier: ${selectedTierData.tier_number} (${selectedTierData.min_weight_kg}-${selectedTierData.max_weight_kg} kg)${selectedTierData.tier_cost > 0 ? ` - Chef Charge: ₹${selectedTierData.tier_cost}` : ''}`,
      `⚖️ Weight: ${selectedWeight} kg`,
      `🎨 Design Model: ${selectedDesignData.model_name} (${selectedDesignData.model_number}) - ₹${selectedDesignData.price}`,
    ];

    if (toppingsList) {
      lines.push(`🍓 Toppings: ${toppingsList}`);
    }

    lines.push('', `💰 Final Price: ₹${totalPrice.toFixed(2)}`);

    return lines.join('\n');
  };

  const addToCartMutation = useMutation({
    mutationFn: async () => {
      if (!user) {
        throw new Error('Please login to add items to cart');
      }

      if (!selectedFlavour || !selectedTier || !selectedDesign) {
        throw new Error('Please complete all required selections');
      }

      const customDescription = generateCustomDescription();
      const toppingNames = toppings
        ?.filter(t => selectedToppings.includes(t.id))
        .map(t => t.name)
        .join(', ');

      const productName = `Customized Cake - ${selectedFlavourData?.name} (${selectedDesignData?.model_name})${toppingNames ? ` with ${toppingNames}` : ''}`;

      const { data: existingProduct, error: searchError } = await supabase
        .from('products')
        .select('id')
        .eq('name', 'Customized Cake')
        .maybeSingle();

      let productId = existingProduct?.id;

      if (!productId) {
        const { data: newProduct, error: createError } = await supabase
          .from('products')
          .insert({
            name: 'Customized Cake',
            description: customDescription,
            price_per_litre: selectedFlavourData?.base_price_per_kg || 0,
            stock_quantity: 9999,
            is_active: true,
          })
          .select()
          .single();

        if (createError) throw createError;
        productId = newProduct.id;
      } else {
        const { error: updateError } = await supabase
          .from('products')
          .update({
            description: customDescription,
          })
          .eq('id', productId);

        if (updateError) throw updateError;
      }

      const { data: existingCartItem } = await supabase
        .from('cart_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('product_id', productId)
        .maybeSingle();

      if (existingCartItem) {
        const newQuantity = existingCartItem.quantity_litres + selectedWeight;
        const newCustomPrice = (existingCartItem.custom_price || 0) + totalPrice;

        const { error: updateError } = await supabase
          .from('cart_items')
          .update({
            quantity_litres: newQuantity,
            custom_price: newCustomPrice,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingCartItem.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('cart_items')
          .insert({
            user_id: user.id,
            product_id: productId,
            quantity_litres: selectedWeight,
            custom_price: totalPrice,
          });

        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      toast.success('Customized cake added to cart!');
      navigate('/cart');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add to cart');
    },
  });

  const handleToggleTopping = (toppingId: string) => {
    setSelectedToppings(prev =>
      prev.includes(toppingId)
        ? prev.filter(id => id !== toppingId)
        : [...prev, toppingId]
    );
  };

  const isFormValid = selectedFlavour && selectedTier && selectedWeight && selectedDesign;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Customize Your Cake</h1>
            <p className="text-muted-foreground">
              Create your perfect cake by choosing flavour, size, design, and toppings
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">1</span>
                    Select Flavour
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Label>Choose your cake flavour <span className="text-destructive">*</span></Label>
                  <Select value={selectedFlavour} onValueChange={setSelectedFlavour}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select a flavour" />
                    </SelectTrigger>
                    <SelectContent>
                      {flavours?.map((flavour) => (
                        <SelectItem key={flavour.id} value={flavour.id}>
                          {flavour.name} - �{flavour.base_price_per_kg}/kg
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedFlavourData?.image_url && (
                    <img
                      src={selectedFlavourData.image_url}
                      alt={selectedFlavourData.name}
                      className="mt-4 w-full h-48 object-cover rounded-lg"
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">2</span>
                    Select Tier & Weight
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Choose tier <span className="text-destructive">*</span></Label>
                    <Select value={selectedTier} onValueChange={setSelectedTier}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Select a tier" />
                      </SelectTrigger>
                      <SelectContent>
                        {tiers?.map((tier) => (
                          <SelectItem key={tier.id} value={tier.id}>
                            Tier {tier.tier_number} ({tier.min_weight_kg} - {tier.max_weight_kg} kg)
                            {tier.tier_cost > 0 && ` - �${tier.tier_cost} chef charge`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedTierData && (
                    <div>
                      <Label>Weight (kg) <span className="text-destructive">*</span></Label>
                      <Input
                        type="number"
                        step="0.1"
                        min={selectedTierData.min_weight_kg}
                        max={selectedTierData.max_weight_kg}
                        value={selectedWeight}
                        onChange={(e) => setSelectedWeight(parseFloat(e.target.value) || selectedTierData.min_weight_kg)}
                        className="mt-2"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Min: {selectedTierData.min_weight_kg} kg, Max: {selectedTierData.max_weight_kg} kg
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">3</span>
                    Select Design Model
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!selectedTier ? (
                    <p className="text-muted-foreground text-sm">Please select a tier first</p>
                  ) : designModels && designModels.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {designModels.map((model) => (
                        <div
                          key={model.id}
                          onClick={() => setSelectedDesign(model.id)}
                          className={`cursor-pointer border-2 rounded-lg p-3 transition-all ${
                            selectedDesign === model.id
                              ? 'border-primary ring-2 ring-primary'
                              : 'border-muted hover:border-primary/50'
                          }`}
                        >
                          {model.image_url && (
                            <img
                              src={model.image_url}
                              alt={model.model_name}
                              className="w-full h-32 object-cover rounded mb-2"
                            />
                          )}
                          <p className="text-xs text-muted-foreground">{model.model_number}</p>
                          <p className="font-semibold text-sm">{model.model_name}</p>
                          <p className="text-sm text-primary">�{model.price}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">No designs available for this tier</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">4</span>
                    Add Toppings (Optional)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {toppings && toppings.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {toppings.map((topping) => (
                        <div
                          key={topping.id}
                          className={`border-2 rounded-lg p-3 transition-all ${
                            selectedToppings.includes(topping.id)
                              ? 'border-primary bg-primary/5'
                              : 'border-muted'
                          }`}
                        >
                          {topping.image_url && (
                            <img
                              src={topping.image_url}
                              alt={topping.name}
                              className="w-full h-24 object-cover rounded mb-2"
                            />
                          )}
                          <div className="flex items-start gap-2">
                            <Checkbox
                              id={`topping-${topping.id}`}
                              checked={selectedToppings.includes(topping.id)}
                              onCheckedChange={() => handleToggleTopping(topping.id)}
                            />
                            <div className="flex-1">
                              <label
                                htmlFor={`topping-${topping.id}`}
                                className="text-sm font-medium cursor-pointer"
                              >
                                {topping.name}
                              </label>
                              <p className="text-xs text-primary">+�{topping.price}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">No toppings available</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <Card className="sticky top-4">
                <CardHeader>
                  <CardTitle>Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedFlavourData && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Flavour ({selectedWeight}kg)</span>
                      <span>�{(selectedFlavourData.base_price_per_kg * selectedWeight).toFixed(2)}</span>
                    </div>
                  )}
                  {selectedTierData && selectedTierData.tier_cost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tier {selectedTierData.tier_number} Chef Charge</span>
                      <span>�{selectedTierData.tier_cost.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedDesignData && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Design ({selectedDesignData.model_name})</span>
                      <span>�{selectedDesignData.price.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedToppings.length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Toppings:</p>
                      {toppings
                        ?.filter(t => selectedToppings.includes(t.id))
                        .map(t => (
                          <div key={t.id} className="flex justify-between text-sm ml-4 mb-1">
                            <span className="text-muted-foreground">{t.name}</span>
                            <span>�{t.price.toFixed(2)}</span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                  <div className="border-t pt-4">
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span className="text-primary">�{totalPrice.toFixed(2)}</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => addToCartMutation.mutate()}
                    disabled={!isFormValid || addToCartMutation.isPending}
                    className="w-full"
                    size="lg"
                  >
                    <ShoppingCart className="mr-2 h-5 w-5" />
                    {addToCartMutation.isPending ? 'Adding...' : 'Add to Cart'}
                  </Button>
                  {!isFormValid && (
                    <p className="text-xs text-muted-foreground text-center">
                      Please complete all required selections
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
