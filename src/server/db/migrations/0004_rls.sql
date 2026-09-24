-- Row-level security: every per-workspace table is visible and writable only
-- inside the workspace set by withWorkspace(), with write rights per role
-- (spec §6.2). RLS is enabled, not forced: the table owner schema_owner — the
-- identity of the definer functions — is exempt; the app role never is.

create function fa.app_workspace_kind() returns fa.workspace_kind
  language sql stable security definer set search_path = pg_catalog, pg_temp as
  $$ select w.kind from fa.workspaces w where w.id = fa.app_workspace() $$;

-- users
alter table fa.users enable row level security;
create policy users_select on fa.users for select to app using (workspace_id = (select fa.app_workspace()));
create policy users_update on fa.users for update to app
  using (workspace_id = (select fa.app_workspace()) and (id = (select fa.app_user()) or (select fa.app_role()) in ('owner', 'admin')))
  with check (workspace_id = (select fa.app_workspace()));

-- sessions
alter table fa.sessions enable row level security;
create policy sessions_select on fa.sessions for select to app
  using (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()));
create policy sessions_insert on fa.sessions for insert to app
  with check (workspace_id = (select fa.app_workspace()) and (user_id = (select fa.app_user()) or (select fa.app_role()) = 'system'));
create policy sessions_update on fa.sessions for update to app
  using (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()))
  with check (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()));
create policy sessions_delete on fa.sessions for delete to app
  using (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()));

-- Deactivating a user revokes all of that user's sessions at once, so no code
-- path can forget it. Security definer: under the policies above an admin can
-- neither see nor delete other users' sessions.
create function fa.users_revoke_sessions() returns trigger
  language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  delete from fa.sessions s where s.workspace_id = new.workspace_id and s.user_id = new.id;
  return null;
end
$$;
create trigger users_revoke_sessions after update of deactivated_at on fa.users
  for each row when (old.deactivated_at is null and new.deactivated_at is not null)
  execute function fa.users_revoke_sessions();

-- passkeys (registration only in the owner workspace) and recovery codes: own rows only
alter table fa.passkeys enable row level security;
create policy passkeys_select on fa.passkeys for select to app
  using (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()));
create policy passkeys_insert on fa.passkeys for insert to app
  with check (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()) and (select fa.app_workspace_kind()) = 'owner');
create policy passkeys_update on fa.passkeys for update to app
  using (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()))
  with check (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()));
create policy passkeys_delete on fa.passkeys for delete to app
  using (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()));

alter table fa.recovery_codes enable row level security;
create policy recovery_codes_select on fa.recovery_codes for select to app
  using (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()));
create policy recovery_codes_insert on fa.recovery_codes for insert to app
  with check (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()));
create policy recovery_codes_update on fa.recovery_codes for update to app
  using (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()))
  with check (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()));
create policy recovery_codes_delete on fa.recovery_codes for delete to app
  using (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()));

-- invitations: owners and admins, sandboxes only
alter table fa.invitations enable row level security;
create policy invitations_select on fa.invitations for select to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin'));
create policy invitations_insert on fa.invitations for insert to app
  with check (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin') and (select fa.app_workspace_kind()) = 'sandbox');
create policy invitations_update on fa.invitations for update to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin'))
  with check (workspace_id = (select fa.app_workspace()));

-- catalog: everyone reads, owners, admins and managers write; the ingest (system) may change stock
alter table fa.collections enable row level security;
create policy collections_select on fa.collections for select to app using (workspace_id = (select fa.app_workspace()));
create policy collections_insert on fa.collections for insert to app
  with check (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin', 'manager'));
create policy collections_update on fa.collections for update to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin', 'manager'))
  with check (workspace_id = (select fa.app_workspace()));
create policy collections_delete on fa.collections for delete to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin', 'manager'));

alter table fa.images enable row level security;
create policy images_select on fa.images for select to app using (workspace_id = (select fa.app_workspace()));
create policy images_insert on fa.images for insert to app
  with check (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin', 'manager'));
create policy images_update on fa.images for update to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin', 'manager'))
  with check (workspace_id = (select fa.app_workspace()));
create policy images_delete on fa.images for delete to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin', 'manager'));

alter table fa.products enable row level security;
create policy products_select on fa.products for select to app using (workspace_id = (select fa.app_workspace()));
create policy products_insert on fa.products for insert to app
  with check (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin', 'manager'));
create policy products_update on fa.products for update to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin', 'manager'))
  with check (workspace_id = (select fa.app_workspace()));
create policy products_delete on fa.products for delete to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin', 'manager'));

alter table fa.product_variants enable row level security;
create policy product_variants_select on fa.product_variants for select to app using (workspace_id = (select fa.app_workspace()));
create policy product_variants_insert on fa.product_variants for insert to app
  with check (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin', 'manager'));
create policy product_variants_update on fa.product_variants for update to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin', 'manager', 'system'))
  with check (workspace_id = (select fa.app_workspace()));
create policy product_variants_delete on fa.product_variants for delete to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin', 'manager'));

-- customers: created by the ingest; notes by owners, admins and managers; never deleted by the application
alter table fa.customers enable row level security;
create policy customers_select on fa.customers for select to app using (workspace_id = (select fa.app_workspace()));
create policy customers_insert on fa.customers for insert to app
  with check (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) = 'system');
create policy customers_update on fa.customers for update to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin', 'manager', 'system'))
  with check (workspace_id = (select fa.app_workspace()));

alter table fa.workspace_counters enable row level security;
create policy workspace_counters_select on fa.workspace_counters for select to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) = 'system');
create policy workspace_counters_update on fa.workspace_counters for update to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) = 'system')
  with check (workspace_id = (select fa.app_workspace()));

