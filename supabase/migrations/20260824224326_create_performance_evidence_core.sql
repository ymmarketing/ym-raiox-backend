-- CENTRAL YM · Performance e Evidências
-- Estrutura aditiva e retrocompatível. O Reportei permanece desativado nesta etapa.

alter table public.central_ym_content_items
  add column if not exists content_objective text not null default '',
  add column if not exists prompt_context jsonb not null default '{}'::jsonb,
  add column if not exists prompt_generated_at timestamptz;

create table if not exists public.client_performance_kpis (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.crm_clients(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  category text not null default 'NEGOCIO'
    check (category in ('NEGOCIO','COMERCIAL','MARKETING','CONTEUDO','SITE','REDES_SOCIAIS','ATENDIMENTO','FINANCEIRO','OPERACAO','OUTRO')),
  unit text not null default 'NUMERO'
    check (unit in ('NUMERO','MOEDA','PERCENTUAL','TEMPO_MINUTOS','QUANTIDADE','NOTA','BOOLEANO','INDICE')),
  direction text not null default 'MAIOR_MELHOR'
    check (direction in ('MAIOR_MELHOR','MENOR_MELHOR','FAIXA_IDEAL')),
  periodicity text not null default 'MENSAL'
    check (periodicity in ('DIARIO','SEMANAL','MENSAL','TRIMESTRAL','EVENTUAL')),
  aggregation text not null default 'ULTIMO_VALOR'
    check (aggregation in ('ULTIMO_VALOR','SOMA','MEDIA','MAXIMO','MINIMO')),
  baseline_value numeric,
  baseline_period_start date,
  baseline_period_end date,
  target_value numeric,
  target_period_start date,
  target_period_end date,
  ideal_min_value numeric,
  ideal_max_value numeric,
  source_type text not null default 'MANUAL'
    check (source_type in ('MANUAL','CRM','SUPABASE','REPORTEI','OUTRO')),
  external_metric_key text,
  visible_to_client boolean not null default true,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  unique (client_id, code),
  check (baseline_period_end is null or baseline_period_start is null or baseline_period_end >= baseline_period_start),
  check (target_period_end is null or target_period_start is null or target_period_end >= target_period_start),
  check (ideal_max_value is null or ideal_min_value is null or ideal_max_value >= ideal_min_value)
);

create table if not exists public.client_performance_measurements (
  id uuid primary key default gen_random_uuid(),
  kpi_id uuid not null references public.client_performance_kpis(id) on delete cascade,
  client_id uuid not null references public.crm_clients(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  value numeric not null,
  source_type text not null default 'MANUAL'
    check (source_type in ('MANUAL','CRM','SUPABASE','REPORTEI','OUTRO')),
  source_ref text,
  evidence_url text,
  external_record_key text,
  is_baseline boolean not null default false,
  validation_status text not null default 'VALIDADO'
    check (validation_status in ('PRELIMINAR','VALIDADO','DESCARTADO')),
  dimensions jsonb not null default '{}'::jsonb,
  notes text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  check (period_end >= period_start)
);

create unique index if not exists client_performance_measurements_external_uk
  on public.client_performance_measurements (kpi_id, source_type, external_record_key)
  where external_record_key is not null;
create index if not exists client_performance_measurements_kpi_period_idx
  on public.client_performance_measurements (kpi_id, period_start desc);
create index if not exists client_performance_measurements_client_period_idx
  on public.client_performance_measurements (client_id, period_start desc);

create table if not exists public.client_performance_actions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.crm_clients(id) on delete cascade,
  content_id uuid references public.central_ym_content_items(id) on delete set null,
  client_service_id uuid references public.crm_client_services(id) on delete set null,
  action_type text not null default 'OUTRO'
    check (action_type in ('CONTEUDO','BIO_PERFIL','HOME_SITE','SITE','CTA','FUNIL','CRM','AUTOMACAO','OFERTA','CAMPANHA','MIDIA_PAGA','TREINAMENTO','PROCESSO','ATENDIMENTO','OUTRO')),
  title text not null,
  description text,
  hypothesis text,
  action_date date not null,
  status text not null default 'IMPLEMENTADA'
    check (status in ('PLANEJADA','EM_EXECUCAO','IMPLEMENTADA','PAUSADA','CANCELADA')),
  expected_lag_days integer not null default 0 check (expected_lag_days >= 0),
  evidence_url text,
  source_ref text,
  visible_to_client boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);
create index if not exists client_performance_actions_client_date_idx
  on public.client_performance_actions (client_id, action_date desc);

create table if not exists public.client_performance_action_kpis (
  action_id uuid not null references public.client_performance_actions(id) on delete cascade,
  kpi_id uuid not null references public.client_performance_kpis(id) on delete cascade,
  expected_effect text not null default 'AUMENTAR'
    check (expected_effect in ('AUMENTAR','REDUZIR','ESTABILIZAR','OBSERVAR')),
  attribution_window_days integer not null default 30 check (attribution_window_days > 0),
  notes text,
  primary key (action_id, kpi_id)
);

create table if not exists public.central_ym_content_performance (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.central_ym_content_items(id) on delete cascade,
  client_id uuid references public.crm_clients(id) on delete cascade,
  metric_code text not null,
  metric_label text not null,
  unit text not null default 'NUMERO'
    check (unit in ('NUMERO','MOEDA','PERCENTUAL','TEMPO_MINUTOS','QUANTIDADE','NOTA','INDICE')),
  direction text not null default 'MAIOR_MELHOR'
    check (direction in ('MAIOR_MELHOR','MENOR_MELHOR','FAIXA_IDEAL')),
  baseline_value numeric,
  target_value numeric not null,
  result_value numeric,
  measurement_start date,
  measurement_end date,
  source_type text not null default 'MANUAL'
    check (source_type in ('MANUAL','CRM','SUPABASE','REPORTEI','OUTRO')),
  external_metric_key text,
  source_ref text,
  visible_to_client boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  unique (content_id, metric_code),
  check (measurement_end is null or measurement_start is null or measurement_end >= measurement_start)
);
create index if not exists central_ym_content_performance_client_idx
  on public.central_ym_content_performance (client_id, measurement_start desc);

create table if not exists public.performance_data_sources (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.crm_clients(id) on delete cascade,
  provider text not null check (provider in ('MANUAL','CRM','SUPABASE','REPORTEI','OUTRO')),
  name text not null,
  external_project_id text,
  status text not null default 'PLANEJADO'
    check (status in ('PLANEJADO','AGUARDANDO_CONEXAO','ATIVO','ERRO','PAUSADO')),
  config jsonb not null default '{}'::jsonb,
  credentials_secret_ref text,
  last_synced_at timestamptz,
  next_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  unique (client_id, provider, name),
  check (credentials_secret_ref is null or credentials_secret_ref !~* '(bearer|token=|apikey=|secret=)')
);

create table if not exists public.performance_metric_mappings (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.performance_data_sources(id) on delete cascade,
  kpi_id uuid not null references public.client_performance_kpis(id) on delete cascade,
  external_metric_key text not null,
  transformation text not null default 'IDENTIDADE'
    check (transformation in ('IDENTIDADE','SOMA','MEDIA','PERCENTUAL','DELTA','CUSTOM')),
  transformation_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, kpi_id, external_metric_key)
);

