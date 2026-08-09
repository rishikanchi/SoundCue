-- Research analyzer metadata, protected model outputs, and distributed guards.
-- Numerical research scores never live on the browser-readable screenings row.

alter type public.analyzer_kind add value if not exists 'research' before 'validated';

create function public.is_valid_screening_observations(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if value is null
    or jsonb_typeof(value) <> 'array'
    or jsonb_array_length(value) <> 4
  then
    return false;
  end if;

  return not exists (
    select 1
    from jsonb_array_elements(value) as observation
    where jsonb_typeof(observation) <> 'object'
      or not (observation ? 'code')
      or not (observation ? 'level')
      or observation - 'code' - 'level' <> '{}'::jsonb
      or observation ->> 'code' not in (
        'model_agreement',
        'pitch_steadiness',
        'loudness_stability',
        'sound_continuity'
      )
      or observation ->> 'level' not in ('lower', 'middle', 'higher')
  )
  and (
    select count(distinct observation ->> 'code') = 4
    from jsonb_array_elements(value) as observation
  );
end;
$$;

create function public.is_valid_model_component_scores(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  component jsonb;
  component_score numeric;
begin
  if value is null
    or jsonb_typeof(value) <> 'array'
    or jsonb_array_length(value) <> 3
  then
    return false;
  end if;

  for component in select item from jsonb_array_elements(value) as item loop
    if jsonb_typeof(component) <> 'object'
      or not (component ? 'code')
      or not (component ? 'score')
      or not (component ? 'band')
      or component - 'code' - 'score' - 'band' <> '{}'::jsonb
      or component ->> 'code' not in ('ast_layer_3', 'ast_layer_6', 'wavlm_layer_1')
      or component ->> 'band' not in ('fewer', 'some', 'more')
      or jsonb_typeof(component -> 'score') <> 'number'
    then
      return false;
    end if;

    component_score := (component ->> 'score')::numeric;
    if component_score < 0 or component_score > 1 then
      return false;
    end if;
  end loop;

  return (
    select count(distinct item ->> 'code') = 3
    from jsonb_array_elements(value) as item
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return false;
end;
$$;

create function public.is_valid_research_technical_metrics(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  pitch_iqr numeric;
  loudness_variation numeric;
  voiced_coverage numeric;
  clipping_ratio numeric;
  duration_seconds numeric;
begin
  if value is null
    or jsonb_typeof(value) <> 'object'
    or not (value ?& array[
      'pitchSemitoneIqr',
      'loudnessVariationDb',
      'voicedCoverage',
      'clippingRatio',
      'durationSeconds'
    ])
    or value
      - 'pitchSemitoneIqr'
      - 'loudnessVariationDb'
      - 'voicedCoverage'
      - 'clippingRatio'
      - 'durationSeconds' <> '{}'::jsonb
    or jsonb_typeof(value -> 'voicedCoverage') <> 'number'
    or jsonb_typeof(value -> 'clippingRatio') <> 'number'
    or jsonb_typeof(value -> 'durationSeconds') <> 'number'
    or jsonb_typeof(value -> 'pitchSemitoneIqr') not in ('number', 'null')
    or jsonb_typeof(value -> 'loudnessVariationDb') not in ('number', 'null')
  then
    return false;
  end if;

  voiced_coverage := (value ->> 'voicedCoverage')::numeric;
  clipping_ratio := (value ->> 'clippingRatio')::numeric;
  duration_seconds := (value ->> 'durationSeconds')::numeric;
  if voiced_coverage < 0 or voiced_coverage > 1
    or clipping_ratio < 0 or clipping_ratio > 1
    or duration_seconds < 5 or duration_seconds > 7.5
  then
    return false;
  end if;

  if jsonb_typeof(value -> 'pitchSemitoneIqr') = 'number' then
    pitch_iqr := (value ->> 'pitchSemitoneIqr')::numeric;
    if pitch_iqr < 0 then return false; end if;
  end if;

  if jsonb_typeof(value -> 'loudnessVariationDb') = 'number' then
    loudness_variation := (value ->> 'loudnessVariationDb')::numeric;
    if loudness_variation < 0 then return false; end if;
  end if;

  return true;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return false;
end;
$$;

alter table public.screenings
  add column age_years smallint,
  add column preprocessing_version text,
  add column band_policy_version text,
  add column model_artifact_sha256 text,
  add column observations jsonb;

alter table public.screenings
  add constraint screenings_age_years_allowed
    check (age_years is null or age_years between 18 and 85),
  add constraint screenings_preprocessing_version_not_blank
    check (
      preprocessing_version is null
      or length(btrim(preprocessing_version)) between 1 and 100
    ),
  add constraint screenings_band_policy_version_not_blank
    check (
      band_policy_version is null
      or length(btrim(band_policy_version)) between 1 and 100
    ),
  add constraint screenings_model_artifact_sha256_valid
    check (
      model_artifact_sha256 is null
      or model_artifact_sha256 ~ '^[0-9a-f]{64}$'
    ),
  add constraint screenings_observations_valid
    check (
      observations is null
      or public.is_valid_screening_observations(observations)
    );

-- Legacy completed rows keep their original score requirement. Research scores
-- are withheld from screenings and require versioned categorical observations.
alter table public.screenings
  drop constraint screenings_completed_result_present;

alter table public.screenings
  add constraint screenings_completed_result_present check (
    status <> 'completed'
    or (
      analyzer_kind is not null
      and analyzer_version is not null
      and band is not null
      and findings is not null
      and completed_at is not null
      and (
        (analyzer_kind::text = 'research' and score is null)
        or (analyzer_kind::text <> 'research' and score is not null)
      )
      and (
        analyzer_kind::text <> 'research'
        or (
          age_years is not null
          and preprocessing_version is not null
          and band_policy_version is not null
          and model_artifact_sha256 is not null
          and observations is not null
        )
      )
    )
  );

create table public.screening_model_outputs (
  screening_id uuid primary key
    references public.screenings (id) on delete cascade,
  ensemble_score numeric(9, 8) not null,
  component_scores jsonb not null,
  technical_metrics jsonb not null,
  inference_duration_ms integer not null,
  created_at timestamptz not null default now(),
  constraint screening_model_outputs_ensemble_score_range
    check (ensemble_score between 0 and 1),
  constraint screening_model_outputs_components_valid
    check (public.is_valid_model_component_scores(component_scores)),
  constraint screening_model_outputs_metrics_valid
    check (public.is_valid_research_technical_metrics(technical_metrics)),
  constraint screening_model_outputs_duration_allowed
    check (inference_duration_ms between 0 and 120000)
);

create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  screening_id uuid not null
    references public.screenings (id) on delete cascade,
  request_id uuid not null unique,
  status text not null,
  analyzer_version text,
  duration_ms integer,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint analysis_runs_status_allowed
    check (status in ('started', 'completed', 'failed')),
  constraint analysis_runs_analyzer_version_not_blank
    check (
      analyzer_version is null
      or length(btrim(analyzer_version)) between 1 and 100
    ),
  constraint analysis_runs_duration_allowed
    check (duration_ms is null or duration_ms between 0 and 120000),
  constraint analysis_runs_error_code_not_blank
    check (
      error_code is null
      or length(btrim(error_code)) between 1 and 100
    ),
  constraint analysis_runs_lifecycle_consistent check (
    (status = 'started'
      and duration_ms is null
      and error_code is null
      and completed_at is null)
    or (status = 'completed'
      and analyzer_version is not null
      and duration_ms is not null
      and error_code is null
      and completed_at is not null)
    or (status = 'failed'
      and duration_ms is not null
      and error_code is not null
      and completed_at is not null)
  )
);

create index analysis_runs_screening_created_idx
  on public.analysis_runs (screening_id, created_at desc, id desc);

create table public.screening_rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, scope),
  constraint screening_rate_limits_scope_allowed
    check (scope in ('screening_create', 'screening_analyze')),
  constraint screening_rate_limits_count_positive
    check (request_count > 0)
);

create function public.consume_screening_rate_limit(
  p_user_id uuid,
  p_scope text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_window_started_at timestamptz;
begin
  if p_user_id is null
    or p_scope not in ('screening_create', 'screening_analyze')
    or p_limit < 1 or p_limit > 1000
    or p_window_seconds < 1 or p_window_seconds > 86400
  then
    raise exception 'invalid rate-limit arguments' using errcode = '22023';
  end if;

  insert into public.screening_rate_limits as rate_limit (
    user_id,
    scope,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_user_id,
    p_scope,
    v_now,
    1,
    v_now
  )
  on conflict (user_id, scope) do update set
    window_started_at = case
      when rate_limit.window_started_at
        + make_interval(secs => p_window_seconds) <= v_now
      then v_now
      else rate_limit.window_started_at
    end,
    request_count = case
      when rate_limit.window_started_at
        + make_interval(secs => p_window_seconds) <= v_now
      then 1
      else least(rate_limit.request_count + 1, p_limit + 1)
    end,
    updated_at = v_now
  returning request_count, window_started_at
  into v_count, v_window_started_at;

  allowed := v_count <= p_limit;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (
        v_window_started_at
          + make_interval(secs => p_window_seconds)
          - v_now
      )))::integer
    )
  end;
  return next;
