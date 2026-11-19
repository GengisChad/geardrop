-- The cart suggests pieces that paid orders held together ("Altri clienti hanno preso anche").
-- The storefront server reads which pieces each paid order held, with its own key, and sends
-- the browser only the order of the pieces, never a count or a buyer.
--
-- New tables and columns are not exposed to the API roles unless granted (see config.toml), so
-- the read is granted here, and only on the columns it uses: which order, whose shop, whether
-- it was paid, which piece and how many. Nothing about the buyer is granted by this migration.
grant select (id, organization_id, payment_status, status) on public.orders to service_role;
grant select (order_id, organization_id, sku_snapshot, quantity) on public.order_items to service_role;
