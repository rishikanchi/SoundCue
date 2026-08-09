begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(46);

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
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.screening_model_outputs'::regclass),
  'model outputs force row-level security'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.analysis_runs'::regclass),
  'analysis runs force row-level security'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.screening_rate_limits'::regclass),
  'rate limits force row-level security'
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
  exists(select 1 from storage.buckets where id = 'recordings' and not public and file_size_limit = 4194304),
  'recordings bucket is private and limited to 4 MiB'
);
select ok(
  exists(
    select 1 from storage.buckets
    where id = 'recordings'
      and allowed_mime_types = array[
        'audio/webm',
        'audio/ogg',
        'audio/mp4',
        'audio/wav'
      ]::text[]
  ),
  'recordings bucket accepts only the supported browser audio MIME types'
);
select ok(
  exists (
    select 1
    from pg_enum
    where enumtypid = 'public.analyzer_kind'::regtype
      and enumlabel = 'research'
  ),
  'research analyzer kind exists'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'screenings'
      and column_name = 'age_years' and data_type = 'smallint'
  ),
  'screenings store screening-level age'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'screenings'
      and column_name = 'observations' and data_type = 'jsonb'
  ),
  'screenings store reviewed categorical observations'
);
select ok(not has_table_privilege('authenticated', 'public.screening_model_outputs', 'select'), 'clients cannot read numerical model outputs');
select ok(not has_table_privilege('authenticated', 'public.analysis_runs', 'select'), 'clients cannot read analysis audit rows');
select ok(not has_table_privilege('authenticated', 'public.screening_rate_limits', 'select'), 'clients cannot read rate-limit state');
select ok(has_table_privilege('service_role', 'public.screening_model_outputs', 'select,insert,update,delete'), 'trusted server can manage model outputs');
select ok(has_table_privilege('service_role', 'public.analysis_runs', 'select,insert,update,delete'), 'trusted server can manage analysis runs');
select ok(has_table_privilege('service_role', 'public.screening_rate_limits', 'select,insert,update,delete'), 'trusted server can manage rate limits');
select ok(
  not has_function_privilege('authenticated', 'public.consume_screening_rate_limit(uuid,text,integer,integer)', 'execute'),
  'clients cannot execute the rate-limit helper'
);
select ok(
  has_function_privilege('service_role', 'public.consume_screening_rate_limit(uuid,text,integer,integer)', 'execute'),
  'trusted server can execute the rate-limit helper'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_screening_for_analysis(uuid,uuid,integer)', 'execute'),
  'clients cannot execute the analysis claim helper'
);
select ok(
  has_function_privilege('service_role', 'public.claim_screening_for_analysis(uuid,uuid,integer)', 'execute'),
  'trusted server can execute the analysis claim helper'
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
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','draft'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','processing'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111','processing'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111','uploaded');

insert into public.screening_model_outputs (
  screening_id,
  ensemble_score,
  component_scores,
  technical_metrics,
  inference_duration_ms
) values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  0.52000000,
  '[
    {"code":"ast_layer_3","score":0.6,"band":"some"},
    {"code":"ast_layer_6","score":0.5,"band":"some"},
    {"code":"wavlm_layer_1","score":0.4,"band":"fewer"}
  ]'::jsonb,
  '{
    "pitchSemitoneIqr":1.8,
    "loudnessVariationDb":2.4,
    "voicedCoverage":0.92,
    "clippingRatio":0,
    "durationSeconds":6.1
  }'::jsonb,
  1200
);

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

reset role;
set local role service_role;

select is(
  (select allowed from public.consume_screening_rate_limit(
    '11111111-1111-4111-8111-111111111111',
    'screening_create',
    1,
    3600
  )),
  true,
  'first request in a database-backed rate window is allowed'
);
select is(
  (select allowed from public.consume_screening_rate_limit(
    '11111111-1111-4111-8111-111111111111',
    'screening_create',
    1,
    3600
  )),
  false,
  'the atomic database-backed limit denies excess requests'
);
select is(
  (select count(*) from public.claim_screening_for_analysis(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '11111111-1111-4111-8111-111111111111',
    120
  )),
  1::bigint,
  'an uploaded screening can be claimed atomically'
);
select is(
  (select count(*) from public.claim_screening_for_analysis(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '11111111-1111-4111-8111-111111111111',
    120
  )),
  0::bigint,
  'a current processing lease cannot be claimed twice'
);

