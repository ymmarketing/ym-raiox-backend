create table if not exists public.vos_internal_access (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'APLICADOR',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint vos_internal_access_email_lower_check check (email = lower(email)),
  constraint vos_internal_access_role_check check (role in ('ADMIN','APLICADOR','LEITURA'))
);

create table if not exists public.vos_access_audit (
  id bigint generated always as identity primary key,
  email text,
  role text,
  event text not null,
  source text not null default 'motor_web',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.vos_touch_access_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_vos_internal_access_touch on public.vos_internal_access;
create trigger trg_vos_internal_access_touch
before update on public.vos_internal_access
for each row execute function public.vos_touch_access_updated_at();

alter table public.vos_internal_access enable row level security;
alter table public.vos_access_audit enable row level security;
revoke all on table public.vos_internal_access from anon, authenticated;
revoke all on table public.vos_access_audit from anon, authenticated;
revoke all on function public.vos_touch_access_updated_at() from public;
alter function public.vos_touch_access_updated_at() owner to postgres;
