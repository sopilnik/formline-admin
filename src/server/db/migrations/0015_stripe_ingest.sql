-- Stage 8: the Stripe ingest (spec §7).
--
-- The ingest writes a pseudonymised copy of every store order into the template in the
-- same transaction as the owner's order (his decision, 1 October), so it needs the
-- template's id; workspaces stay closed to the application otherwise.
create function fa.template_workspace_id() returns uuid
  language sql stable security definer set search_path = pg_catalog, pg_temp as
  $$ select w.id from fa.workspaces w where w.kind = 'template' $$;

-- The daily job pseudonymises an owner-workspace customer 30 days after the panel first
-- saw them (spec §7.4). The pseudonym is computed by the application, which holds the
-- key; this function writes it, and also into the "New order" notifications of that
-- customer's orders, which the application may not update. A customer who is not yet
-- due, or already pseudonymised, is left as it is.
create function fa.pseudonymise_customer(p_customer uuid, p_email text, p_name text, p_city text, p_country text)
  returns boolean
  language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_owner uuid := fa.owner_workspace_id();
begin
  update fa.customers c
     set email = p_email, name = p_name, city = p_city, country = p_country, pseudonymised_at = now()
   where c.workspace_id = v_owner and c.id = p_customer
     and c.pseudonymised_at is null and c.created_at <= now() - interval '30 days';
  if not found then
    return false;
  end if;
  update fa.notifications n
     set payload = pg_catalog.jsonb_set(n.payload, '{customer}', pg_catalog.to_jsonb(p_name))
   where n.workspace_id = v_owner and n.kind = 'order.created'
     and n.payload ->> 'orderId' in (select o.id::text from fa.orders o where o.workspace_id = v_owner and o.customer_id = p_customer);
  return true;
end
$$;

grant execute on function fa.template_workspace_id(), fa.pseudonymise_customer(uuid, text, text, text, text) to app;
