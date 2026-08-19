-- CRM -> Finance propagation regression guardrail.
-- All mutations are rolled back.

begin;

do $audit$
declare
  v_contact uuid;
  v_client uuid;
  v_service uuid;
  v_month date := date_trunc('month',current_date)::date;
  b_contracted numeric;
  b_received numeric;
  a_contracted numeric;
  a_received numeric;
begin
  select coalesce(contratado,0),coalesce(recebido,0)
    into b_contracted,b_received
  from public.finance_v_monthly_actuals where month=v_month;

  insert into public.crm_contacts(name,business_name,source,owner_email)
  values ('Finance Audit','__YM_FINANCE_FLOW_AUDIT__','AUDIT','audit@internal.local')
  returning id into v_contact;

  insert into public.crm_clients(contact_id,status,became_client_at,updated_by)
  values (v_contact,'ATIVO',now(),'audit@internal.local')
  returning id into v_client;

  insert into public.crm_client_services(
    client_id,service_code,service_name,service_type,status,contracted_value,start_date,updated_by
  ) values (
    v_client,'FUNDACAO_ESSENCIAL','Fundação Essencial','AVULSO','CONTRATADO',1400,current_date,'audit@internal.local'
  ) returning id into v_service;

  insert into public.crm_payments(
    client_service_id,amount,status,payment_date,paid_at,competence_month,payment_method,updated_by
  ) values (
    v_service,700,'PAGO',current_date,now(),v_month,'AUDIT','audit@internal.local'
  );

  select coalesce(contratado,0),coalesce(recebido,0)
    into a_contracted,a_received
  from public.finance_v_monthly_actuals where month=v_month;

  if round(a_contracted-b_contracted,2) <> 1400 then
    raise exception 'AUDIT_FAIL: contracted value did not reach finance view';
  end if;
  if round(a_received-b_received,2) <> 700 then
    raise exception 'AUDIT_FAIL: paid payment did not reach finance view';
  end if;
end
$audit$;

rollback;