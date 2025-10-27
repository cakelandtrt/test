/*
  # Fix Cart Items Custom Price for Customized Cakes

  ## Problem
  When ordering customized cakes, the cart amount does not include tier cost, design model price, and toppings price.

  ## Solution
  Ensure the cart_items table has a custom_price column to store the complete calculated price for customized cakes.

  ## Changes
  1. Add custom_price column to cart_items if it doesn't exist
  2. This column stores the total price including:
     - Flavour cost (base_price_per_kg × weight)
     - Tier cost (tier_cost)
     - Design model price
     - Toppings total price

  ## Notes
  - For regular products, custom_price will be NULL and the cart will calculate price as: price_per_litre × quantity_litres
  - For customized cakes, custom_price will contain the pre-calculated total
*/

-- Ensure cart_items table exists
CREATE TABLE IF NOT EXISTS cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_litres numeric NOT NULL DEFAULT 1,
  custom_price numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add custom_price column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cart_items' AND column_name = 'custom_price'
  ) THEN
    ALTER TABLE cart_items ADD COLUMN custom_price numeric;
  END IF;
END $$;

-- Ensure RLS is enabled
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view own cart items" ON cart_items;
  DROP POLICY IF EXISTS "Users can insert own cart items" ON cart_items;
  DROP POLICY IF EXISTS "Users can update own cart items" ON cart_items;
  DROP POLICY IF EXISTS "Users can delete own cart items" ON cart_items;
END $$;

-- Create RLS policies
CREATE POLICY "Users can view own cart items"
  ON cart_items FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cart items"
  ON cart_items FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cart items"
  ON cart_items FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own cart items"
  ON cart_items FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_cart_items_user ON cart_items(user_id);

-- Add helpful comment
COMMENT ON COLUMN cart_items.custom_price IS 'Pre-calculated total price for customized items (includes all options). NULL for regular products.';
