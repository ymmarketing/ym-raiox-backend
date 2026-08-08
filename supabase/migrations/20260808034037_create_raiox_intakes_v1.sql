create extension if not exists pgcrypto;

create table if not exists public.raiox_intakes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_product text not null default 'RAIO_X_ESTRATEGICO',
  source_system text not null,
  source_session_id text,
  client_ref text,
  packet_version text not null,
  questionnaire_version text not null,
  scoring_version text not null,
  report_version text not null,
  score_overall numeric,
  score_coverage_pct numeric not null,
  score_status text not null,
  route_signal text,
  human_validation_required boolean not null default true,
  packet jsonb not null,
  constraint raiox_score_status_check check (score_status in ('FINAL','DADOS_INSUFICIENTES')),
  constraint raiox_score_overall_check check (score_overall is null or (score_overall >= 0 and score_overall <= 100)),
  constraint raiox_score_coverage_check check (score_coverage_pct >= 0 and score_coverage_pct <= 100),
  constraint raiox_human_validation_check check (human_validation_required = true)
);

comment on table public.raiox_intakes is 'VOS_INTAKE_1.0 do Raio-X Estratégico. O packet JSONB é a fonte de verdade; colunas adicionais são somente índices operacionais derivados.';
comment on column public.raiox_intakes.packet is 'Packet canônico VOS_INTAKE_1.0 completo. Não duplicar interpretações deriváveis das respostas.';
comment on column public.raiox_intakes.route_signal is 'Permanece nulo enquanto a rota comercial depender de validação humana.';

create index if not exists raiox_intakes_created_at_idx on public.raiox_intakes (created_at desc);
create index if not exists raiox_intakes_source_session_idx on public.raiox_intakes (source_session_id);
create index if not exists raiox_intakes_client_ref_idx on public.raiox_intakes (client_ref);
create index if not exists raiox_intakes_score_status_idx on public.raiox_intakes (score_status);

alter table public.raiox_intakes enable row level security;
revoke all on table public.raiox_intakes from anon, authenticated;
