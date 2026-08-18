create temporary table cleanup_fulfillment_test_brands on commit drop as
select id from public.brands where slug like 'test-fulfillment-%';
delete from public.warehouse_transfer_items where transfer_id in (
 select transfer.id from public.warehouse_transfers transfer join cleanup_fulfillment_test_brands brand on brand.id=transfer.brand_id
);
delete from public.warehouse_transfers where brand_id in (select id from cleanup_fulfillment_test_brands);
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements where brand_id in (select id from cleanup_fulfillment_test_brands);
alter table public.inventory_movements enable trigger inventory_movements_immutable;
delete from public.brand_fulfillment_transitions where brand_id in (select id from cleanup_fulfillment_test_brands);
delete from public.product_variants where product_id in (
 select product.id from public.products product join cleanup_fulfillment_test_brands brand on brand.id=product.brand_id
);
delete from public.products where brand_id in (select id from cleanup_fulfillment_test_brands);
delete from public.brands where id in (select id from cleanup_fulfillment_test_brands);;
