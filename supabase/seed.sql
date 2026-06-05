-- ============================================================================
-- ScanDine — seed: one demo restaurant so every surface has real data to show.
-- Idempotent: deletes the demo tenant first (cascades), then re-creates it.
-- Run after migrations. Table T1's qr_token = 'demo' → /order/demo works.
-- NOTE: this seeds tenant data only. Admin/staff *auth* users are created via
-- the Super Admin portal (step 3), not here.
-- ============================================================================

delete from public.restaurants where slug = 'friends-fries-cafe';

-- ---- restaurant ------------------------------------------------------------
insert into public.restaurants
  (id, name, slug, gst_number, address, google_review_url, tax_config,
   subscription_plan, pos_mode, is_active, onboarded_by, onboarded_at)
values (
  '11111111-1111-1111-1111-111111111111',
  'Friends & Fries Café',
  'friends-fries-cafe',
  '29ABCDE1234F1Z5',
  '14, MG Road, Indiranagar, Bengaluru 560038',
  'https://search.google.com/local/writereview?placeid=DEMO_PLACE_ID',
  '{"sgst": 2.5, "cgst": 2.5}'::jsonb,
  'free', 'standalone', true, 'Krishna', now()
);

-- ---- tables (T1 token is the well-known demo token) ------------------------
insert into public.tables (restaurant_id, table_number, qr_token, capacity) values
  ('11111111-1111-1111-1111-111111111111', 'T1', 'demo',      4),
  ('11111111-1111-1111-1111-111111111111', 'T2', 'demo-t2',   2),
  ('11111111-1111-1111-1111-111111111111', 'T3', 'demo-t3',   4),
  ('11111111-1111-1111-1111-111111111111', 'T4', 'demo-t4',   6),
  ('11111111-1111-1111-1111-111111111111', 'T5', 'demo-t5',   2),
  ('11111111-1111-1111-1111-111111111111', 'T6', 'demo-t6',   4);

-- ---- categories ------------------------------------------------------------
insert into public.menu_categories (id, restaurant_id, name, sort_order) values
  ('22222222-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Coffee & Chai',     1),
  ('22222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Brownies & Bakes',  2),
  ('22222222-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'All-Day Bites',     3),
  ('22222222-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Coolers',           4);

-- ---- menu items ------------------------------------------------------------
insert into public.menu_items
  (restaurant_id, category_id, name, description, price, is_veg, is_available, addons, variants, sort_order)
values
  -- Coffee & Chai
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Kullad Masala Chai', 'Slow-brewed, served in a clay cup', 40, true, true,
   '[]'::jsonb,
   '[{"name":"Regular","price_delta":0},{"name":"Large","price_delta":15}]'::jsonb, 1),
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Filter Coffee', 'South-Indian decoction, frothy and strong', 50, true, true,
   '[{"name":"Extra Shot","price":25}]'::jsonb, '[]'::jsonb, 2),
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Cappuccino', 'Single-origin, velvety microfoam', 130, true, true,
   '[{"name":"Extra Shot","price":25},{"name":"Oat Milk","price":30}]'::jsonb,
   '[{"name":"Regular","price_delta":0},{"name":"Large","price_delta":40}]'::jsonb, 3),

  -- Brownies & Bakes
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000002',
   'Nutella Brownie', 'Warm, fudgy, OREO crumble on top', 150, true, true,
   '[{"name":"Extra Oreo","price":20},{"name":"Vanilla Scoop","price":40}]'::jsonb,
   '[]'::jsonb, 1),
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000002',
   'Cinnamon Roll', 'Soft swirl, cream-cheese glaze', 120, true, true,
   '[]'::jsonb, '[]'::jsonb, 2),
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000002',
   'Choco Chip Cookie', 'Gooey centre, sea-salt finish', 60, true, false,
   '[]'::jsonb, '[]'::jsonb, 3),

  -- All-Day Bites
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000003',
   'Peri-Peri Chicken Club', 'Triple-stack, hand-cut fries on the side', 180, false, true,
   '[{"name":"Add Cheese","price":30},{"name":"Extra Patty","price":60}]'::jsonb,
   '[]'::jsonb, 1),
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000003',
   'Paneer Tikka Roll', 'Smoky paneer, mint chutney, kachumber', 140, true, true,
   '[{"name":"Add Cheese","price":30}]'::jsonb, '[]'::jsonb, 2),
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000003',
   'Loaded Cheese Fries', 'Hand-cut, molten cheddar, jalapeños', 160, true, true,
   '[]'::jsonb, '[{"name":"Regular","price_delta":0},{"name":"Sharing","price_delta":70}]'::jsonb, 3),

  -- Coolers
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000004',
   'Cold Coffee', 'Thick, blended, dark-chocolate drizzle', 120, true, true,
   '[{"name":"Extra Shot","price":25},{"name":"Ice Cream Float","price":40}]'::jsonb,
   '[]'::jsonb, 1),
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000004',
   'Fresh Lime Soda', 'Sweet, salt or mixed — your call', 70, true, true,
   '[]'::jsonb,
   '[{"name":"Sweet","price_delta":0},{"name":"Salted","price_delta":0},{"name":"Mixed","price_delta":0}]'::jsonb, 2),
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000004',
   'Virgin Mojito', 'Muddled mint, lime, soda', 110, true, true,
   '[]'::jsonb, '[]'::jsonb, 3);
