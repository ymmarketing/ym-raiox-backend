create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  client_ref text unique, name text, business_name text, email text, phone text, source text,
  owner_email text, notes text, active boolean not null default true
);

create table public.crm_opportunities (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  current_stage text not null default 'LEAD_MAPEADO' check (current_stage in ('LEAD_MAPEADO','LEITURA_EM_PRODUCAO','LEITURA_ENVIADA','FOLLOW_UP','CONVERSA_AGENDADA','RAIOX_OFERTADO','RAIOX_PAGO','RAIOX_ENTREGUE','ROTA_RECOMENDADA','PROPOSTA','GANHO','PERDIDO','IMPLANTACAO')),
  stage_entered_at timestamptz not null default now(),
  source_intake_id uuid unique references public.raiox_intakes(id) on delete set null,
  source_case_id uuid unique references public.vos_cases(id) on delete set null,
  recommended_route text check (recommended_route is null or recommended_route in ('AVULSO','FUNDACAO','NEGOCIO_DO_ZERO')),
  route_rationale text, route_validated_by text, route_validated_at timestamptz,
  proposal_value numeric(12,2), won_at timestamptz, lost_at timestamptz, loss_reason text,
  owner_email text, updated_by text, notes text,
  check ((recommended_route is null) or (route_validated_by is not null and route_validated_at is not null)),
  check ((current_stage <> 'GANHO') or won_at is not null),
  check ((current_stage <> 'PERDIDO') or lost_at is not null)
);

create table public.crm_stage_history (
  id uuid primary key default gen_random_uuid(), opportunity_id uuid not null references public.crm_opportunities(id) on delete cascade,
  from_stage text, to_stage text not null, reason text, changed_by text not null, changed_at timestamptz not null default now()
);

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(), opportunity_id uuid not null references public.crm_opportunities(id) on delete cascade,
  activity_type text not null check (activity_type in ('NOTA','FOLLOW_UP','CONVERSA','PROPOSTA','ENTREGA','OUTRA')),
  content text not null, due_at timestamptz, completed_at timestamptz, created_by text not null, created_at timestamptz not null default now()
);

create or replace function public.crm_touch_updated_at() returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end;$$;
create trigger trg_crm_contacts_touch before update on public.crm_contacts for each row execute function public.crm_touch_updated_at();
create trigger trg_crm_opportunities_touch before update on public.crm_opportunities for each row execute function public.crm_touch_updated_at();

create or replace function public.crm_track_stage_change() returns trigger language plpgsql set search_path=public as $$
begin
  if new.current_stage is distinct from old.current_stage then
    new.stage_entered_at=now();
    insert into public.crm_stage_history(opportunity_id,from_stage,to_stage,reason,changed_by)
    values(new.id,old.current_stage,new.current_stage,coalesce(new.notes,'Alteração de etapa'),coalesce(nullif(new.updated_by,''),'SYSTEM'));
  end if;
  return new;
end;$$;
create trigger trg_crm_stage_change before update on public.crm_opportunities for each row execute function public.crm_track_stage_change();

create or replace function public.crm_upsert_from_intake(p_intake_id uuid,p_actor text default 'SYSTEM_INTAKE')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_intake public.raiox_intakes%rowtype; v_contact uuid; v_opp uuid; v_ref text; v_name text; v_business text;
begin
  select * into v_intake from public.raiox_intakes where id=p_intake_id;
  if not found then raise exception 'Intake não encontrado'; end if;
  if v_intake.packet_version<>'VOS_INTAKE_1.0' then raise exception 'Packet incompatível'; end if;
  v_ref:=v_intake.client_ref; v_name:=public.vos_response_value(v_intake.packet,'RX01'); v_business:=public.vos_response_value(v_intake.packet,'RX02');
  select id into v_contact from public.crm_contacts where client_ref=v_ref;
  if v_contact is null then
    insert into public.crm_contacts(client_ref,name,business_name,source,owner_email) values(v_ref,v_name,v_business,'RAIOX',p_actor) returning id into v_contact;
  else
    update public.crm_contacts set name=coalesce(v_name,name),business_name=coalesce(v_business,business_name),updated_at=now() where id=v_contact;
  end if;
  select id into v_opp from public.crm_opportunities where source_intake_id=p_intake_id;
  if v_opp is null then
    insert into public.crm_opportunities(contact_id,current_stage,source_intake_id,owner_email,updated_by,notes)
    values(v_contact,'RAIOX_ENTREGUE',p_intake_id,p_actor,p_actor,'Criado deterministicamente a partir de Intake entregue. Nenhuma rota foi definida automaticamente.') returning id into v_opp;
    insert into public.crm_stage_history(opportunity_id,from_stage,to_stage,reason,changed_by)
    values(v_opp,null,'RAIOX_ENTREGUE','Entrada importada de VOS_INTAKE_1.0 já entregue.',p_actor);
  end if;
  return v_opp;
