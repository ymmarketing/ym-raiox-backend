-- YM internal integration/security regression guardrail.
-- All business-data mutations are rolled back.

begin;

do $audit$
declare
  v_contact uuid;
  v_opp uuid;
  v_client uuid;
  v_service uuid;
  v_status text;
begin
  if has_table_privilege('anon','public.finance_assumptions','SELECT') then
    raise exception 'AUDIT_FAIL: anon can read finance_assumptions';
  end if;
  if has_table_privilege('authenticated','public.finance_assumptions','SELECT') then
    raise exception 'AUDIT_FAIL: authenticated can directly read finance_assumptions';
  end if;
  if has_table_privilege('anon','public.finance_v_monthly_actuals','SELECT') then
    raise exception 'AUDIT_FAIL: anon can read finance_v_monthly_actuals';
  end if;
  if not has_table_privilege('service_role','public.finance_v_monthly_actuals','SELECT') then
    raise exception 'AUDIT_FAIL: service_role cannot read finance_v_monthly_actuals';
  end if;

  insert into public.crm_contacts(name,business_name,source,owner_email)
  values ('Auditoria','__YM_REGRESSION_AUDIT__','AUDIT','audit@internal.local')
  returning id into v_contact;

  insert into public.crm_opportunities(contact_id,current_stage,owner_email,updated_by,next_action)
  values (v_contact,'LEAD_MAPEADO','audit@internal.local','audit@internal.local','Sem follow-up definido')
  returning id into v_opp;

  update public.crm_opportunities
  set current_stage='RAIOX_PAGO',updated_by='audit@internal.local'
  where id=v_opp;

  select id into v_client from public.crm_clients where contact_id=v_contact;
  if v_client is null then
    raise exception 'AUDIT_FAIL: RAIOX_PAGO did not create client';
  end if;

  select id,status into v_service,v_status
  from public.crm_client_services
  where client_id=v_client
    and opportunity_id=v_opp
    and service_code in ('RAIOX_ESTRATEGICO','RAIO_X_ESTRATEGICO')
  limit 1;
  if v_service is null or v_status <> 'EM_EXECUCAO' then
    raise exception 'AUDIT_FAIL: RAIOX_PAGO did not create in-progress Raio-X';
  end if;

  update public.crm_opportunities
  set current_stage='RAIOX_ENTREGUE',updated_by='audit@internal.local'
  where id=v_opp;

  select status into v_status from public.crm_client_services where id=v_service;
  if v_status <> 'CONCLUIDO' then
    raise exception 'AUDIT_FAIL: RAIOX_ENTREGUE did not conclude Raio-X';
  end if;

  update public.crm_opportunities
  set current_stage='GANHO',updated_by='audit@internal.local'
  where id=v_opp;

  if not exists(
    select 1 from public.crm_opportunities
    where id=v_opp and won_at is not null and closing_date is not null
  ) then
    raise exception 'AUDIT_FAIL: GANHO missing won_at/closing_date';
  end if;

  if (select count(*) from public.crm_clients where contact_id=v_contact) <> 1 then
    raise exception 'AUDIT_FAIL: client duplicated';
  end if;
  if (
    select count(*) from public.crm_client_services
    where client_id=v_client and opportunity_id=v_opp
      and service_code in ('RAIOX_ESTRATEGICO','RAIO_X_ESTRATEGICO')
  ) <> 1 then
    raise exception 'AUDIT_FAIL: Raio-X service duplicated';
  end if;
end
$audit$;

rollback;