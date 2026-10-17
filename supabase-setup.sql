-- ABAMY DF STORE — jalankan di Supabase SQL Editor.
-- Catatan: jalankan pada proyek baru/yang belum memiliki tabel bernama stores/products.
create extension if not exists pgcrypto;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  price numeric(14,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  image_path text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_store_id_idx on public.products(store_id);
create index if not exists products_public_idx on public.products(is_published, created_at desc);
create index if not exists stores_slug_idx on public.stores(slug);

alter table public.stores enable row level security;
alter table public.products enable row level security;

-- Profil toko publik aktif dapat dibaca semua orang; pemilik dapat membaca/mengubah tokonya sendiri.
drop policy if exists "public read active stores" on public.stores;
create policy "public read active stores" on public.stores for select
  using (is_active = true or owner_id = (select auth.uid()));

drop policy if exists "owner insert own store" on public.stores;
create policy "owner insert own store" on public.stores for insert
  to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists "owner update own store" on public.stores;
create policy "owner update own store" on public.stores for update
  to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Produk publik hanya tampil jika dipublikasikan dan toko aktif.
drop policy if exists "public read published products" on public.products;
create policy "public read published products" on public.products for select
  using (
    (is_published = true and exists (
      select 1 from public.stores s
      where s.id = products.store_id and s.is_active = true
    ))
    or exists (
      select 1 from public.stores s
      where s.id = products.store_id and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "owner insert own products" on public.products;
create policy "owner insert own products" on public.products for insert
  to authenticated with check (
    exists (select 1 from public.stores s
      where s.id = products.store_id and s.owner_id = (select auth.uid()) and s.is_active = true)
  );

drop policy if exists "owner update own products" on public.products;
create policy "owner update own products" on public.products for update
  to authenticated using (
    exists (select 1 from public.stores s where s.id = products.store_id and s.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.stores s where s.id = products.store_id and s.owner_id = (select auth.uid()))
  );

drop policy if exists "owner delete own products" on public.products;
create policy "owner delete own products" on public.products for delete
  to authenticated using (
    exists (select 1 from public.stores s where s.id = products.store_id and s.owner_id = (select auth.uid()))
  );

-- Buat profil toko otomatis setelah akun dibuat.
create or replace function public.create_store_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_slug text;
  v_base text;
  v_suffix integer := 0;
begin
  v_name := coalesce(nullif(new.raw_user_meta_data ->> 'store_name',''), split_part(new.email,'@',1), 'Toko Baru');
  v_base := lower(regexp_replace(translate(v_name,
    'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÑñ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOooooooUUUUuuuuNn'), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  if v_base = '' then v_base := 'toko'; end if;
  v_slug := coalesce(nullif(new.raw_user_meta_data ->> 'store_slug',''), v_base);
  v_slug := lower(trim(both '-' from regexp_replace(v_slug, '[^a-zA-Z0-9-]+', '-', 'g')));
  if v_slug = '' then v_slug := v_base; end if;
  while exists (select 1 from public.stores where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base || '-' || v_suffix::text;
  end loop;
  insert into public.stores(owner_id, name, slug)
  values (new.id, v_name, v_slug)
  on conflict (owner_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_store on auth.users;
create trigger on_auth_user_created_create_store
  after insert on auth.users
  for each row execute procedure public.create_store_for_new_user();

-- Storage bucket untuk foto produk. Maks 5 MB; hanya tipe gambar yang disetujui.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=5242880, allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "public read product images" on storage.objects;
create policy "public read product images" on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists "client upload own product images" on storage.objects;
create policy "client upload own product images" on storage.objects for insert
  to authenticated with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "client update own product images" on storage.objects;
create policy "client update own product images" on storage.objects for update
  to authenticated using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "client delete own product images" on storage.objects;
create policy "client delete own product images" on storage.objects for delete
  to authenticated using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ADMIN:
-- Jangan membuat role admin hanya dari metadata yang bisa diubah user.
-- Untuk MVP, undang/kelola akun melalui Supabase Dashboard > Authentication.
-- Menonaktifkan akun secara aman sebaiknya melalui Edge Function/server-side
-- yang memverifikasi admin dari app_metadata/JWT terkelola server, kemudian
-- menggunakan Supabase Admin API. Jangan pernah masukkan service_role key ke frontend.
