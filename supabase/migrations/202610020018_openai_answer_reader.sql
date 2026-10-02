begin;

-- OpenAI does not return a calibrated probability or bubble-fill percentages.
-- Preserve historical OpenCV confidence values while allowing honest nulls.
alter table public.detected_answers
  alter column confidence drop not null,
  add column if not exists reader_source text not null default 'opencv'
    check (reader_source in ('opencv', 'openai'));

alter table public.processing_files
  add column if not exists reader_source text
    check (reader_source is null or reader_source in ('opencv', 'openai'));

commit;
