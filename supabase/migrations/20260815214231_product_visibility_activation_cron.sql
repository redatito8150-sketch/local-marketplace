-- Vercel Hobby only permits daily cron expressions. Scheduled product
-- visibility is database-only work, so keep its hourly safety-net beside the
-- authoritative visibility state instead of requiring a paid web scheduler.
create extension if not exists pg_cron;

-- Named jobs are replaced explicitly, making this migration safe for an
-- environment that was configured manually before the migration landed.
select cron.unschedule(jobid)
from cron.job
where jobname = 'product-visibility-activation';

select cron.schedule(
  'product-visibility-activation',
  '0 * * * *',
  $job$select private.execute_scheduled_product_visibility_activation(200);$job$
);

-- Cron administration is never a customer-facing Data API capability.
revoke usage on schema cron from public, anon, authenticated;

;
