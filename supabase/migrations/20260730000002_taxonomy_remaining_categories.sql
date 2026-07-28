-- Completes the taxonomy_nodes tree (20260728000001_product_taxonomy_hierarchy.sql)
-- with the 5 remaining Main Categories: Shoes, Bags, Accessories, Jewelry,
-- and Kids & Baby. Same idempotent pattern as the Clothing seed — safe to
-- re-run, nothing here touches the existing Clothing rows.

-- ============================================================================
-- LEVEL 1 — Main Categories
-- ============================================================================
insert into taxonomy_nodes (parent_id, level, name, slug, sort_order)
values
  (null, 1, 'Shoes', 'shoes', 2),
  (null, 1, 'Bags', 'bags', 3),
  (null, 1, 'Accessories', 'accessories', 4),
  (null, 1, 'Jewelry', 'jewelry', 5),
  (null, 1, 'Kids & Baby', 'kids-baby', 6)
on conflict (slug) where parent_id is null do nothing;

-- ============================================================================
-- LEVEL 2 — Product Groups
-- ============================================================================
insert into taxonomy_nodes (parent_id, level, name, slug, sort_order)
select c.id, 2, v.name, v.slug, v.sort_order
from taxonomy_nodes c
join (values
  -- Shoes
  ('shoes', 'Sneakers', 'sneakers', 1),
  ('shoes', 'Formal Shoes', 'formal-shoes', 2),
  ('shoes', 'Boots', 'boots', 3),
  ('shoes', 'Sandals', 'sandals', 4),
  ('shoes', 'Heels', 'heels', 5),
  ('shoes', 'Flats', 'flats', 6),
  ('shoes', 'Slippers', 'slippers', 7),
  -- Bags
  ('bags', 'Handbags', 'handbags', 1),
  ('bags', 'Small Bags', 'small-bags', 2),
  ('bags', 'Backpacks', 'backpacks', 3),
  ('bags', 'Travel Bags', 'travel-bags', 4),
  ('bags', 'Work Bags', 'work-bags', 5),
  ('bags', 'Belt & Utility Bags', 'belt-utility-bags', 6),
  -- Accessories
  ('accessories', 'Belts', 'belts', 1),
  ('accessories', 'Headwear', 'headwear', 2),
  ('accessories', 'Scarves & Wraps', 'scarves-wraps', 3),
  ('accessories', 'Eyewear', 'eyewear', 4),
  ('accessories', 'Gloves', 'gloves', 5),
  ('accessories', 'Ties & Formal Accessories', 'ties-formal-accessories', 6),
  ('accessories', 'Hair Accessories', 'hair-accessories', 7),
  ('accessories', 'Wallets & Card Holders', 'wallets-card-holders', 8),
  ('accessories', 'Other Accessories', 'other-accessories', 9),
  -- Jewelry
  ('jewelry', 'Necklaces', 'necklaces', 1),
  ('jewelry', 'Earrings', 'earrings', 2),
  ('jewelry', 'Rings', 'rings', 3),
  ('jewelry', 'Bracelets', 'bracelets', 4),
  ('jewelry', 'Anklets', 'anklets', 5),
  ('jewelry', 'Brooches', 'brooches', 6),
  ('jewelry', 'Body Jewelry', 'body-jewelry', 7),
  ('jewelry', 'Jewelry Sets', 'jewelry-sets', 8),
  -- Kids & Baby
  ('kids-baby', 'Baby Clothing', 'baby-clothing', 1),
  ('kids-baby', 'Schoolwear', 'schoolwear', 2),
  ('kids-baby', 'Kids Accessories', 'kids-accessories', 3),
  ('kids-baby', 'Kids Shoes', 'kids-shoes', 4)
) as v(main_slug, name, slug, sort_order) on true
where c.slug = v.main_slug and c.level = 1
on conflict (parent_id, slug) where parent_id is not null do nothing;

