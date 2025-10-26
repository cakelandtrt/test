import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Star, ShoppingCart, Heart, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import ProductCard from '@/components/ProductCard';

export default function ProductDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(1);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const { data: product } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          product_categories (
            id,
            name,
            slug
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: reviews } = useQuery({
    queryKey: ['reviews', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('product_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const { data: relatedProducts } = useQuery({
    queryKey: ['related-products', product?.category_id],
    queryFn: async () => {
      if (!product?.category_id) return [];
      
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('category_id', product.category_id)
        .eq('is_active', true)
        .neq('id', id)
        .limit(4)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!product?.category_id,
  });

  const addToCartMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Please login');

      const { error } = await supabase
        .from('cart_items')
        .upsert({
          user_id: user.id,
          product_id: id!,
          quantity_litres: quantity,
        }, {
          onConflict: 'user_id,product_id',
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Added to cart');
      queryClient.invalidateQueries({ queryKey: ['cart-count'] });
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const addReviewMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Please login');

      const { error } = await supabase
        .from('reviews')
        .insert({
          product_id: id!,
          user_id: user.id,
          rating,
          comment: comment.trim(),
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Review added');
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['reviews', id] });
    },
    onError: (error: any) => {
      if (error.code === '23505') {
        toast.error('You have already reviewed this product');
      } else {
        toast.error(error.message);
      }
    },
  });

  if (!product) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container mx-auto px-4 py-8">Loading...</div>
      </div>
    );
  }

  const effectivePrice = product.offer_price_per_litre || product.price_per_litre;
  const hasDiscount = product.offer_price_per_litre && product.offer_price_per_litre < product.price_per_litre;
  const discountPercentage = hasDiscount
    ? Math.round(((product.price_per_litre - product.offer_price_per_litre!) / product.price_per_litre) * 100)
    : 0;

  const averageRating = reviews?.length
    ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Product Image */}
          <div className="aspect-square rounded-xl overflow-hidden bg-muted">
            <img
              src={product.image_url || '/placeholder.svg'}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            <div>
              <h1 className="text-4xl font-bold mb-2">{product.name}</h1>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-5 w-5 ${
                        i < Math.round(averageRating)
                          ? 'fill-primary text-primary'
                          : 'text-muted'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">
                  ({reviews?.length || 0} reviews)
                </span>
              </div>

              {hasDiscount && (
                <Badge className="mb-4 bg-destructive">
                  {discountPercentage}% OFF
                </Badge>
              )}

              <div className="flex items-baseline gap-3 mb-4">
                <span className="text-4xl font-bold text-primary">
                  ₹{effectivePrice.toFixed(2)}
                </span>
                <span className="text-lg text-muted-foreground">/KG</span>
              </div>

              {hasDiscount && (
                <span className="text-xl text-muted-foreground line-through">
                  ₹{product.price_per_litre.toFixed(2)}
                </span>
              )}

              <p className="text-muted-foreground mt-4">{product.description}</p>

              <p className="text-sm mt-2">
                <span className="font-semibold">Stock:</span>{' '}
                {product.stock_quantity > 0
                  ? `${product.stock_quantity} KG available`
                  : 'Out of stock'}
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="font-semibold">Quantity (KG):</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 text-center"
                    min="1"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity(quantity + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-4">
                <Button
                  className="flex-1"
                  size="lg"
                  onClick={() => addToCartMutation.mutate()}
                  disabled={product.stock_quantity === 0 || addToCartMutation.isPending}
                >
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  Add to Cart
                </Button>
                <Button variant="outline" size="lg">
                  <Heart className="h-5 w-5" />
                </Button>
              </div>

              <div className="text-2xl font-bold mt-4">
                Total: ₹{(effectivePrice * quantity).toFixed(2)}
              </div>

              {/* Related Products Section */}
              {relatedProducts && relatedProducts.length > 0 && (
                <div className="space-y-4 mt-[3cm]">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-[10px]">
                    {relatedProducts.map((relatedProduct) => (
                      <ProductCard 
                        key={relatedProduct.id} 
                        product={relatedProduct}
                        compact={true}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Customer Reviews</h2>

          {user && (
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">Write a Review</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Rating</label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setRating(star)}
                          type="button"
                        >
                          <Star
                            className={`h-6 w-6 cursor-pointer ${
                              star <= rating ? 'fill-primary text-primary' : 'text-muted'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Comment</label>
                    <Textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Share your experience..."
                      rows={4}
                    />
                  </div>
                  <Button
                    onClick={() => addReviewMutation.mutate()}
                    disabled={addReviewMutation.isPending}
                  >
                    Submit Review
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {reviews?.map((review) => (
              <Card key={review.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-2">
                  <div>
                      <p className="font-semibold">Customer</p>
                      <div className="flex gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${
                              i < review.rating ? 'fill-primary text-primary' : 'text-muted'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(review.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {review.comment && <p className="text-muted-foreground">{review.comment}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
