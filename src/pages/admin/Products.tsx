import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ChevronRight, Upload, ArrowLeft, Pencil, Trash2 } from 'lucide-react';

export default function AdminProducts() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price_per_litre: '',
    offer_price_per_litre: '',
    stock_quantity: '',
    image_url: '',
    category_id: '',
    is_active: true,
    featured_in_offers: false,
  });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: products } = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          product_categories (
            id,
            name
          )
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_categories')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      // File validation
      const maxSize = 5 * 1024 * 1024; // 5MB
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
      
      if (file.size > maxSize) {
        throw new Error('File size must be less than 5MB');
      }
      
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Only JPEG, PNG, WebP, and GIF images are allowed');
      }

      // Check if user is authenticated and has admin privileges
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('You must be logged in to upload images');
      }

      // Check admin role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();

      if (!roleData) {
        throw new Error('Admin privileges required to upload images');
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `products/${fileName}`;

      console.log('Uploading file:', { fileName, filePath, fileSize: file.size, fileType: file.type });

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        
        if (uploadError.message.includes('bucket not found')) {
          throw new Error('Storage bucket not found. Please contact administrator to set up the product-images bucket.');
        } else if (uploadError.message.includes('permission denied')) {
          throw new Error('Permission denied. Please ensure you have admin privileges.');
        } else if (uploadError.message.includes('file size')) {
          throw new Error('File too large. Please choose a smaller image.');
        } else {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }
      }

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      console.log('Upload successful, public URL:', publicUrl);

      setFormData(prev => ({ ...prev, image_url: publicUrl }));
      toast.success('Image uploaded successfully');
    } catch (error: any) {
      console.error('Upload error details:', error);
      const errorMessage = error.message || 'Failed to upload image';
      toast.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const createProductMutation = useMutation({
    mutationFn: async () => {
      if (!formData.name || !formData.price_per_litre || !formData.stock_quantity) {
        throw new Error('Please fill in all required fields');
      }

      if (editingProduct) {
        const { error } = await supabase.from('products').update({
          name: formData.name,
          description: formData.description || null,
          image_url: formData.image_url || null,
          price_per_litre: parseFloat(formData.price_per_litre),
          offer_price_per_litre: formData.offer_price_per_litre ? parseFloat(formData.offer_price_per_litre) : null,
          stock_quantity: parseInt(formData.stock_quantity),
          category_id: formData.category_id || null,
          is_active: formData.is_active,
          featured_in_offers: formData.featured_in_offers,
        }).eq('id', editingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('products').insert({
          name: formData.name,
          description: formData.description || null,
          image_url: formData.image_url || null,
          price_per_litre: parseFloat(formData.price_per_litre),
          offer_price_per_litre: formData.offer_price_per_litre ? parseFloat(formData.offer_price_per_litre) : null,
          stock_quantity: parseInt(formData.stock_quantity),
          category_id: formData.category_id || null,
          is_active: formData.is_active,
          featured_in_offers: formData.featured_in_offers,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingProduct ? 'Product updated successfully' : 'Product created successfully');
      setShowAddForm(false);
      setEditingProduct(null);
      setFormData({ 
        name: '',
        description: '',
        price_per_litre: '',
        offer_price_per_litre: '',
        stock_quantity: '',
        image_url: '',
        category_id: '',
        is_active: true,
        featured_in_offers: false,
      });
      setImageFile(null);
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save product');
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Product deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete product');
    },
  });

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      price_per_litre: product.price_per_litre.toString(),
      offer_price_per_litre: product.offer_price_per_litre?.toString() || '',
      stock_quantity: product.stock_quantity.toString(),
      image_url: product.image_url || '',
      category_id: product.category_id || '',
      is_active: product.is_active,
      featured_in_offers: product.featured_in_offers || false,
    });
    setShowAddForm(true);
  };


  if (!isAdmin) {
    navigate('/');
    return null;
  }

  if (!isAdmin) {
    navigate('/');
    return null;
  }

  if (showAddForm) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Back Button */}
          <Button 
            variant="ghost" 
            onClick={() => {
              setShowAddForm(false);
              setEditingProduct(null);
              setFormData({
                name: '',
                description: '',
                price_per_litre: '',
                offer_price_per_litre: '',
                stock_quantity: '',
                image_url: '',
                category_id: '',
                is_active: true,
                featured_in_offers: false,
              });
            }}
            className="mb-6"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Products
          </Button>

          <h1 className="text-3xl font-bold mb-8">{editingProduct ? 'Edit Product' : 'Add New Product'}</h1>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            {/* Left Column - Product Details */}
            <Card>
              <CardHeader>
                <CardTitle>Product Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Product Name <span className="text-destructive">*</span></Label>
                  <Input 
                    value={formData.name} 
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                    placeholder="Enter product name" 
                    required
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea 
                    value={formData.description} 
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                    placeholder="Detailed product description" 
                    rows={4} 
                  />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select 
                    value={formData.category_id} 
                    onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Right Column - Pricing & Inventory */}
            <Card>
              <CardHeader>
                <CardTitle>Pricing & Inventory</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Price per KG (₹) <span className="text-destructive">*</span></Label>
                  <Input 
                    type="number" 
                    step="0.01"
                    value={formData.price_per_litre} 
                    onChange={(e) => setFormData({ ...formData, price_per_litre: e.target.value })} 
                    placeholder="130.00" 
                    required
                  />
                </div>
                <div>
                  <Label>Offer Price per KG (₹)</Label>
                  <Input 
                    type="number" 
                    step="0.01"
                    value={formData.offer_price_per_litre} 
                    onChange={(e) => setFormData({ ...formData, offer_price_per_litre: e.target.value })} 
                    placeholder="Optional discount price" 
                  />
                </div>
                <div>
                  <Label>Stock Quantity (KG) <span className="text-destructive">*</span></Label>
                  <Input 
                    type="number" 
                    value={formData.stock_quantity} 
                    onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })} 
                    placeholder="150" 
                    required
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Product Media & Visibility */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Product Media & Visibility</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Product Image</Label>
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                      isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) {
                        setImageFile(file);
                        handleImageUpload(file);
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? (
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-2"></div>
                        <p className="text-sm text-primary">Uploading...</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mb-2">Upload Product Image</p>
                        <p className="text-xs text-muted-foreground mb-2">Max 5MB • JPEG, PNG, WebP, GIF</p>
                      </>
                    )}
                    <Input 
                      type="file" 
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setImageFile(file);
                          handleImageUpload(file);
                        }
                      }}
                      className="mt-2"
                      disabled={uploading}
                      ref={fileInputRef}
                    />
                    {imageFile && !uploading && (
                      <div className="mt-2 p-2 bg-muted rounded text-xs">
                        <p className="font-medium">Selected: {imageFile.name}</p>
                        <p className="text-muted-foreground">
                          {(imageFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    )}
                    {formData.image_url && (
                      <div className="mt-4">
                        <p className="text-sm text-green-600 mb-2">✓ Image uploaded successfully</p>
                        <img src={formData.image_url} alt="Preview" className="w-full h-32 object-cover rounded border" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Visible on Website</Label>
                    <Switch 
                      checked={formData.is_active} 
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} 
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Featured in Offers Section</Label>
                    <Switch 
                      checked={formData.featured_in_offers} 
                      onCheckedChange={(checked) => setFormData({ ...formData, featured_in_offers: checked })} 
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>


          {/* Action Buttons */}
          <div className="flex justify-center gap-4">
            <Button 
              onClick={() => createProductMutation.mutate()} 
              size="lg" 
              disabled={createProductMutation.isPending || uploading}
              className="bg-green-600 hover:bg-green-700"
            >
              {createProductMutation.isPending ? 'Saving...' : (editingProduct ? 'Update Product' : 'Save Product')}
            </Button>
            <Button 
              variant="destructive" 
              size="lg" 
              onClick={() => setShowAddForm(false)}
              disabled={createProductMutation.isPending || uploading}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => navigate('/admin')} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Manage Products</h1>
          <Button onClick={() => setShowAddForm(true)}>Add Product</Button>
        </div>

        <div className="grid gap-4">
          {products?.map((product) => (
            <Card key={product.id}>
              <CardContent className="p-4 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  {product.image_url && (
                    <img src={product.image_url} alt={product.name} className="w-16 h-16 object-cover rounded" />
                  )}
                  <div>
                    <h3 className="font-semibold">{product.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      ₹{product.price_per_litre}/KG | Stock: {product.stock_quantity}KG
                    </p>
                    {product.product_categories && (
                      <p className="text-xs text-muted-foreground">
                        Category: {product.product_categories.name}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => handleEdit(product)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this product?')) {
                        deleteProductMutation.mutate(product.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