-- ============================================================================
-- LEVEL 3 — Product Types
-- ============================================================================
insert into taxonomy_nodes (parent_id, level, name, slug, sort_order)
select g.id, 3, v.name, v.slug, v.sort_order
from taxonomy_nodes g
join (values
  -- Sneakers
  ('sneakers', 'Lifestyle Sneakers', 'lifestyle-sneakers', 1),
  ('sneakers', 'Running Shoes', 'running-shoes', 2),
  ('sneakers', 'Training Shoes', 'training-shoes', 3),
  ('sneakers', 'Basketball Shoes', 'basketball-shoes', 4),
  ('sneakers', 'High-Top Sneakers', 'high-top-sneakers', 5),
  -- Formal Shoes
  ('formal-shoes', 'Oxford Shoes', 'oxford-shoes', 1),
  ('formal-shoes', 'Derby Shoes', 'derby-shoes', 2),
  ('formal-shoes', 'Loafers', 'loafers', 3),
  ('formal-shoes', 'Monk Strap Shoes', 'monk-strap-shoes', 4),
  ('formal-shoes', 'Dress Shoes', 'dress-shoes', 5),
  -- Boots
  ('boots', 'Ankle Boots', 'ankle-boots', 1),
  ('boots', 'Chelsea Boots', 'chelsea-boots', 2),
  ('boots', 'Combat Boots', 'combat-boots', 3),
  ('boots', 'Knee-High Boots', 'knee-high-boots', 4),
  ('boots', 'Hiking Boots', 'hiking-boots', 5),
  -- Sandals
  ('sandals', 'Flat Sandals', 'flat-sandals', 1),
  ('sandals', 'Heeled Sandals', 'heeled-sandals', 2),
  ('sandals', 'Slides', 'slides', 3),
  ('sandals', 'Flip-Flops', 'flip-flops', 4),
  ('sandals', 'Sport Sandals', 'sport-sandals', 5),
  -- Heels
  ('heels', 'Pumps', 'pumps', 1),
  ('heels', 'Stiletto Heels', 'stiletto-heels', 2),
  ('heels', 'Block Heels', 'block-heels', 3),
  ('heels', 'Kitten Heels', 'kitten-heels', 4),
  ('heels', 'Wedges', 'wedges', 5),
  -- Flats
  ('flats', 'Ballet Flats', 'ballet-flats', 1),
  ('flats', 'Mules', 'mules', 2),
  ('flats', 'Espadrilles', 'espadrilles', 3),
  ('flats', 'Slip-Ons', 'slip-ons', 4),
  -- Slippers
  ('slippers', 'House Slippers', 'house-slippers', 1),
  ('slippers', 'Indoor Shoes', 'indoor-shoes', 2),
  -- Handbags
  ('handbags', 'Tote Bags', 'tote-bags', 1),
  ('handbags', 'Shoulder Bags', 'shoulder-bags', 2),
  ('handbags', 'Crossbody Bags', 'crossbody-bags', 3),
  ('handbags', 'Satchel Bags', 'satchel-bags', 4),
  ('handbags', 'Hobo Bags', 'hobo-bags', 5),
  ('handbags', 'Bucket Bags', 'bucket-bags', 6),
  -- Small Bags
  ('small-bags', 'Clutches', 'clutches', 1),
  ('small-bags', 'Mini Bags', 'mini-bags', 2),
  ('small-bags', 'Pouches', 'pouches', 3),
  ('small-bags', 'Wristlets', 'wristlets', 4),
  -- Backpacks
  ('backpacks', 'Fashion Backpacks', 'fashion-backpacks', 1),
  ('backpacks', 'Laptop Backpacks', 'laptop-backpacks', 2),
  ('backpacks', 'Travel Backpacks', 'travel-backpacks', 3),
  ('backpacks', 'Sports Backpacks', 'sports-backpacks', 4),
  -- Travel Bags
  ('travel-bags', 'Duffel Bags', 'duffel-bags', 1),
  ('travel-bags', 'Weekender Bags', 'weekender-bags', 2),
  ('travel-bags', 'Cabin Bags', 'cabin-bags', 3),
  ('travel-bags', 'Suitcases', 'suitcases', 4),
  ('travel-bags', 'Travel Organizers', 'travel-organizers', 5),
  -- Work Bags
  ('work-bags', 'Briefcases', 'briefcases', 1),
  ('work-bags', 'Laptop Bags', 'laptop-bags', 2),
  ('work-bags', 'Messenger Bags', 'messenger-bags', 3),
  ('work-bags', 'Document Bags', 'document-bags', 4),
  -- Belt & Utility Bags
  ('belt-utility-bags', 'Belt Bags', 'belt-bags', 1),
  ('belt-utility-bags', 'Waist Bags', 'waist-bags', 2),
  ('belt-utility-bags', 'Chest Bags', 'chest-bags', 3),
  -- Belts
  ('belts', 'Casual Belts', 'casual-belts', 1),
  ('belts', 'Formal Belts', 'formal-belts', 2),
  ('belts', 'Waist Belts', 'waist-belts', 3),
  ('belts', 'Chain Belts', 'chain-belts', 4),
  -- Headwear
  ('headwear', 'Caps', 'caps', 1),
  ('headwear', 'Hats', 'hats', 2),
  ('headwear', 'Beanies', 'beanies', 3),
  ('headwear', 'Visors', 'visors', 4),
  ('headwear', 'Headbands', 'headbands', 5),
  -- Scarves & Wraps
  ('scarves-wraps', 'Scarves', 'scarves', 1),
  ('scarves-wraps', 'Shawls', 'shawls', 2),
  ('scarves-wraps', 'Wraps', 'wraps', 3),
  ('scarves-wraps', 'Bandanas', 'bandanas', 4),
  ('scarves-wraps', 'Hijabs', 'hijabs', 5),
  -- Eyewear
  ('eyewear', 'Sunglasses', 'sunglasses', 1),
  ('eyewear', 'Fashion Glasses', 'fashion-glasses', 2),
  ('eyewear', 'Eyewear Accessories', 'eyewear-accessories', 3),
  -- Gloves
  ('gloves', 'Fashion Gloves', 'fashion-gloves', 1),
  ('gloves', 'Winter Gloves', 'winter-gloves', 2),
  ('gloves', 'Sports Gloves', 'sports-gloves', 3),
  -- Ties & Formal Accessories
  ('ties-formal-accessories', 'Ties', 'ties', 1),
  ('ties-formal-accessories', 'Bow Ties', 'bow-ties', 2),
  ('ties-formal-accessories', 'Pocket Squares', 'pocket-squares', 3),
  ('ties-formal-accessories', 'Suspenders', 'suspenders', 4),
  ('ties-formal-accessories', 'Cufflinks', 'cufflinks', 5),
  -- Hair Accessories
  ('hair-accessories', 'Hair Clips', 'hair-clips', 1),
  ('hair-accessories', 'Hair Bands', 'hair-bands', 2),
  ('hair-accessories', 'Scrunchies', 'scrunchies', 3),
  ('hair-accessories', 'Hair Pins', 'hair-pins', 4),
  ('hair-accessories', 'Hair Bows', 'hair-bows', 5),
  -- Wallets & Card Holders
  ('wallets-card-holders', 'Wallets', 'wallets', 1),
  ('wallets-card-holders', 'Card Holders', 'card-holders', 2),
  ('wallets-card-holders', 'Coin Purses', 'coin-purses', 3),
  ('wallets-card-holders', 'Passport Holders', 'passport-holders', 4),
  -- Other Accessories
  ('other-accessories', 'Keychains', 'keychains', 1),
  ('other-accessories', 'Phone Straps', 'phone-straps', 2),
  ('other-accessories', 'Bag Charms', 'bag-charms', 3),
  ('other-accessories', 'Umbrellas', 'umbrellas', 4),
  -- Necklaces
  ('necklaces', 'Pendant Necklaces', 'pendant-necklaces', 1),
  ('necklaces', 'Chain Necklaces', 'chain-necklaces', 2),
  ('necklaces', 'Chokers', 'chokers', 3),
  ('necklaces', 'Layered Necklaces', 'layered-necklaces', 4),
  -- Earrings
  ('earrings', 'Stud Earrings', 'stud-earrings', 1),
  ('earrings', 'Hoop Earrings', 'hoop-earrings', 2),
  ('earrings', 'Drop Earrings', 'drop-earrings', 3),
  ('earrings', 'Clip-On Earrings', 'clip-on-earrings', 4),
  -- Rings
  ('rings', 'Fashion Rings', 'fashion-rings', 1),
  ('rings', 'Signet Rings', 'signet-rings', 2),
  ('rings', 'Stackable Rings', 'stackable-rings', 3),
  ('rings', 'Adjustable Rings', 'adjustable-rings', 4),
  -- Bracelets
  ('bracelets', 'Chain Bracelets', 'chain-bracelets', 1),
  ('bracelets', 'Bangles', 'bangles', 2),
  ('bracelets', 'Cuff Bracelets', 'cuff-bracelets', 3),
  ('bracelets', 'Charm Bracelets', 'charm-bracelets', 4),
  -- Anklets / Brooches / Body Jewelry / Jewelry Sets (single-type groups)
  ('anklets', 'Anklets', 'anklets', 1),
  ('brooches', 'Brooches', 'brooches', 1),
  ('body-jewelry', 'Body Jewelry', 'body-jewelry', 1),
  ('jewelry-sets', 'Jewelry Sets', 'jewelry-sets', 1),
  -- Baby Clothing
  ('baby-clothing', 'Bodysuits', 'bodysuits', 1),
  ('baby-clothing', 'Rompers', 'rompers', 2),
  ('baby-clothing', 'Sleepsuits', 'sleepsuits', 3),
  ('baby-clothing', 'Baby Sets', 'baby-sets', 4),
  ('baby-clothing', 'Bibs', 'bibs', 5),
  -- Schoolwear
  ('schoolwear', 'School Shirts', 'school-shirts', 1),
  ('schoolwear', 'School Trousers', 'school-trousers', 2),
  ('schoolwear', 'School Skirts', 'school-skirts', 3),
  ('schoolwear', 'School Uniform Sets', 'school-uniform-sets', 4),
  -- Kids Accessories
  ('kids-accessories', 'Baby Hats', 'baby-hats', 1),
  ('kids-accessories', 'Baby Blankets', 'baby-blankets', 2),
  ('kids-accessories', 'Baby Socks', 'baby-socks', 3),
  ('kids-accessories', 'Kids Hair Accessories', 'kids-hair-accessories', 4),
  -- Kids Shoes
  ('kids-shoes', 'Baby Shoes', 'baby-shoes', 1),
  ('kids-shoes', 'Kids Sneakers', 'kids-sneakers', 2),
  ('kids-shoes', 'Kids Sandals', 'kids-sandals', 3),
  ('kids-shoes', 'School Shoes', 'school-shoes', 4)
) as v(group_slug, name, slug, sort_order) on g.slug = v.group_slug and g.level = 2
on conflict (parent_id, slug) where parent_id is not null do nothing;
