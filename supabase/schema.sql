create table if not exists public.asana_tokens (
  everhour_user_id bigint primary key,
  asana_user_gid text not null,
  asana_email text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_asana_tokens_updated_at on public.asana_tokens;
create trigger trg_asana_tokens_updated_at
before update on public.asana_tokens
for each row
execute function public.touch_updated_at();

alter table public.asana_tokens enable row level security;

drop policy if exists "service_role_full_access" on public.asana_tokens;
create policy "service_role_full_access"
on public.asana_tokens
for all
to service_role
using (true)
with check (true);
