begin;

alter table public.organizations
  add column if not exists city text check (city is null or char_length(city) between 1 and 120),
  add column if not exists contact_email text check (contact_email is null or char_length(contact_email) between 3 and 320);

commit;
