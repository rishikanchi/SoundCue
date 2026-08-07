begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles force row-level security'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.consent_events'::regclass),
  'consent events force row-level security'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.screenings'::regclass),
  'screenings force row-level security'
);
select ok(has_table_privilege('authenticated', 'public.screenings', 'select'), 'clients can read their screening rows');
select ok(not has_table_privilege('authenticated', 'public.screenings', 'insert'), 'clients cannot insert screening rows');
select ok(not has_table_privilege('authenticated', 'public.screenings', 'update'), 'clients cannot update screening rows');
select ok(not has_table_privilege('authenticated', 'public.screenings', 'delete'), 'clients cannot delete screening rows directly');
select ok(has_table_privilege('service_role', 'public.screenings', 'select,insert,update,delete'), 'trusted server can manage screening lifecycle rows');
select ok(not has_column_privilege('authenticated', 'public.screenings', 'score', 'update'), 'clients cannot write analyzer scores');
select ok(has_column_privilege('authenticated', 'public.profiles', 'sound_cues_enabled', 'update'), 'clients may update only the sound preference');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'user_id', 'update'), 'clients cannot change profile ownership');
select ok(not has_table_privilege('authenticated', 'public.consent_events', 'update'), 'consent events are immutable to clients');
select ok(
  exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'screenings' and indexname = 'screenings_user_created_id_idx'),
  'history ownership index exists'
);
select ok(
  exists(select 1 from storage.buckets where id = 'recordings' and not public and file_size_limit = 10485760),
  'recordings bucket is private and limited to 10 MiB'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-111111111111','authenticated','authenticated','a@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','22222222-2222-4222-8222-222222222222','authenticated','authenticated','b@example.test','',now(),'{}','{}',now(),now());

insert into public.screenings (id,user_id,status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','draft'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','draft');

insert into storage.objects (bucket_id,name,owner_id)
values
  ('recordings','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.webm','11111111-1111-4111-8111-111111111111'),
  ('recordings','22222222-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source.webm','22222222-2222-4222-8222-222222222222');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select is(
  (select count(*) from public.screenings where user_id = '22222222-2222-4222-8222-222222222222'),
  0::bigint,
  'user A cannot read user B screening rows'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'recordings' and name like '22222222-2222-4222-8222-222222222222/%'),
  0::bigint,
  'user A cannot list or play user B recording objects'
);

select * from finish();
rollback;
