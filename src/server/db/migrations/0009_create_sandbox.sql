-- Demo entry (spec §2, §6.2–6.5). One call copies the template into a new
-- sandbox workspace with the template's ids, shifts the generated timestamps to
-- now and opens a verified session for the sandbox's owner-role demo user. The
-- expected outcomes come back as a row, not as errors: 'created', 'rate_limited'
-- (five sandboxes an hour per address, counted on fa.rate_limits with the
-- application's fixed-window formula) and 'full' (100 live sandboxes and none idle
-- for 15 minutes). A transaction-level advisory lock serialises callers, so the
-- cap holds under concurrency and an active sandbox is never evicted.

-- Queues a workspace's uploaded images for deletion from storage; the daily job
-- retries until the delete succeeds. Static template posters are never queued.
create function fa.queue_workspace_media(p_workspace uuid) returns integer
  language sql security definer set search_path = pg_catalog, pg_temp as $$
  with queued as (
    insert into fa.pending_media_deletions (storage_path)
      select i.storage_path from fa.images i where i.workspace_id = p_workspace and i.source = 'upload'
      on conflict (storage_path) do nothing
      returning 1)
  select count(*)::integer from queued
$$;

create function fa.create_sandbox(p_ip_hash text, p_session_hash text, p_user_agent text, p_locale text)
  returns table (outcome text, sandbox_id uuid, demo_user_id uuid, sandbox_expires_at timestamptz, retry_after_seconds integer)
  language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  c_limit constant integer := 5;
  c_window constant integer := 3600;
  c_cap constant integer := 100;
  v_count integer;
  v_retry integer;
  v_template uuid;
  v_epoch timestamptz;
  v_shift interval;
  v_live integer;
  v_evict uuid;
  v_ws uuid;
  v_user uuid;
  v_expires timestamptz := now() + interval '24 hours';
