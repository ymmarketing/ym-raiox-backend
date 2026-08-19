alter table public.crm_contacts
  add column if not exists google_url text,
  add column if not exists other_url text;

alter table public.crm_opportunities
  add column if not exists follow_up_date date,
  add column if not exists closing_date date,
  add column if not exists disqualification_reason text;

alter table public.crm_opportunities drop constraint if exists crm_opportunities_current_stage_check;
alter table public.crm_opportunities
  add constraint crm_opportunities_current_stage_check
  check (current_stage = any (array[
    'LEAD_MAPEADO'::text,
    'LEITURA_EM_PRODUCAO'::text,
    'LEITURA_ENVIADA'::text,
    'FOLLOW_UP'::text,
    'CONVERSA_AGENDADA'::text,
    'RAIOX_OFERTADO'::text,
    'RAIOX_PAGO'::text,
    'RAIOX_ENTREGUE'::text,
    'ROTA_RECOMENDADA'::text,
    'PROPOSTA'::text,
    'GANHO'::text,
    'PERDIDO'::text,
    'DESQUALIFICADO'::text,
    'IMPLANTACAO'::text
  ]));

create or replace function public.crm_move_stage(
  p_opportunity_id uuid,
  p_stage text,
  p_reason text,
  p_actor text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(trim(p_actor),'')='' then raise exception 'Responsável é obrigatório'; end if;
  if p_stage not in (
    'LEAD_MAPEADO','LEITURA_EM_PRODUCAO','LEITURA_ENVIADA','FOLLOW_UP','CONVERSA_AGENDADA',
    'RAIOX_OFERTADO','RAIOX_PAGO','RAIOX_ENTREGUE','ROTA_RECOMENDADA','PROPOSTA','GANHO','PERDIDO',
    'DESQUALIFICADO','IMPLANTACAO'
  ) then raise exception 'Etapa inválida'; end if;
  if p_stage='ROTA_RECOMENDADA' and not exists(
    select 1 from public.crm_opportunities
    where id=p_opportunity_id and recommended_route is not null and route_validated_by is not null
  ) then raise exception 'ROTA_RECOMENDADA exige rota validada por pessoa'; end if;

  update public.crm_opportunities
  set current_stage=p_stage,
      updated_by=p_actor,
      notes=nullif(p_reason,''),
      won_at=case when p_stage='GANHO' then now() else won_at end,
      lost_at=case when p_stage in ('PERDIDO','DESQUALIFICADO') then now() else lost_at end
  where id=p_opportunity_id;

  if not found then raise exception 'Oportunidade não encontrada'; end if;
end;
$function$;

create or replace function public.crm_save_lead_sheet(
  p_opportunity_id uuid,
  p_payload jsonb,
  p_actor text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_contact_id uuid;
  v_stage text;
  v_reading text;
  v_contact_status text;
  v_route text;
  v_contact_date date;
  v_follow_up_date date;
  v_closing_date date;
  v_observation text;
  v_route_rationale text;
  v_disqualification_reason text;
  v_loss_reason text;
begin
  if coalesce(trim(p_actor),'')='' then raise exception 'Responsável é obrigatório'; end if;

  select contact_id into v_contact_id
  from public.crm_opportunities
  where id=p_opportunity_id;
  if not found then raise exception 'Oportunidade não encontrada'; end if;

  v_stage := nullif(trim(coalesce(p_payload->>'current_stage','')),'');
  if v_stage is null then v_stage := 'LEAD_MAPEADO'; end if;
  if v_stage not in ('LEAD_MAPEADO','RAIOX_OFERTADO','RAIOX_PAGO','RAIOX_ENTREGUE','PROPOSTA','GANHO','PERDIDO','DESQUALIFICADO') then
    raise exception 'Status do lead inválido';
  end if;

  v_reading := nullif(trim(coalesce(p_payload->>'initial_reading_status','')),'');
  if v_reading is not null and v_reading not in ('NAO_INICIADA','EM_PRODUCAO','PRONTA','ENVIADA','NAO_SE_APLICA') then
    raise exception 'Status da Leitura Inicial inválido';
  end if;

  v_contact_status := nullif(trim(coalesce(p_payload->>'contact_status','')),'');
  if v_contact_status is not null and v_contact_status not in ('NAO_INICIADO','MENSAGEM_ENVIADA','RESPONDEU','CONVERSA_AGENDADA','SEM_RETORNO','NAO_INTERESSADO') then
    raise exception 'Status do contato inválido';
  end if;

  v_route := nullif(trim(coalesce(p_payload->>'recommended_route','')),'');
  if v_route is not null and v_route not in ('AVULSO','FUNDACAO','NEGOCIO_DO_ZERO') then
    raise exception 'Rota recomendada inválida';
  end if;

  v_route_rationale := nullif(trim(coalesce(p_payload->>'route_rationale','')),'');
  if v_route is not null and v_route_rationale is null then
    raise exception 'Justificativa da recomendação é obrigatória';
  end if;
  if v_route is null and v_route_rationale is not null then
    raise exception 'Selecione a rota antes de justificar';
  end if;

  v_contact_date := nullif(trim(coalesce(p_payload->>'contact_date','')),'')::date;
  v_follow_up_date := nullif(trim(coalesce(p_payload->>'follow_up_date','')),'')::date;
  v_closing_date := nullif(trim(coalesce(p_payload->>'closing_date','')),'')::date;
  v_observation := nullif(trim(coalesce(p_payload->>'observation','')),'');
  v_disqualification_reason := nullif(trim(coalesce(p_payload->>'disqualification_reason','')),'');
  v_loss_reason := nullif(trim(coalesce(p_payload->>'loss_reason','')),'');

  if v_stage='DESQUALIFICADO' and v_disqualification_reason is null then
    raise exception 'Informe o motivo da desqualificação';
  end if;

  if v_stage in ('GANHO','PERDIDO','DESQUALIFICADO') and v_closing_date is null then
    v_closing_date := current_date;
  end if;

  update public.crm_contacts
  set website_url = nullif(trim(coalesce(p_payload->>'website_url','')),''),
      instagram_url = nullif(trim(coalesce(p_payload->>'instagram_url','')),''),
      linkedin_url = nullif(trim(coalesce(p_payload->>'linkedin_url','')),''),
      google_url = nullif(trim(coalesce(p_payload->>'google_url','')),''),
      other_url = nullif(trim(coalesce(p_payload->>'other_url','')),''),
      updated_at = now()
  where id=v_contact_id;

  update public.crm_opportunities
  set initial_reading_status = v_reading,
      initial_reading_url = nullif(trim(coalesce(p_payload->>'initial_reading_url','')),''),
      contact_status = v_contact_status,
      contact_date = v_contact_date,
      contact_result = nullif(trim(coalesce(p_payload->>'contact_result','')),''),
      follow_up_date = v_follow_up_date,
      next_action = case when v_follow_up_date is not null then 'Follow-up' else 'Sem follow-up definido' end,
      next_action_due_at = case when v_follow_up_date is not null then v_follow_up_date::timestamptz else null end,
      current_stage = v_stage,
      closing_date = case when v_stage in ('GANHO','PERDIDO','DESQUALIFICADO') then v_closing_date else null end,
      disqualification_reason = case when v_stage='DESQUALIFICADO' then v_disqualification_reason else null end,
      loss_reason = case when v_stage='PERDIDO' then v_loss_reason else null end,
      notes = v_observation,
      recommended_route = v_route,
      route_rationale = v_route_rationale,
      route_validated_by = case when v_route is not null then p_actor else null end,
      route_validated_at = case when v_route is not null then now() else null end,
      won_at = case when v_stage='GANHO' then v_closing_date::timestamptz else won_at end,
      lost_at = case when v_stage in ('PERDIDO','DESQUALIFICADO') then v_closing_date::timestamptz else lost_at end,
      updated_by = p_actor,
      updated_at = now()
  where id=p_opportunity_id;

  return jsonb_build_object(
    'opportunity_id', p_opportunity_id,
    'contact_id', v_contact_id,
    'status', v_stage,
    'saved_at', now()
  );
end;
$function$;

revoke all on function public.crm_save_lead_sheet(uuid,jsonb,text) from public;
revoke all on function public.crm_save_lead_sheet(uuid,jsonb,text) from anon;
revoke all on function public.crm_save_lead_sheet(uuid,jsonb,text) from authenticated;
grant execute on function public.crm_save_lead_sheet(uuid,jsonb,text) to service_role;