reset role;

select lives_ok(
  $$
    update public.screenings set
      status = 'completed',
      analyzer_kind = 'research',
      analyzer_version = 'three-component-v1',
      score = null,
      band = 'some',
      findings = '[
        {"code":"voice_steadiness","level":"moderate"},
        {"code":"pitch_variation","level":"lower"},
        {"code":"breath_support","level":"higher"}
      ]'::jsonb,
      age_years = 64,
      preprocessing_version = 'research-audio-v1',
      band_policy_version = 'development-tertiles-v1',
      model_artifact_sha256 = repeat('a', 64),
      observations = '[
        {"code":"model_agreement","level":"middle"},
        {"code":"pitch_steadiness","level":"higher"},
        {"code":"loudness_stability","level":"middle"},
        {"code":"sound_continuity","level":"higher"}
      ]'::jsonb,
      completed_at = now()
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  $$,
  'research completion succeeds when protected output exists'
);
select throws_ok(
  $$
    update public.screenings set
      status = 'completed',
      analyzer_kind = 'research',
      analyzer_version = 'three-component-v1',
      score = null,
      band = 'some',
      findings = '[
        {"code":"voice_steadiness","level":"moderate"},
        {"code":"pitch_variation","level":"lower"},
        {"code":"breath_support","level":"higher"}
      ]'::jsonb,
      age_years = 64,
      preprocessing_version = 'research-audio-v1',
      band_policy_version = 'development-tertiles-v1',
      model_artifact_sha256 = repeat('a', 64),
      observations = '[
        {"code":"model_agreement","level":"middle"},
        {"code":"pitch_steadiness","level":"higher"},
        {"code":"loudness_stability","level":"middle"},
        {"code":"sound_continuity","level":"higher"}
      ]'::jsonb,
      completed_at = now()
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  $$,
  '23514',
  'completed research screening requires model output',
  'research completion fails without protected model output'
);
select throws_ok(
  $$
    insert into public.screenings (user_id, status, age_years)
    values ('11111111-1111-4111-8111-111111111111', 'draft', 17)
  $$,
  '23514',
  null,
  'screening age must remain within the development range'
);
select throws_ok(
  $$
    insert into public.screenings (
      user_id, status, age_years, recording_mime_type,
      recording_size_bytes, duration_seconds
    ) values (
      '11111111-1111-4111-8111-111111111111', 'draft', 64,
      'audio/webm', 1024, 4.99
    )
  $$,
  '23514',
  null,
  'research recordings require at least five seconds'
);
select throws_ok(
  $$
    insert into public.screenings (
      user_id, status, age_years, recording_mime_type,
      recording_size_bytes, duration_seconds
    ) values (
      '11111111-1111-4111-8111-111111111111', 'draft', 64,
      'audio/webm', 4194305, 6
    )
  $$,
  '23514',
  null,
  'research recordings cannot exceed four MiB'
);
select throws_ok(
  $$
    insert into public.screenings (
      user_id, status, age_years, recording_mime_type,
      recording_size_bytes, duration_seconds
    ) values (
      '11111111-1111-4111-8111-111111111111', 'draft', 64,
      'audio/mpeg', 1024, 6
    )
  $$,
  '23514',
  null,
  'research recordings use only the supported browser audio MIME types'
);

set local role service_role;
select is(
  (select retry_after_seconds > 0 from public.consume_screening_rate_limit(
    '11111111-1111-4111-8111-111111111111',
    'screening_create',
    1,
    3600
  )),
  true,
  'denied requests receive a positive retry interval'
);
reset role;

select lives_ok(
  $$delete from public.screenings where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$,
  'completed research screenings remain deletable'
);
select is(
  (select count(*) from public.screening_model_outputs
    where screening_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  0::bigint,
  'deleting a screening cascades its private model output'
);

select * from finish();
rollback;
