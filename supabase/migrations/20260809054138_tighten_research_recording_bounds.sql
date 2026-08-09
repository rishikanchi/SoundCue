-- Keep the hosted storage policy and research screening rows aligned with the
-- browser and inference-service recording contract.

alter table public.screenings
  add constraint screenings_research_recording_bounds check (
    age_years is null
    or (
      (recording_size_bytes is null or recording_size_bytes between 1 and 4194304)
      and (duration_seconds is null or duration_seconds between 5 and 7.5)
      and (
        recording_mime_type is null
        or (
          length(recording_mime_type) <= 128
          and recording_mime_type !~ '[\r\n]'
          and recording_mime_type ~* '^audio/(webm|ogg|mp4|wav)(;.*)?$'
        )
      )
    )
  );

update storage.buckets
set
  file_size_limit = 4194304,
  allowed_mime_types = array[
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/wav'
  ]::text[]
where id = 'recordings';
