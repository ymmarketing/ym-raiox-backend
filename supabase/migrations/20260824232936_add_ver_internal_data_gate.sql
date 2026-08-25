-- MOTOR VOS · Gate de dados reais na etapa VER
-- Dados públicos podem complementar o diagnóstico. Quando o cliente recusa o
-- compartilhamento, o caso permanece em leitura pública limitada e não libera
-- conclusão causal, aprovação do VER nem ORDENAR.

create table if not exists public.vos_ver_data_profiles (
  case_id uuid primary key references public.vos_cases(id) on delete cascade,
  sharing_status text not null default 'PENDING'
    check (sharing_status in ('PENDING','SHARED','DECLINED')),
  analysis_mode text not null default 'BLOCKED'
    check (analysis_mode in ('BLOCKED','INTERNAL_COMPLETE','PUBLIC_LIMITED')),
  coverage_status text not null default 'NOT_EVALUATED'
    check (coverage_status in ('NOT_EVALUATED','INSUFFICIENT','SUFFICIENT')),
  portfolio_declared_complete boolean not null default false,
  data_quality_confirmed boolean not null default false,
  decline_reason text,
  limitations_acknowledged boolean not null default false,
  coverage_notes text,
  decision_by text,
  decision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sharing_status <> 'DECLINED' or (
    analysis_mode = 'PUBLIC_LIMITED'
    and limitations_acknowledged = true
    and nullif(btrim(decline_reason),'') is not null
  )),
  check (sharing_status <> 'SHARED' or analysis_mode = 'INTERNAL_COMPLETE')
);

create table if not exists public.vos_business_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.vos_cases(id) on delete cascade,
  metric_code text not null
    check (metric_code in ('GROSS_REVENUE','SALES_VOLUME','AVERAGE_TICKET','QUALIFIED_LEADS','CONVERSION_RATE','REPEAT_PURCHASE_RATE','GROSS_MARGIN','CANCELLATION_RATE','OTHER')),
  metric_name text not null,
  unit text not null
    check (unit in ('MOEDA','NUMERO','PERCENTUAL','QUANTIDADE','INDICE')),
  period_start date not null,
  period_end date not null,
  value numeric not null,
  source_type text not null
    check (source_type in ('CLIENT_SELF_REPORT','DOCUMENT','MEASUREMENT','CRM','SYSTEM')),
  source_ref text not null,
  evidence_url text,
  validation_status text not null default 'VALIDADO'
    check (validation_status in ('PRELIMINAR','VALIDADO','DESCARTADO')),
  notes text,
  created_by text not null,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (case_id, metric_code, period_start, period_end, source_ref)
);

create table if not exists public.vos_portfolio_performance (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.vos_cases(id) on delete cascade,
  portfolio_item text not null,
  portfolio_category text,
  period_start date not null,
  period_end date not null,
  units_sold numeric not null check (units_sold >= 0),
  gross_revenue numeric not null check (gross_revenue >= 0),
  source_type text not null
    check (source_type in ('CLIENT_SELF_REPORT','DOCUMENT','MEASUREMENT','CRM','SYSTEM')),
  source_ref text not null,
  evidence_url text,
  validation_status text not null default 'VALIDADO'
    check (validation_status in ('PRELIMINAR','VALIDADO','DESCARTADO')),
  notes text,
  created_by text not null,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (case_id, portfolio_item, period_start, period_end, source_ref)
);

create index if not exists vos_business_metric_case_period_idx
  on public.vos_business_metric_snapshots(case_id, period_end desc);
create index if not exists vos_portfolio_performance_case_period_idx
  on public.vos_portfolio_performance(case_id, period_end desc);

alter table public.client_performance_kpis
  add column if not exists source_vos_case_id uuid references public.vos_cases(id) on delete set null;
alter table public.client_performance_measurements
  add column if not exists source_vos_case_id uuid references public.vos_cases(id) on delete set null;
alter table public.client_performance_actions
  add column if not exists source_vos_case_id uuid references public.vos_cases(id) on delete set null;
