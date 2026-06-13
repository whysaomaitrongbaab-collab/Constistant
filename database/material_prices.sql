-- Material Price Catalog
-- User-level persistent price list, used to enrich BOQ items (boq_items.unit_rate_thb)
-- via js/catalog/material-catalog.js + js/boq/boq-summary.js (linkCatalogPrices)

create table if not exists material_prices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  -- Classification (3-axis taxonomy)
  material_type text not null,     -- 'concrete' | 'rebar' | 'formwork' | 'masonry' | 'finishing' | 'mep'
  material_subtype text,           -- e.g. 'ready_mix_concrete' | 'deformed_bar' | 'plywood_formwork'
  brand text,                      -- e.g. 'SCG' | 'TPI' | 'Siam Steel' | null

  -- Item details
  trade_name text not null,        -- Thai/English product name
  unit text not null,              -- 'm3' | 'kg' | 'ton' | 'm2' | 'piece' | 'set'
  unit_price decimal(12,2),        -- THB
  price_date date,                 -- date of quote
  supplier_name text,
  notes text,

  -- Catalog source
  catalog_source text default 'manual', -- 'manual' | 'import_csv' | 'catalog_scg' | 'catalog_tpi' | 'catalog_government' | 'catalog_sme'
  is_active boolean default true,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists material_prices_user_id_idx on material_prices(user_id);
create index if not exists material_prices_type_unit_idx on material_prices(material_type, unit);
create index if not exists material_prices_subtype_idx on material_prices(material_subtype);

-- RLS: users see only their own rows
alter table material_prices enable row level security;

drop policy if exists "Users manage own prices" on material_prices;
create policy "Users manage own prices" on material_prices
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep updated_at fresh on edit
create or replace function material_prices_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists material_prices_updated_at on material_prices;
create trigger material_prices_updated_at
  before update on material_prices
  for each row
  execute function material_prices_set_updated_at();
