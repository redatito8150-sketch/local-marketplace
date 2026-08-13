-- Evaluate auth.uid() once per statement instead of once per candidate row.
--
-- The policy expressions are otherwise unchanged. The target list is fixed to
-- the policies reported by Supabase's auth_rls_initplan advisor at audit time;
-- already-optimized and unrelated policies are deliberately left untouched.

do $migration$
declare
  policy_row record;
  using_clause text;
  check_clause text;
begin
  for policy_row in
    with targets(table_name, policy_name) as (
      values
        ('profiles', 'Users can read their own profile'),
        ('orders', 'Users can read their own orders'),
        ('order_items', 'Users can read their own order items'),
        ('brand_staff', 'Users can read their own brand_staff rows'),
        ('recently_viewed', 'Users can read their own recently-viewed'),
        ('addresses', 'Users can read their own addresses'),
        ('user_sessions', 'Users can read their own sessions'),
        ('wishlists', 'Users can read their own wishlist'),
        ('brand_follows', 'Users can read their own follows'),
        ('wishlists', 'Users can add to their own wishlist'),
        ('wishlists', 'Users can remove from their own wishlist'),
        ('brand_follows', 'Users can add their own brand follow'),
        ('brand_follows', 'Users can remove their own brand follow'),
        ('cart_items', 'Users can read their own cart'),
        ('cart_items', 'Users can add to their own cart'),
        ('cart_items', 'Users can update their own cart'),
        ('cart_items', 'Users can remove from their own cart'),
        ('products', 'Brand members can read their products'),
        ('product_variants', 'Brand members can read their product variants'),
        ('product_options', 'Brand members read own product options'),
        ('product_option_values', 'Brand members read own product option values'),
        ('product_variant_values', 'Brand members read own product variant values'),
        ('product_color_images', 'Brand members read own product color images'),
        ('user_notifications', 'Users read own notifications'),
        ('user_notifications', 'Users mark own notifications read'),
        ('order_status_history', 'Users can read their own order status history'),
        ('product_media', 'Brand members read own product media'),
        ('back_in_stock_subscriptions', 'Users manage own back-in-stock subscriptions'),
        ('back_in_stock_subscriptions', 'Users cancel own back-in-stock subscriptions'),
        ('master_orders', 'Users can read their own master orders')
    )
    select p.tablename, p.policyname, p.qual, p.with_check
    from pg_policies p
    join targets t
      on t.table_name = p.tablename
     and t.policy_name = p.policyname
    where p.schemaname = 'public'
  loop
    using_clause := case
      when policy_row.qual is null then ''
      else ' using (' || replace(policy_row.qual, 'auth.uid()', '(select auth.uid())') || ')'
    end;
    check_clause := case
      when policy_row.with_check is null then ''
      else ' with check (' || replace(policy_row.with_check, 'auth.uid()', '(select auth.uid())') || ')'
    end;

    execute format(
      'alter policy %I on public.%I%s%s',
      policy_row.policyname,
      policy_row.tablename,
      using_clause,
      check_clause
    );
  end loop;
end
$migration$;