create index if not exists client_performance_kpis_vos_case_idx on public.client_performance_kpis(source_vos_case_id);
create index if not exists client_performance_measurements_vos_case_idx on public.client_performance_measurements(source_vos_case_id);
create index if not exists client_performance_actions_vos_case_idx on public.client_performance_actions(source_vos_case_id);

create trigger trg_vos_ver_data_profiles_touch before update on public.vos_ver_data_profiles
for each row execute function public.vos_touch_updated_at();
create trigger trg_vos_business_metric_touch before update on public.vos_business_metric_snapshots
for each row execute function public.vos_touch_updated_at();
create trigger trg_vos_portfolio_performance_touch before update on public.vos_portfolio_performance
for each row execute function public.vos_touch_updated_at();

insert into public.vos_ver_data_profiles(case_id)
select id from public.vos_cases
on conflict (case_id) do nothing;

create or replace function public.vos_initialize_ver_data_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.vos_ver_data_profiles(case_id) values (new.id)
  on conflict (case_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_vos_initialize_ver_data_profile on public.vos_cases;
create trigger trg_vos_initialize_ver_data_profile
after insert on public.vos_cases
for each row execute function public.vos_initialize_ver_data_profile();

create or replace function public.vos_ver_data_readiness(p_case_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with profile as (
    select * from public.vos_ver_data_profiles where case_id = p_case_id
  ), metric_counts as (
    select
      count(*) filter (where metric_code='GROSS_REVENUE' and validation_status='VALIDADO') as revenue_count,
      count(*) filter (where metric_code='SALES_VOLUME' and validation_status='VALIDADO') as sales_count,
      count(*) filter (where validation_status='VALIDADO') as validated_metric_count
    from public.vos_business_metric_snapshots where case_id = p_case_id
  ), portfolio_counts as (
    select
      count(*) filter (where validation_status='VALIDADO') as validated_portfolio_count,
      coalesce(sum(units_sold) filter (where validation_status='VALIDADO'),0) as portfolio_units,
      coalesce(sum(gross_revenue) filter (where validation_status='VALIDADO'),0) as portfolio_revenue
    from public.vos_portfolio_performance where case_id = p_case_id
  ), aligned_periods as (
    select count(*) as aligned_count
    from (
      select distinct pp.period_start, pp.period_end
      from public.vos_portfolio_performance pp
      where pp.case_id=p_case_id and pp.validation_status='VALIDADO'
        and exists (
          select 1 from public.vos_business_metric_snapshots mr
          where mr.case_id=p_case_id and mr.metric_code='GROSS_REVENUE'
            and mr.validation_status='VALIDADO' and mr.period_start=pp.period_start and mr.period_end=pp.period_end
        )
        and exists (
          select 1 from public.vos_business_metric_snapshots ms
          where ms.case_id=p_case_id and ms.metric_code='SALES_VOLUME'
            and ms.validation_status='VALIDADO' and ms.period_start=pp.period_start and ms.period_end=pp.period_end
        )
    ) x
  )
  select jsonb_build_object(
    'ready_for_full_vos', (
      p.sharing_status='SHARED'
      and p.analysis_mode='INTERNAL_COMPLETE'
      and p.portfolio_declared_complete
      and p.data_quality_confirmed
      and m.revenue_count>0
      and m.sales_count>0
      and f.validated_portfolio_count>0
      and a.aligned_count>0
    ),
    'sharing_status', p.sharing_status,
    'analysis_mode', p.analysis_mode,
    'public_limited', p.analysis_mode='PUBLIC_LIMITED',
    'checks', jsonb_build_object(
      'internal_sharing_confirmed', p.sharing_status='SHARED',
      'gross_revenue_present', m.revenue_count>0,
      'sales_volume_present', m.sales_count>0,
      'portfolio_breakdown_present', f.validated_portfolio_count>0,
      'periods_aligned', a.aligned_count>0,
      'portfolio_declared_complete', p.portfolio_declared_complete,
      'data_quality_confirmed', p.data_quality_confirmed
    ),
    'counts', jsonb_build_object(
      'validated_metrics', m.validated_metric_count,
      'validated_portfolio_items', f.validated_portfolio_count
    ),
    'portfolio_totals', jsonb_build_object(
      'units_sold', f.portfolio_units,
      'gross_revenue', f.portfolio_revenue
    ),
    'method_limit', case
      when p.analysis_mode='PUBLIC_LIMITED' then 'PUBLIC_REVIEW_ONLY_NO_VOS_CONCLUSION_OR_ORDER'
      when not (p.sharing_status='SHARED' and p.portfolio_declared_complete and p.data_quality_confirmed and m.revenue_count>0 and m.sales_count>0 and f.validated_portfolio_count>0 and a.aligned_count>0)
        then 'INTERNAL_DATA_REQUIRED'
      else null
    end
  )
  from profile p cross join metric_counts m cross join portfolio_counts f cross join aligned_periods a;
$$;

create or replace function public.vos_refresh_ver_data_coverage(p_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_readiness jsonb;
begin
  select public.vos_ver_data_readiness(p_case_id) into v_readiness;
  update public.vos_ver_data_profiles
  set coverage_status = case when coalesce((v_readiness->>'ready_for_full_vos')::boolean,false) then 'SUFFICIENT' else 'INSUFFICIENT' end
  where case_id = p_case_id;
  return v_readiness;
end;
$$;

create or replace function public.vos_internal_data_ready(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((public.vos_ver_data_readiness(p_case_id)->>'ready_for_full_vos')::boolean,false)
$$;

create or replace function public.vos_guard_ver_gate_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p8 integer;
  v_pending_hyp integer;
  v_hyp integer;
  v_conc integer;
  v_dys integer;
begin
  if new.gate_code='VER_GATE' and new.status='APROVADO' then
    if not public.vos_internal_data_ready(new.case_id) then
      raise exception 'internal_business_data_required_for_ver_gate';
    end if;
    select count(*) into v_p8 from public.vos_p8_coverage where case_id=new.case_id and human_status='VALIDADO';
    if v_p8<>8 then raise exception 'all_8p_must_be_human_validated'; end if;
    select count(*) into v_hyp from public.vos_hypotheses where case_id=new.case_id;
    select count(*) into v_pending_hyp from public.vos_hypotheses where case_id=new.case_id and status not in ('VALIDADA','REJEITADA','INCONCLUSIVA');
    if v_pending_hyp>0 then raise exception 'hypotheses_still_pending'; end if;
    select count(*) into v_conc from public.vos_conclusions where case_id=new.case_id;
    if v_conc<1 then raise exception 'human_conclusion_required'; end if;
    select count(*) into v_dys from public.vos_p8_coverage where case_id=new.case_id and classification='DISFUNCAO';
    if v_dys>0 and v_hyp<1 then raise exception 'causal_hypothesis_required_for_dysfunction'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vos_guard_ver_gate_approval on public.vos_gates;
create trigger trg_vos_guard_ver_gate_approval
before update on public.vos_gates
for each row execute function public.vos_guard_ver_gate_approval();

create or replace function public.vos_enforce_hypothesis_validation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'VALIDADA' and old.status is distinct from 'VALIDADA' then
    if not public.vos_internal_data_ready(new.case_id) then
      raise exception 'internal_business_data_required_for_validated_hypothesis';
    end if;
    if new.validated_by is null or new.validated_at is null then
      raise exception 'Hipótese só pode ser validada por pessoa identificada';
    end if;
    if not exists (
      select 1 from public.vos_hypothesis_tests t
      where t.hypothesis_id = new.id and t.result_classification is not null
    ) then
      raise exception 'Hipótese não pode virar validada sem teste registrado';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.vos_guard_conclusion_internal_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.vos_internal_data_ready(new.case_id) then
    raise exception 'internal_business_data_required_for_conclusion';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vos_guard_conclusion_internal_data on public.vos_conclusions;
create trigger trg_vos_guard_conclusion_internal_data
before insert or update on public.vos_conclusions
for each row execute function public.vos_guard_conclusion_internal_data();

create or replace function public.vos_guard_public_limited_p8_validation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_mode text;
begin
  if new.human_status='VALIDADO' and not public.vos_internal_data_ready(new.case_id) then
    select analysis_mode into v_mode from public.vos_ver_data_profiles where case_id=new.case_id;
    if v_mode is distinct from 'PUBLIC_LIMITED' then
      raise exception 'internal_business_data_required_before_p8_validation';
    elsif new.classification is distinct from 'INCONCLUSIVO' or new.confidence not in ('BAIXA','SEM_BASE') then
      raise exception 'public_or_incomplete_review_must_remain_inconclusive';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vos_guard_public_limited_p8_validation on public.vos_p8_coverage;
create trigger trg_vos_guard_public_limited_p8_validation
before update on public.vos_p8_coverage
for each row execute function public.vos_guard_public_limited_p8_validation();

create or replace function public.vos_guard_hypothesis_data_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_mode text;
begin
  if not public.vos_internal_data_ready(new.case_id) then
    select analysis_mode into v_mode from public.vos_ver_data_profiles where case_id=new.case_id;
    if v_mode is distinct from 'PUBLIC_LIMITED' then
      raise exception 'internal_business_data_required_before_hypothesis';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vos_guard_hypothesis_data_mode on public.vos_hypotheses;
create trigger trg_vos_guard_hypothesis_data_mode
before insert on public.vos_hypotheses
for each row execute function public.vos_guard_hypothesis_data_mode();

create or replace function public.vos_require_ver_gate_for_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.vos_internal_data_ready(new.case_id) then
    raise exception 'internal_business_data_required_for_order';
  end if;
  if not exists (
    select 1 from public.vos_gates g
    where g.case_id=new.case_id and g.gate_code='VER_GATE' and g.status='APROVADO'
  ) then
    raise exception 'ORDENAR só pode receber candidatos após VER_GATE aprovado por validação humana';
  end if;
  return new;
end;
$$;

create or replace function public.vos_get_case_bundle(p_case_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'contract_version','VOS_CASE_BUNDLE_1.1',
    'case', to_jsonb(c),
    'data_profile', coalesce((select to_jsonb(dp) from public.vos_ver_data_profiles dp where dp.case_id=c.id),'{}'::jsonb),
    'data_readiness', coalesce(public.vos_ver_data_readiness(c.id),'{}'::jsonb),
    'business_metrics', coalesce((select jsonb_agg(to_jsonb(m) order by m.period_end desc,m.metric_code) from public.vos_business_metric_snapshots m where m.case_id=c.id),'[]'::jsonb),
    'portfolio_performance', coalesce((select jsonb_agg(to_jsonb(pp) order by pp.period_end desc,pp.portfolio_item) from public.vos_portfolio_performance pp where pp.case_id=c.id),'[]'::jsonb),
    'p8_coverage', coalesce((select jsonb_agg(to_jsonb(p) order by case p.p8_code when 'PRODUTO' then 1 when 'PRECO' then 2 when 'PRACA' then 3 when 'PROMOCAO' then 4 when 'PESSOAS' then 5 when 'PROCESSOS' then 6 when 'EVIDENCIAS_FISICAS' then 7 else 8 end) from public.vos_p8_coverage p where p.case_id=c.id),'[]'::jsonb),
    'rx_import_signals', coalesce((select jsonb_agg(to_jsonb(s) order by s.imported_at,s.id) from public.vos_rx_import_signals s where s.case_id=c.id),'[]'::jsonb),
    'evidence', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id) from public.vos_evidence e where e.case_id=c.id),'[]'::jsonb),
    'ver_entries', coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object('evidence_links',coalesce((select jsonb_agg(jsonb_build_object('evidence_id',ve.evidence_id,'relation',ve.relation) order by ve.evidence_id) from public.vos_entry_evidence ve where ve.entry_id=v.id),'[]'::jsonb)) order by v.created_at,v.id) from public.vos_ver_entries v where v.case_id=c.id),'[]'::jsonb),
    'hypotheses', coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('tests',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('evidence_ids',coalesce((select jsonb_agg(te.evidence_id order by te.evidence_id) from public.vos_test_evidence te where te.test_id=t.id),'[]'::jsonb)) order by t.created_at,t.id) from public.vos_hypothesis_tests t where t.hypothesis_id=h.id),'[]'::jsonb)) order by h.created_at,h.id) from public.vos_hypotheses h where h.case_id=c.id),'[]'::jsonb),
    'conclusions', coalesce((select jsonb_agg(to_jsonb(k) order by k.created_at,k.id) from public.vos_conclusions k where k.case_id=c.id),'[]'::jsonb),
    'validations', coalesce((select jsonb_agg(to_jsonb(vd) order by vd.validated_at,vd.id) from public.vos_validations vd where vd.case_id=c.id),'[]'::jsonb),
    'gates', coalesce((select jsonb_agg(to_jsonb(g) order by g.gate_code) from public.vos_gates g where g.case_id=c.id),'[]'::jsonb),
    'order_candidates', coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at,o.id) from public.vos_order_candidates o where o.case_id=c.id),'[]'::jsonb),
    'counts', jsonb_build_object(
      'p8_total',(select count(*) from public.vos_p8_coverage p where p.case_id=c.id),
      'p8_validated',(select count(*) from public.vos_p8_coverage p where p.case_id=c.id and p.human_status='VALIDADO'),
      'evidence',(select count(*) from public.vos_evidence e where e.case_id=c.id),
      'ver_entries',(select count(*) from public.vos_ver_entries v where v.case_id=c.id),
      'hypotheses',(select count(*) from public.vos_hypotheses h where h.case_id=c.id),
      'validated_hypotheses',(select count(*) from public.vos_hypotheses h where h.case_id=c.id and h.status='VALIDADA'),
      'conclusions',(select count(*) from public.vos_conclusions k where k.case_id=c.id),
      'order_candidates',(select count(*) from public.vos_order_candidates o where o.case_id=c.id)
    )
  ) from public.vos_cases c where c.id=p_case_id;