create table if not exists public.performance_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.performance_data_sources(id) on delete cascade,
  status text not null check (status in ('INICIADO','SUCESSO','PARCIAL','ERRO')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_read integer not null default 0 check (records_read >= 0),
  records_written integer not null default 0 check (records_written >= 0),
  cursor_from text,
  cursor_to text,
  error_summary text,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.client_performance_kpis enable row level security;
alter table public.client_performance_measurements enable row level security;
alter table public.client_performance_actions enable row level security;
alter table public.client_performance_action_kpis enable row level security;
alter table public.central_ym_content_performance enable row level security;
alter table public.performance_data_sources enable row level security;
alter table public.performance_metric_mappings enable row level security;
alter table public.performance_sync_runs enable row level security;

revoke all on table public.client_performance_kpis from anon, authenticated;
revoke all on table public.client_performance_measurements from anon, authenticated;
revoke all on table public.client_performance_actions from anon, authenticated;
revoke all on table public.client_performance_action_kpis from anon, authenticated;
revoke all on table public.central_ym_content_performance from anon, authenticated;
revoke all on table public.performance_data_sources from anon, authenticated;
revoke all on table public.performance_metric_mappings from anon, authenticated;
revoke all on table public.performance_sync_runs from anon, authenticated;

grant all on table public.client_performance_kpis to service_role;
grant all on table public.client_performance_measurements to service_role;
grant all on table public.client_performance_actions to service_role;
grant all on table public.client_performance_action_kpis to service_role;
grant all on table public.central_ym_content_performance to service_role;
grant all on table public.performance_data_sources to service_role;
grant all on table public.performance_metric_mappings to service_role;
grant all on table public.performance_sync_runs to service_role;

comment on table public.client_performance_kpis is 'Definições de KPIs, baseline e metas por cliente.';
comment on table public.client_performance_measurements is 'Série histórica validável de resultados por KPI.';
comment on table public.client_performance_actions is 'Linha do tempo de ações implantadas no cliente.';
comment on table public.client_performance_action_kpis is 'Hipóteses de impacto entre ações e KPIs; não comprova causalidade.';
comment on table public.central_ym_content_performance is 'Metas e resultados mensuráveis de cada conteúdo.';
comment on table public.performance_data_sources is 'Conectores planejados/ativos, incluindo preparação para Reportei.';
comment on column public.performance_data_sources.credentials_secret_ref is 'Referência ao segredo no cofre/ambiente; nunca armazena o token.';
