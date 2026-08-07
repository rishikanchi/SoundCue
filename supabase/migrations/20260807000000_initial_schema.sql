-- SoundCue's application schema, access controls, and private recording storage.
-- Screening writes are intentionally reserved for trusted server code using the
-- service role. Browser clients receive only the narrow privileges below.

create type public.screening_status as enum (
  'draft',
  'uploaded',
  'processing',
  'needs_rerecord',
  'completed',
  'failed'
);

create type public.risk_band as enum ('fewer', 'some', 'more');
create type public.analyzer_kind as enum ('dummy', 'validated');
create type public.finding_code as enum (
  'voice_steadiness',
  'pitch_variation',
  'breath_support'
);
create type public.finding_level as enum ('lower', 'moderate', 'higher');

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sound_cues_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  document_version text not null,
  consented_at timestamptz not null default now(),
  constraint consent_events_document_version_not_blank
    check (length(btrim(document_version)) between 1 and 100),
  constraint consent_events_user_document_version_key
    unique (user_id, document_version)
);

-- Keep the public wire shape compact while enforcing the model-owned finding
-- vocabulary at the database boundary.
create function public.is_valid_screening_findings(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if value is null
    or jsonb_typeof(value) <> 'array'
    or jsonb_array_length(value) <> 3
  then
    return false;
  end if;

  return not exists (
    select 1
    from jsonb_array_elements(value) as finding
    where jsonb_typeof(finding) <> 'object'
      or not (finding ? 'code')
      or not (finding ? 'level')
      or finding ->> 'code' not in (
        'voice_steadiness',
        'pitch_variation',
        'breath_support'
      )
      or finding ->> 'level' not in ('lower', 'moderate', 'higher')
  )
  and (
    select count(distinct finding ->> 'code') = 3
    from jsonb_array_elements(value) as finding
  );
end;
$$;

create table public.screenings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.screening_status not null default 'draft',

  recording_path text,
  recording_mime_type text,
  recording_size_bytes bigint,
  duration_seconds numeric(6, 3),

  feature_version text,
  features jsonb,
  quality jsonb,

  analyzer_kind public.analyzer_kind,
  analyzer_version text,
  score numeric(7, 6),
  band public.risk_band,
  findings jsonb,
  failure_code text,
  is_synthetic boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,

  -- Draft creation records the browser metadata before the object upload. The
  -- three metadata values therefore travel together, while recording_path may
  -- be added atomically when the upload is finalized.
  constraint screenings_recording_fields_consistent check (
    num_nonnulls(
      recording_mime_type,
      recording_size_bytes,
      duration_seconds
    ) in (0, 3)
    and (
      recording_path is null
      or num_nonnulls(
        recording_mime_type,
        recording_size_bytes,
        duration_seconds
      ) = 3
    )
  ),
  constraint screenings_recording_path_owned check (
    recording_path is null
    or recording_path like user_id::text || '/%'
  ),
  constraint screenings_recording_mime_type_allowed check (
    recording_mime_type is null
    or recording_mime_type ~* '^audio/(webm|ogg|mp4|mpeg|wav|x-wav|aac)(;.*)?$'
  ),
  constraint screenings_recording_size_allowed check (
    recording_size_bytes is null
    or recording_size_bytes between 1 and 10485760
  ),
  constraint screenings_duration_allowed check (
    duration_seconds is null
    or duration_seconds between 0.001 and 60
  ),
  constraint screenings_feature_version_not_blank check (
    feature_version is null or length(btrim(feature_version)) between 1 and 100
  ),
  constraint screenings_features_is_object check (
    features is null or jsonb_typeof(features) = 'object'
  ),
  constraint screenings_quality_is_object check (
    quality is null or jsonb_typeof(quality) = 'object'
  ),
  constraint screenings_analyzer_version_not_blank check (
    analyzer_version is null or length(btrim(analyzer_version)) between 1 and 100
  ),
  constraint screenings_score_range check (score is null or score between 0 and 1),
  constraint screenings_findings_valid check (
    findings is null or public.is_valid_screening_findings(findings)
  ),
  constraint screenings_failure_code_not_blank check (
    failure_code is null or length(btrim(failure_code)) between 1 and 100
  ),
  constraint screenings_completed_result_present check (
    status <> 'completed'
    or (
      analyzer_kind is not null
      and analyzer_version is not null
      and score is not null
      and band is not null
      and findings is not null
      and completed_at is not null
    )
  ),
  constraint screenings_synthetic_has_no_audio check (
    not is_synthetic or recording_path is null
  )
);

create index screenings_user_created_id_idx
  on public.screenings (user_id, created_at desc, id desc);

create index screenings_user_status_idx
  on public.screenings (user_id, status);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger screenings_set_updated_at
before update on public.screenings
for each row execute function public.set_updated_at();

-- Consent is append-only while an account exists. Deletes remain possible only
-- through the auth.users ON DELETE CASCADE used for account deletion.
create function public.prevent_consent_event_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'consent events are immutable' using errcode = '55000';
end;
$$;

create trigger consent_events_prevent_update
before update on public.consent_events
for each row execute function public.prevent_consent_event_update();

-- Every new auth user receives a preference row without copying their email or
-- other identity data into the application schema.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles when this migration is introduced to a project that
-- already has auth users. New users are handled by the trigger above.
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.consent_events enable row level security;
alter table public.consent_events force row level security;
alter table public.screenings enable row level security;
alter table public.screenings force row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "consent_events_select_own"
on public.consent_events
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "consent_events_insert_own"
on public.consent_events
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "screenings_select_own"
on public.screenings
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Supabase grants broad default table privileges to API roles. Replace those
-- defaults with column-level permissions appropriate for this application.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.consent_events from anon, authenticated;
revoke all on table public.screenings from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (sound_cues_enabled) on table public.profiles to authenticated;
grant select on table public.consent_events to authenticated;
grant insert (document_version) on table public.consent_events to authenticated;
grant select on table public.screenings to authenticated;

-- Trusted Route Handlers use the service role after authenticating the caller
-- and rechecking ownership. Grant it the lifecycle operations intentionally
-- withheld from browser clients.
grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.consent_events to service_role;
grant select, insert, update, delete on table public.screenings to service_role;

revoke all on function public.is_valid_screening_findings(jsonb) from public;
revoke all on function public.set_updated_at() from public;
revoke all on function public.prevent_consent_event_update() from public;
revoke all on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.is_valid_screening_findings(jsonb) to service_role;

-- Audio is retained privately. The bucket additionally rejects payloads over
-- 10 MiB and non-audio browser MIME types before an object is written.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'recordings',
  'recordings',
  false,
  10485760,
  array[
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/aac'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "recordings_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'recordings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "recordings_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'recordings'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2]
    ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and storage.filename(name) ~ '^source\.[a-z0-9]+$'
);

create policy "recordings_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'recordings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'recordings'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2]
    ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and storage.filename(name) ~ '^source\.[a-z0-9]+$'
);

create policy "recordings_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'recordings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