$$;

alter table public.vos_ver_data_profiles enable row level security;
alter table public.vos_business_metric_snapshots enable row level security;
alter table public.vos_portfolio_performance enable row level security;

revoke all on table public.vos_ver_data_profiles from public, anon, authenticated;
revoke all on table public.vos_business_metric_snapshots from public, anon, authenticated;
revoke all on table public.vos_portfolio_performance from public, anon, authenticated;
grant all on table public.vos_ver_data_profiles to service_role;
grant all on table public.vos_business_metric_snapshots to service_role;
grant all on table public.vos_portfolio_performance to service_role;

revoke all on function public.vos_ver_data_readiness(uuid) from public, anon, authenticated;
revoke all on function public.vos_refresh_ver_data_coverage(uuid) from public, anon, authenticated;
revoke all on function public.vos_internal_data_ready(uuid) from public, anon, authenticated;
revoke all on function public.vos_initialize_ver_data_profile() from public, anon, authenticated;
revoke all on function public.vos_guard_conclusion_internal_data() from public, anon, authenticated;
revoke all on function public.vos_guard_public_limited_p8_validation() from public, anon, authenticated;
revoke all on function public.vos_guard_hypothesis_data_mode() from public, anon, authenticated;
grant execute on function public.vos_ver_data_readiness(uuid) to service_role;
grant execute on function public.vos_refresh_ver_data_coverage(uuid) to service_role;
grant execute on function public.vos_internal_data_ready(uuid) to service_role;
grant execute on function public.vos_initialize_ver_data_profile() to service_role;
grant execute on function public.vos_guard_conclusion_internal_data() to service_role;
grant execute on function public.vos_guard_public_limited_p8_validation() to service_role;
grant execute on function public.vos_guard_hypothesis_data_mode() to service_role;

comment on table public.vos_ver_data_profiles is 'Gate metodológico de dados internos do VER; recusa formal cria somente leitura pública limitada.';
comment on table public.vos_business_metric_snapshots is 'KPIs internos do negócio usados como baseline do VER, com período, fonte e validação.';
comment on table public.vos_portfolio_performance is 'Volume vendido e faturamento por item do portfólio do cliente na etapa VER.';