end;
$$;

create function public.claim_screening_for_analysis(
  p_screening_id uuid,
  p_user_id uuid,
  p_stale_after_seconds integer default 120
)
returns setof public.screenings
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_screening_id is null
    or p_user_id is null
    or p_stale_after_seconds < 30
    or p_stale_after_seconds > 600
  then
    raise exception 'invalid analysis claim arguments' using errcode = '22023';
  end if;

  return query
  update public.screenings as screening
  set status = 'processing', failure_code = null
  where screening.id = p_screening_id
    and screening.user_id = p_user_id
    and (
      screening.status in ('uploaded', 'failed')
      or (
        screening.status = 'processing'
        and screening.updated_at
          < clock_timestamp() - make_interval(secs => p_stale_after_seconds)
      )
    )
  returning screening.*;
end;
$$;

create function public.require_research_model_output()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed'
    and new.analyzer_kind::text = 'research'
    and not exists (
      select 1
      from public.screening_model_outputs as model_output
      where model_output.screening_id = new.id
    )
  then
    raise exception 'completed research screening requires model output'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger screenings_require_research_model_output
before insert or update of status, analyzer_kind on public.screenings
for each row execute function public.require_research_model_output();

alter table public.screening_model_outputs enable row level security;
alter table public.screening_model_outputs force row level security;
alter table public.analysis_runs enable row level security;
alter table public.analysis_runs force row level security;
alter table public.screening_rate_limits enable row level security;
alter table public.screening_rate_limits force row level security;

