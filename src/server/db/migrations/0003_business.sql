create table fa.collections (
  workspace_id uuid not null references fa.workspaces (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and pg_catalog.length(slug) <= 60),
  name text not null check (pg_catalog.length(name) between 1 and 80),
  description text not null default '' check (pg_catalog.length(description) <= 2000),
  position integer not null default 0,
  primary key (workspace_id, id),
  unique (workspace_id, slug)
);

create table fa.images (
  workspace_id uuid not null references fa.workspaces (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  storage_path text not null check (pg_catalog.length(storage_path) <= 300),
  source text not null check (source in ('static', 'upload')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  bytes integer not null check (bytes > 0),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table fa.products (
  workspace_id uuid not null references fa.workspaces (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and pg_catalog.length(slug) <= 80),
  name text not null check (pg_catalog.length(name) between 1 and 120),
  collection_id uuid not null,
  description text not null default '' check (pg_catalog.length(description) <= 4000),
  base_price_cents integer not null check (base_price_cents > 0),
  status text not null check (status in ('draft', 'published', 'archived')),
  tags text[] not null default '{}',
  image_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, slug),
  foreign key (workspace_id, collection_id) references fa.collections (workspace_id, id),
  foreign key (workspace_id, image_id) references fa.images (workspace_id, id) on delete set null (image_id)
);

create table fa.product_variants (
  workspace_id uuid not null,
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  sku text not null check (sku ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  size text not null check (size in ('a3', 'a2', 'a1')),
  palette text not null check (palette ~ '^[a-z]+$'),
  price_override_cents integer check (price_override_cents > 0),
  stock integer not null default 0 check (stock >= 0),
  low_stock_threshold integer not null default 3 check (low_stock_threshold >= 0),
  primary key (workspace_id, id),
  unique (workspace_id, sku),
  unique (workspace_id, product_id, size, palette),
  foreign key (workspace_id, product_id) references fa.products (workspace_id, id) on delete cascade
);

create table fa.customers (
  workspace_id uuid not null references fa.workspaces (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  email text not null check (pg_catalog.length(email) between 3 and 254),
  name text not null check (pg_catalog.length(name) between 1 and 120),
  city text check (pg_catalog.length(city) <= 80),
  country text check (country ~ '^[A-Z]{2}$'),
  notes text not null default '' check (pg_catalog.length(notes) <= 2000),
  pseudonymised_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create unique index customers_email on fa.customers (workspace_id, pg_catalog.lower(email));

create table fa.workspace_counters (
  workspace_id uuid primary key references fa.workspaces (id) on delete cascade,
  next_order_number integer not null default 1001 check (next_order_number > 0)
);

create table fa.orders (
  workspace_id uuid not null references fa.workspaces (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  number integer not null check (number > 0),
  customer_id uuid not null,
  status text not null check (status in ('paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  source text not null check (source in ('seed', 'stripe')),
  stripe_session_id text,
  external_ref text check (pg_catalog.length(external_ref) <= 100),
  delivery text not null check (delivery in ('standard', 'express')),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer not null check (shipping_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  shipping_address jsonb,
  placed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, number),
  unique (workspace_id, stripe_session_id),
  constraint orders_total check (total_cents = subtotal_cents + shipping_cents),
  foreign key (workspace_id, customer_id) references fa.customers (workspace_id, id)
);
create index orders_placed_idx on fa.orders (workspace_id, placed_at desc);
create index orders_status_idx on fa.orders (workspace_id, status, placed_at desc);
create index orders_customer_idx on fa.orders (workspace_id, customer_id);

create table fa.order_lines (
  workspace_id uuid not null,
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  variant_id uuid,
  sku text,
  name text not null check (pg_catalog.length(name) between 1 and 200),
  unit_cents integer not null check (unit_cents >= 0),
  qty integer not null check (qty > 0),
  unmatched boolean not null default false,
  primary key (workspace_id, id),
  foreign key (workspace_id, order_id) references fa.orders (workspace_id, id) on delete cascade,
  foreign key (workspace_id, variant_id) references fa.product_variants (workspace_id, id) on delete set null (variant_id)
);
create index order_lines_order_idx on fa.order_lines (workspace_id, order_id);
create index order_lines_variant_idx on fa.order_lines (workspace_id, variant_id);

create table fa.order_events (
  workspace_id uuid not null,
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  kind text not null check (kind in ('status', 'note')),
  from_status text,
  to_status text,
  note text check (pg_catalog.length(note) <= 1000),
  actor_user_id uuid,
  at timestamptz not null default now(),
  primary key (workspace_id, id),
  constraint order_events_shape check ((kind = 'status') = (to_status is not null) and (kind = 'note') = (note is not null)),
  foreign key (workspace_id, order_id) references fa.orders (workspace_id, id) on delete cascade,
  foreign key (workspace_id, actor_user_id) references fa.users (workspace_id, id) on delete set null (actor_user_id)
);
create index order_events_order_idx on fa.order_events (workspace_id, order_id, at);

create table fa.activity_log (
  workspace_id uuid not null references fa.workspaces (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  actor_user_id uuid,
  action text not null check (pg_catalog.length(action) <= 60),
  entity_type text check (pg_catalog.length(entity_type) <= 40),
  entity_id text check (pg_catalog.length(entity_id) <= 100),
  details jsonb not null default '{}',
  ip_hash text,
  at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, actor_user_id) references fa.users (workspace_id, id) on delete set null (actor_user_id)
);
create index activity_log_at_idx on fa.activity_log (workspace_id, at desc);

create table fa.notifications (
  workspace_id uuid not null references fa.workspaces (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  kind text not null check (pg_catalog.length(kind) <= 40),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, user_id) references fa.users (workspace_id, id) on delete cascade
);
create index notifications_created_idx on fa.notifications (workspace_id, created_at desc);

create table fa.notification_reads (
  workspace_id uuid not null,
  notification_id uuid not null,
  user_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (workspace_id, notification_id, user_id),
  foreign key (workspace_id, notification_id) references fa.notifications (workspace_id, id) on delete cascade,
  foreign key (workspace_id, user_id) references fa.users (workspace_id, id) on delete cascade
);

create table fa.outbox_emails (
  workspace_id uuid not null references fa.workspaces (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  to_address text not null check (pg_catalog.length(to_address) between 3 and 254),
  template text not null check (pg_catalog.length(template) <= 40),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table fa.store_settings (
  workspace_id uuid primary key references fa.workspaces (id) on delete cascade,
  store_name text not null default 'Formline' check (pg_catalog.length(store_name) between 1 and 80),
  support_email text not null default 'support@formline.example' check (pg_catalog.length(support_email) between 3 and 254),
  timezone text not null default 'Europe/Berlin' check (pg_catalog.length(timezone) <= 60),
  low_stock_default integer not null default 3 check (low_stock_default >= 0)
);