-- orders and lines: created by the ingest; status changes by owners, admins and managers
alter table fa.orders enable row level security;
create policy orders_select on fa.orders for select to app using (workspace_id = (select fa.app_workspace()));
create policy orders_insert on fa.orders for insert to app
  with check (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) = 'system');
create policy orders_update on fa.orders for update to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin', 'manager', 'system'))
  with check (workspace_id = (select fa.app_workspace()));

alter table fa.order_lines enable row level security;
create policy order_lines_select on fa.order_lines for select to app using (workspace_id = (select fa.app_workspace()));
create policy order_lines_insert on fa.order_lines for insert to app
  with check (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) = 'system');
create policy order_lines_update on fa.order_lines for update to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin', 'manager', 'system'))
  with check (workspace_id = (select fa.app_workspace()));

alter table fa.order_events enable row level security;
create policy order_events_select on fa.order_events for select to app using (workspace_id = (select fa.app_workspace()));
create policy order_events_insert on fa.order_events for insert to app
  with check (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin', 'manager', 'system'));

-- activity log: every role appends; owners and admins read
alter table fa.activity_log enable row level security;
create policy activity_log_select on fa.activity_log for select to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin'));
create policy activity_log_insert on fa.activity_log for insert to app
  with check (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) is not null);

-- notifications: broadcast or addressed to the reader
alter table fa.notifications enable row level security;
create policy notifications_select on fa.notifications for select to app
  using (workspace_id = (select fa.app_workspace()) and (user_id is null or user_id = (select fa.app_user())));
create policy notifications_insert on fa.notifications for insert to app
  with check (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) is not null);

alter table fa.notification_reads enable row level security;
create policy notification_reads_select on fa.notification_reads for select to app
  using (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()));
create policy notification_reads_insert on fa.notification_reads for insert to app
  with check (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()));
create policy notification_reads_delete on fa.notification_reads for delete to app
  using (workspace_id = (select fa.app_workspace()) and user_id = (select fa.app_user()));

-- outbox: every role writes letters; owners and admins read
alter table fa.outbox_emails enable row level security;
create policy outbox_emails_select on fa.outbox_emails for select to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin'));
create policy outbox_emails_insert on fa.outbox_emails for insert to app
  with check (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) is not null);

alter table fa.store_settings enable row level security;
create policy store_settings_select on fa.store_settings for select to app using (workspace_id = (select fa.app_workspace()));
create policy store_settings_update on fa.store_settings for update to app
  using (workspace_id = (select fa.app_workspace()) and (select fa.app_role()) in ('owner', 'admin'))
  with check (workspace_id = (select fa.app_workspace()));

-- Grants: row-level security narrows these; tables absent here stay closed.
grant select, insert, update, delete on fa.users, fa.sessions, fa.passkeys, fa.recovery_codes, fa.invitations,
  fa.collections, fa.images, fa.products, fa.product_variants, fa.customers, fa.workspace_counters, fa.orders,
  fa.order_lines, fa.notification_reads, fa.store_settings to app;
grant select, insert on fa.order_events, fa.activity_log, fa.notifications, fa.outbox_emails to app;
grant select, insert, update on fa.rate_limits to app;
grant select, insert on fa.stripe_events, fa.used_challenges to app;
grant select, insert, delete on fa.pending_media_deletions to app;

revoke execute on all functions in schema fa from public;
alter default privileges for role schema_owner in schema fa revoke execute on functions from public;
grant execute on function fa.app_workspace(), fa.app_user(), fa.app_role(), fa.app_workspace_kind() to app;