-- No browser policies are created for these server-only tables. Explicit
-- revocation also protects them if platform default grants change.
revoke all on table public.screening_model_outputs from public, anon, authenticated;
revoke all on table public.analysis_runs from public, anon, authenticated;
revoke all on table public.screening_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.screening_model_outputs to service_role;
grant select, insert, update, delete on table public.analysis_runs to service_role;
grant select, insert, update, delete on table public.screening_rate_limits to service_role;

revoke all on function public.is_valid_screening_observations(jsonb)
  from public, anon, authenticated;
revoke all on function public.is_valid_model_component_scores(jsonb)
  from public, anon, authenticated;
revoke all on function public.is_valid_research_technical_metrics(jsonb)
  from public, anon, authenticated;
revoke all on function public.consume_screening_rate_limit(uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.claim_screening_for_analysis(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.require_research_model_output()
  from public, anon, authenticated;

grant execute on function public.is_valid_screening_observations(jsonb) to service_role;
grant execute on function public.is_valid_model_component_scores(jsonb) to service_role;
grant execute on function public.is_valid_research_technical_metrics(jsonb) to service_role;
grant execute on function public.consume_screening_rate_limit(uuid, text, integer, integer)
  to service_role;
grant execute on function public.claim_screening_for_analysis(uuid, uuid, integer)
  to service_role;

-- The browser and database now agree on the public research upload limit.
update storage.buckets
set file_size_limit = 4194304
where id = 'recordings';