begin
  perform pg_advisory_xact_lock(7201327);

  insert into fa.rate_limits as r (purpose, subject, window_start, count)
    values ('sandbox.create.ip', 'ip:' || coalesce(p_ip_hash, 'unknown'),
            to_timestamp(floor(extract(epoch from now()) / c_window) * c_window), 1)
    on conflict (purpose, subject, window_start) do update set count = r.count + 1
    returning r.count, ceil(extract(epoch from r.window_start + make_interval(secs => c_window) - now()))::integer
    into v_count, v_retry;
  if v_count > c_limit then
    return query select 'rate_limited'::text, null::uuid, null::uuid, null::timestamptz, greatest(v_retry, 1);
    return;
  end if;

  select w.id, w.template_epoch into v_template, v_epoch from fa.workspaces w where w.kind = 'template';
  if v_template is null or v_epoch is null then
    raise exception 'the template is not built' using errcode = 'no_data_found';
  end if;

  select count(*)::integer into v_live from fa.workspaces w
   where w.kind = 'sandbox' and w.expires_at > now() and w.last_active_at > now() - interval '2 hours';
  if v_live >= c_cap then
    select w.id into v_evict from fa.workspaces w
     where w.kind = 'sandbox' and w.last_active_at <= now() - interval '15 minutes'
     order by w.last_active_at asc limit 1;
    if v_evict is null then
      return query select 'full'::text, null::uuid, null::uuid, null::timestamptz, 0;
      return;
    end if;
    perform fa.queue_workspace_media(v_evict);
    delete from fa.workspaces w where w.id = v_evict;
  end if;

  v_shift := now() - v_epoch;
  insert into fa.workspaces (kind, expires_at, creator_ip_hash, template_version)
    select 'sandbox', v_expires, p_ip_hash, t.template_version from fa.workspaces t where t.id = v_template
    returning id into v_ws;
  insert into fa.users (workspace_id, id, email, name, role, password_hash, totp_secret_enc, totp_last_step, locale, theme, shortcuts_enabled, deactivated_at, created_at)
    select v_ws, u.id, u.email, u.name, u.role, u.password_hash, u.totp_secret_enc, u.totp_last_step,
           case when u.role = 'owner' and p_locale in ('en', 'ru') then p_locale else u.locale end,
           u.theme, u.shortcuts_enabled, u.deactivated_at, u.created_at + v_shift
      from fa.users u where u.workspace_id = v_template;
  insert into fa.collections (workspace_id, id, slug, name, description, position)
    select v_ws, c.id, c.slug, c.name, c.description, c.position from fa.collections c where c.workspace_id = v_template;
  insert into fa.images (workspace_id, id, storage_path, source, width, height, bytes, created_at)
    select v_ws, i.id, i.storage_path, i.source, i.width, i.height, i.bytes, i.created_at + v_shift
      from fa.images i where i.workspace_id = v_template;
  insert into fa.products (workspace_id, id, slug, name, collection_id, description, base_price_cents, status, tags, image_id, created_at, updated_at)
    select v_ws, p.id, p.slug, p.name, p.collection_id, p.description, p.base_price_cents, p.status, p.tags, p.image_id,
           p.created_at + v_shift, p.updated_at + v_shift
      from fa.products p where p.workspace_id = v_template;
  insert into fa.product_variants (workspace_id, id, product_id, sku, size, palette, price_override_cents, stock, low_stock_threshold)
    select v_ws, v.id, v.product_id, v.sku, v.size, v.palette, v.price_override_cents, v.stock, v.low_stock_threshold
      from fa.product_variants v where v.workspace_id = v_template;
  insert into fa.customers (workspace_id, id, email, name, city, country, notes, pseudonymised_at, created_at)
    select v_ws, c.id, c.email, c.name, c.city, c.country, c.notes, c.pseudonymised_at,
           case when c.pseudonymised_at is null then c.created_at + v_shift else c.created_at end
      from fa.customers c where c.workspace_id = v_template;
  insert into fa.workspace_counters (workspace_id, next_order_number)
    select v_ws, wc.next_order_number from fa.workspace_counters wc where wc.workspace_id = v_template;
  -- Generated orders move with the epoch; store-order copies keep their real dates, the latest 50 of them.
  insert into fa.orders (workspace_id, id, number, customer_id, status, source, stripe_session_id, external_ref, delivery,
                         subtotal_cents, shipping_cents, total_cents, shipping_address, placed_at, updated_at)
    select v_ws, o.id, o.number, o.customer_id, o.status, o.source, o.stripe_session_id, o.external_ref, o.delivery,
           o.subtotal_cents, o.shipping_cents, o.total_cents, o.shipping_address,
           case when o.source = 'seed' then o.placed_at + v_shift else o.placed_at end,
           case when o.source = 'seed' then o.updated_at + v_shift else o.updated_at end
      from fa.orders o
     where o.workspace_id = v_template
       and (o.source = 'seed'
            or o.id in (select s.id from fa.orders s where s.workspace_id = v_template and s.source = 'stripe' order by s.placed_at desc limit 50));
  insert into fa.order_lines (workspace_id, id, order_id, variant_id, sku, name, unit_cents, qty, unmatched)
    select v_ws, l.id, l.order_id, l.variant_id, l.sku, l.name, l.unit_cents, l.qty, l.unmatched
      from fa.order_lines l
     where l.workspace_id = v_template and exists (select 1 from fa.orders o where o.workspace_id = v_ws and o.id = l.order_id);
  insert into fa.order_events (workspace_id, id, order_id, kind, from_status, to_status, note, actor_user_id, at)
    select v_ws, e.id, e.order_id, e.kind, e.from_status, e.to_status, e.note, e.actor_user_id,
           case when o.source = 'seed' then e.at + v_shift else e.at end
      from fa.order_events e
      join fa.orders o on o.workspace_id = v_ws and o.id = e.order_id
     where e.workspace_id = v_template;
  insert into fa.store_settings (workspace_id, store_name, support_email, timezone, low_stock_default)
    select v_ws, s.store_name, s.support_email, s.timezone, s.low_stock_default from fa.store_settings s where s.workspace_id = v_template;

  select u.id into v_user from fa.users u where u.workspace_id = v_ws and u.role = 'owner';
  insert into fa.sessions (workspace_id, id, user_id, expires_at, second_factor_verified, reauth_at, user_agent_summary, ip_hash)
    values (v_ws, p_session_hash, v_user, v_expires, true, now(), p_user_agent, p_ip_hash);
  insert into fa.activity_log (workspace_id, actor_user_id, action, ip_hash)
    values (v_ws, v_user, 'sandbox.created', p_ip_hash);

  return query select 'created'::text, v_ws, v_user, v_expires, 0;
end
$$;

grant execute on function fa.create_sandbox(text, text, text, text) to app;
