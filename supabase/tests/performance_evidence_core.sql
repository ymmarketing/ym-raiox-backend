-- CENTRAL YM performance/evidence regression guardrail.
-- Requires the performance core migration. All mutations are rolled back.

begin;

do $audit$
declare
  v_contact uuid;
  v_client uuid;
  v_kpi uuid;
  v_action uuid;
begin
  if has_table_privilege('anon','public.client_performance_kpis','SELECT') then
    raise exception 'AUDIT_FAIL: anon can read client performance KPIs';
  end if;
  if has_table_privilege('authenticated','public.client_performance_measurements','SELECT') then
    raise exception 'AUDIT_FAIL: authenticated can directly read measurements';
  end if;
  if not has_table_privilege('service_role','public.client_performance_actions','INSERT') then
    raise exception 'AUDIT_FAIL: service_role cannot write performance actions';
  end if;

  insert into public.crm_contacts(name,business_name,source,owner_email)
  values ('Performance Audit','__YM_PERFORMANCE_AUDIT__','AUDIT','audit@internal.local')
  returning id into v_contact;

  insert into public.crm_clients(contact_id,status,became_client_at,updated_by)
  values (v_contact,'ATIVO',now(),'audit@internal.local')
  returning id into v_client;

  insert into public.client_performance_kpis(
    client_id,code,name,unit,direction,baseline_value,baseline_period_start,baseline_period_end,target_value,created_by
  ) values (
    v_client,'RECEITA_MENSAL','Receita mensal','MOEDA','MAIOR_MELHOR',10000,current_date-60,current_date-31,15000,'audit@internal.local'
  ) returning id into v_kpi;

  insert into public.client_performance_measurements(
    kpi_id,client_id,period_start,period_end,value,is_baseline,created_by
  ) values (
    v_kpi,v_client,current_date-30,current_date,12500,false,'audit@internal.local'
  );

  insert into public.client_performance_actions(
    client_id,action_type,title,action_date,hypothesis,created_by
  ) values (
    v_client,'HOME_SITE','Nova home implantada',current_date-20,'Reduzir atrito deve elevar a conversão.','audit@internal.local'
  ) returning id into v_action;

  insert into public.client_performance_action_kpis(action_id,kpi_id,expected_effect,attribution_window_days)
  values (v_action,v_kpi,'AUMENTAR',30);

  if not exists (
    select 1 from public.client_performance_action_kpis where action_id=v_action and kpi_id=v_kpi
  ) then
    raise exception 'AUDIT_FAIL: action-to-KPI evidence link was not preserved';
  end if;
end
$audit$;

rollback;
