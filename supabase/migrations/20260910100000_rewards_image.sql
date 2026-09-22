alter table public.rewards
  add column image_url   text,
  add column badge_label text;

insert into storage.buckets (id, name, public)
  values ('reward-images', 'reward-images', true)
  on conflict (id) do nothing;

create policy "Public read reward-images"
  on storage.objects for select
  using (bucket_id = 'reward-images');
