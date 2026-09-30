-- CDD consultivo: versões ligadas à oportunidade canônica, sem criar cliente operacional.
-- RLS fechada; leitura/escrita somente pela função interna autenticada com service role.
create table public.ym_cdd_assessments (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.crm_opportunities(id) on delete restrict,
  version integer not null check (version > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','VALIDATED')),
  reference_month date not null,
  inputs jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs) = 'object'),
  results jsonb not null default '{}'::jsonb check (jsonb_typeof(results) = 'object'),
  source_note text,
  assumptions_note text,
  created_by text not null,
  created_at timestamptz not null default now(),
  validated_by text,
  validated_at timestamptz,
  constraint ym_cdd_version_unique unique (opportunity_id, version),
  constraint ym_cdd_validation_actor check
    ((status = 'DRAFT' and validated_at is null and validated_by is null)
     or (status = 'VALIDATED' and validated_at is not null and nullif(trim(validated_by),'') is not null))
);
create index ym_cdd_assessments_opportunity_latest_idx
  on public.ym_cdd_assessments (opportunity_id, version desc);
alter table public.ym_cdd_assessments enable row level security;
revoke all on public.ym_cdd_assessments from public, anon, authenticated;
comment on table public.ym_cdd_assessments is
  'CDD consultivo versionado por oportunidade; dados e cenário separados, sem somar receita potencial, custo e investimento.';
