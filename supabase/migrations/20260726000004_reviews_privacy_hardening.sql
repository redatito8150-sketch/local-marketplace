-- Column-level privacy hardening. No rows are changed.
revoke select on public.reviews from anon, authenticated;
grant select (id, product_id, rating, title, body, status, published_at, created_at, updated_at)
  on public.reviews to anon, authenticated;

revoke select on public.review_images from anon, authenticated;
grant select (id, review_id, display_order, created_at)
  on public.review_images to anon, authenticated;

revoke select on public.review_replies from anon, authenticated;
grant select (id, review_id, brand_slug, body, created_at, updated_at)
  on public.review_replies to anon, authenticated;

-- Mutations remain protected by RLS, while authenticated callers can return
-- the public id/status fields after their own insert/update.
