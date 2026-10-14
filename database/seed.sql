-- Two brands with policies that are clearly different
insert into brands (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Glow Naturals'),
  ('22222222-2222-2222-2222-222222222222', 'Urban Brew');

-- Glow Naturals: a skincare brand with a longer, friendlier policy
insert into kb_entries (brand_id, title, content) values
  ('11111111-1111-1111-1111-111111111111', 'Return policy',
   'Unopened products can be returned within 30 days of delivery. Opened products cannot be returned unless they arrived damaged.'),
  ('11111111-1111-1111-1111-111111111111', 'Refund policy',
   'Refunds are issued to the original payment method within 5-7 business days. For damaged items, report within 14 days of delivery with a photo and we will send a free replacement or a full refund.'),
  ('11111111-1111-1111-1111-111111111111', 'Shipping policy',
   'Orders ship within 2 business days. Standard delivery takes 4-6 days. Free shipping on orders above Rs 999.'),
  ('11111111-1111-1111-1111-111111111111', 'Cancellation policy',
   'Orders can be cancelled any time before they are shipped. Once shipped, they cannot be cancelled.');

-- Urban Brew: a drinks brand with a stricter policy
insert into kb_entries (brand_id, title, content) values
  ('22222222-2222-2222-2222-222222222222', 'Return policy',
   'Because our bottles are consumable, we do not accept returns. Damaged or leaking items are the only exception.'),
  ('22222222-2222-2222-2222-222222222222', 'Refund policy',
   'Refunds are only permitted within 7 days of delivery. Damaged items must be reported within 48 hours of delivery with a photo.'),
  ('22222222-2222-2222-2222-222222222222', 'Shipping policy',
   'Orders ship within 24 hours. Delivery takes 2-3 days. Shipping is a flat Rs 99.'),
  ('22222222-2222-2222-2222-222222222222', 'Cancellation policy',
   'Orders can only be cancelled within 2 hours of being placed.');

-- One customer per brand
insert into customers (id, brand_id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Priya Sharma'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Rahul Mehta');

-- Orders (Priya's bottle was delivered 3 days ago, matching the assignment scenario)
insert into orders (id, brand_id, customer_id, product, status, delivered_on, total) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cold Brew Glass Bottle (6 pack)', 'delivered', current_date - 3, 1299.00),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vitamin C Serum', 'delivered', current_date - 20, 899.00);

-- Starting conversations, with the opening customer message
insert into conversations (id, brand_id, customer_id, order_id) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '22222222-2222-2222-2222-222222222222',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'dddddddd-dddd-dddd-dddd-dddddddddddd');

insert into messages (brand_id, conversation_id, sender, body) values
  ('22222222-2222-2222-2222-222222222222', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'customer',
   'My order was delivered but the bottle is broken. What can I do?'),
  ('11111111-1111-1111-1111-111111111111', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'customer',
   'I received this 20 days ago. Can I get a refund?');