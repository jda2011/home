create table if not exists public.artworks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  price_krw integer not null check (price_krw >= 0),
  image_url text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  artwork_id uuid references public.artworks(id) on delete set null,
  description text not null check (char_length(description) between 1 and 2000),
  budget_krw integer check (budget_krw is null or budget_krw >= 0),
  quote_krw integer check (quote_krw is null or quote_krw >= 0),
  status text not null default 'requested'
    check (status in ('requested', 'quoted', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists orders_customer_created_idx
  on public.orders (customer_id, created_at desc);
create index if not exists messages_customer_created_idx
  on public.support_messages (customer_id, created_at desc);
create index if not exists messages_order_created_idx
  on public.support_messages (order_id, created_at asc);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as u
    where u.id = (select auth.uid())
      and lower(u.email) in ('8yskvkwj@gmail.com', 'jdaadj0228@gmail.com')
      and u.email_confirmed_at is not null
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

grant select on public.artworks to anon, authenticated;
grant insert, update, delete on public.artworks to authenticated;
grant select, insert on public.orders to authenticated;
grant update on public.orders to authenticated;
grant select, insert on public.support_messages to authenticated;

alter table public.artworks enable row level security;
alter table public.orders enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists "Anyone can view artworks" on public.artworks;
drop policy if exists "Admins can add artworks" on public.artworks;
drop policy if exists "Admins can update artworks" on public.artworks;
drop policy if exists "Admins can delete artworks" on public.artworks;
create policy "Anyone can view artworks"
  on public.artworks for select
  using (true);
create policy "Admins can add artworks"
  on public.artworks for insert to authenticated
  with check (public.is_admin());
create policy "Admins can update artworks"
  on public.artworks for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete artworks"
  on public.artworks for delete to authenticated
  using (public.is_admin());

drop policy if exists "Customers and admins can view orders" on public.orders;
drop policy if exists "Customers can create their own orders" on public.orders;
drop policy if exists "Admins can update orders" on public.orders;
create policy "Customers and admins can view orders"
  on public.orders for select to authenticated
  using (customer_id = (select auth.uid()) or public.is_admin());
create policy "Customers can create their own orders"
  on public.orders for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and status = 'requested'
    and quote_krw is null
  );
create policy "Admins can update orders"
  on public.orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Customers and admins can view support messages" on public.support_messages;
drop policy if exists "Customers and admins can send support messages" on public.support_messages;
create policy "Customers and admins can view support messages"
  on public.support_messages for select to authenticated
  using (customer_id = (select auth.uid()) or public.is_admin());
create policy "Customers and admins can send support messages"
  on public.support_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      public.is_admin()
      or (
        customer_id = (select auth.uid())
        and order_id is null
      )
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'artworks',
  'artworks',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can upload artwork images" on storage.objects;
drop policy if exists "Admins can update artwork images" on storage.objects;
drop policy if exists "Admins can delete artwork images" on storage.objects;
create policy "Admins can upload artwork images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'artworks' and public.is_admin());
create policy "Admins can update artwork images"
  on storage.objects for update to authenticated
  using (bucket_id = 'artworks' and public.is_admin())
  with check (bucket_id = 'artworks' and public.is_admin());
create policy "Admins can delete artwork images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'artworks' and public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.support_messages;
exception
  when duplicate_object then null;
end
$$;
