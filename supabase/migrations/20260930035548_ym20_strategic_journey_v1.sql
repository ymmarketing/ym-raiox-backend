-- Jornada consultiva interna vinculada a uma oportunidade; sem preço público.
create table public.ym_strategic_cases (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.crm_opportunities(id) on delete restrict,
  phase text not null default 'ENQUADRAMENTO'
    check (phase in ('ENQUADRAMENTO','IMERSAO','ANALISE','DEVOLUTIVA')),
  created_at timestamptz not null default now(),
  created_by text not null,
  updated_at timestamptz not null default now()
);
create table public.ym_strategic_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.ym_strategic_cases(id) on delete restrict,
  phase text not null check (phase in ('ENQUADRAMENTO','IMERSAO','ANALISE','DEVOLUTIVA')),
  meeting_at timestamptz,
  source_note text not null,
  conversation_note text not null,
  next_action text not null,
  assessment_id uuid references public.ym_cdd_assessments(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by text not null,
  check (length(trim(source_note))>=5),
  check (length(trim(conversation_note))>=10),
  check (length(trim(next_action))>=5)
);
create index ym_strategic_events_case_date on public.ym_strategic_events(case_id,created_at desc);
alter table public.ym_strategic_cases enable row level security;
alter table public.ym_strategic_events enable row level security;
revoke all on public.ym_strategic_cases,public.ym_strategic_events from public,anon,authenticated;
grant select,insert,update on public.ym_strategic_cases to service_role;
grant select,insert on public.ym_strategic_events to service_role;
comment on table public.ym_strategic_cases is 'Acompanhamento interno do Raio-X Estratégico; preço somente na proposta após reunião.';
