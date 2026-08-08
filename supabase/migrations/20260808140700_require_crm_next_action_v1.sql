alter table public.crm_opportunities
  add column next_action text,
  add column next_action_due_at timestamptz,
  add column next_action_updated_at timestamptz not null default now();

update public.crm_opportunities
set next_action=case
  when current_stage='RAIOX_ENTREGUE' then 'Revisar o Raio-X e definir o próximo passo com validação humana.'
  else 'Definir a próxima ação comercial.' end
where next_action is null;

alter table public.crm_opportunities alter column next_action set not null;
alter table public.crm_opportunities add constraint crm_next_action_nonempty_check check (length(trim(next_action)) > 0);

create or replace function public.crm_set_next_action(p_opportunity_id uuid,p_next_action text,p_due_at timestamptz,p_actor text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if coalesce(trim(p_actor),'')='' then raise exception 'Responsável é obrigatório'; end if;
  if coalesce(trim(p_next_action),'')='' then raise exception 'Próxima ação é obrigatória'; end if;
  update public.crm_opportunities set next_action=trim(p_next_action),next_action_due_at=p_due_at,next_action_updated_at=now(),updated_by=p_actor where id=p_opportunity_id;
  if not found then raise exception 'Oportunidade não encontrada'; end if;
end;$$;
revoke execute on function public.crm_set_next_action(uuid,text,timestamptz,text) from public,anon,authenticated;

create or replace function public.crm_upsert_from_intake(p_intake_id uuid,p_actor text default 'SYSTEM_INTAKE')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_intake public.raiox_intakes%rowtype; v_contact uuid; v_opp uuid; v_ref text; v_name text; v_business text;
begin
  select * into v_intake from public.raiox_intakes where id=p_intake_id;
  if not found then raise exception 'Intake não encontrado'; end if;
  if v_intake.packet_version<>'VOS_INTAKE_1.0' then raise exception 'Packet incompatível'; end if;
  v_ref:=v_intake.client_ref; v_name:=public.vos_response_value(v_intake.packet,'RX01'); v_business:=public.vos_response_value(v_intake.packet,'RX02');
  select id into v_contact from public.crm_contacts where client_ref=v_ref;
  if v_contact is null then insert into public.crm_contacts(client_ref,name,business_name,source,owner_email) values(v_ref,v_name,v_business,'RAIOX',p_actor) returning id into v_contact;
  else update public.crm_contacts set name=coalesce(v_name,name),business_name=coalesce(v_business,business_name),updated_at=now() where id=v_contact; end if;
  select id into v_opp from public.crm_opportunities where source_intake_id=p_intake_id;
  if v_opp is null then
    insert into public.crm_opportunities(contact_id,current_stage,source_intake_id,owner_email,updated_by,notes,next_action)
    values(v_contact,'RAIOX_ENTREGUE',p_intake_id,p_actor,p_actor,'Criado deterministicamente a partir de Intake entregue. Nenhuma rota foi definida automaticamente.','Revisar o Raio-X e definir o próximo passo com validação humana.') returning id into v_opp;
    insert into public.crm_stage_history(opportunity_id,from_stage,to_stage,reason,changed_by) values(v_opp,null,'RAIOX_ENTREGUE','Entrada importada de VOS_INTAKE_1.0 já entregue.',p_actor);
  end if;
  return v_opp;
end;$$;
revoke execute on function public.crm_upsert_from_intake(uuid,text) from public,anon,authenticated;

create or replace function public.crm_create_manual_lead(p_name text,p_business_name text,p_email text,p_phone text,p_source text,p_actor text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_contact uuid; v_opp uuid;
begin
  if coalesce(trim(p_actor),'')='' then raise exception 'Responsável é obrigatório'; end if;
  if coalesce(trim(p_name),'')='' and coalesce(trim(p_business_name),'')='' then raise exception 'Nome ou negócio é obrigatório'; end if;
  insert into public.crm_contacts(name,business_name,email,phone,source,owner_email)
  values(nullif(trim(p_name),''),nullif(trim(p_business_name),''),nullif(trim(p_email),''),nullif(trim(p_phone),''),coalesce(nullif(trim(p_source),''),'MANUAL'),p_actor) returning id into v_contact;
  insert into public.crm_opportunities(contact_id,current_stage,owner_email,updated_by,notes,next_action)
  values(v_contact,'LEAD_MAPEADO',p_actor,p_actor,'Lead criado manualmente no CRM Essencial YM.','Produzir a Leitura Inicial Gratuita e registrar o próximo retorno.') returning id into v_opp;
  insert into public.crm_stage_history(opportunity_id,from_stage,to_stage,reason,changed_by) values(v_opp,null,'LEAD_MAPEADO','Entrada manual no CRM.',p_actor);
  return v_opp;
end;$$;
revoke execute on function public.crm_create_manual_lead(text,text,text,text,text,text) from public,anon,authenticated;

comment on column public.crm_opportunities.next_action is 'Próxima ação operacional obrigatória para que nenhum lead fique sem continuidade.';