end;$$;

create or replace function public.crm_link_vos_case(p_case_id uuid,p_actor text default 'SYSTEM_MOTOR')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_intake uuid; v_opp uuid;
begin
  select source_intake_id into v_intake from public.vos_cases where id=p_case_id;
  if v_intake is null then raise exception 'Caso VOS não encontrado'; end if;
  v_opp:=public.crm_upsert_from_intake(v_intake,p_actor);
  update public.crm_opportunities set source_case_id=p_case_id,updated_by=p_actor where id=v_opp;
  return v_opp;
end;$$;

create or replace function public.crm_set_route(p_opportunity_id uuid,p_route text,p_rationale text,p_actor text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if coalesce(trim(p_actor),'')='' then raise exception 'Validador humano é obrigatório'; end if;
  if p_route not in ('AVULSO','FUNDACAO','NEGOCIO_DO_ZERO') then raise exception 'Rota inválida'; end if;
  if coalesce(trim(p_rationale),'')='' then raise exception 'Justificativa da rota é obrigatória'; end if;
  update public.crm_opportunities set recommended_route=p_route,route_rationale=p_rationale,route_validated_by=p_actor,route_validated_at=now(),current_stage='ROTA_RECOMENDADA',updated_by=p_actor,notes=p_rationale where id=p_opportunity_id;
  if not found then raise exception 'Oportunidade não encontrada'; end if;
end;$$;

create or replace function public.crm_move_stage(p_opportunity_id uuid,p_stage text,p_reason text,p_actor text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if coalesce(trim(p_actor),'')='' then raise exception 'Responsável é obrigatório'; end if;
  if p_stage not in ('LEAD_MAPEADO','LEITURA_EM_PRODUCAO','LEITURA_ENVIADA','FOLLOW_UP','CONVERSA_AGENDADA','RAIOX_OFERTADO','RAIOX_PAGO','RAIOX_ENTREGUE','ROTA_RECOMENDADA','PROPOSTA','GANHO','PERDIDO','IMPLANTACAO') then raise exception 'Etapa inválida'; end if;
  if p_stage='ROTA_RECOMENDADA' and not exists(select 1 from public.crm_opportunities where id=p_opportunity_id and recommended_route is not null and route_validated_by is not null) then raise exception 'ROTA_RECOMENDADA exige rota validada por pessoa'; end if;
  update public.crm_opportunities set current_stage=p_stage,updated_by=p_actor,notes=nullif(p_reason,''),won_at=case when p_stage='GANHO' then now() else won_at end,lost_at=case when p_stage='PERDIDO' then now() else lost_at end where id=p_opportunity_id;
  if not found then raise exception 'Oportunidade não encontrada'; end if;
end;$$;

create index idx_crm_contacts_business on public.crm_contacts(business_name);
create index idx_crm_opportunities_stage on public.crm_opportunities(current_stage,stage_entered_at);
create index idx_crm_opportunities_contact on public.crm_opportunities(contact_id);
create index idx_crm_stage_history_opp on public.crm_stage_history(opportunity_id,changed_at desc);
create index idx_crm_activities_opp on public.crm_activities(opportunity_id,created_at desc);

alter table public.crm_contacts enable row level security;
alter table public.crm_opportunities enable row level security;
alter table public.crm_stage_history enable row level security;
alter table public.crm_activities enable row level security;
revoke all on public.crm_contacts,public.crm_opportunities,public.crm_stage_history,public.crm_activities from anon,authenticated;
revoke execute on function public.crm_upsert_from_intake(uuid,text) from public,anon,authenticated;
revoke execute on function public.crm_link_vos_case(uuid,text) from public,anon,authenticated;
revoke execute on function public.crm_set_route(uuid,text,text,text) from public,anon,authenticated;
revoke execute on function public.crm_move_stage(uuid,text,text,text) from public,anon,authenticated;
comment on table public.crm_opportunities is 'CRM Essencial YM. Rota comercial só pode ser preenchida com validador humano identificado.';
