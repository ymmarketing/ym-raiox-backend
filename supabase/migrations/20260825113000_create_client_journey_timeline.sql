create table if not exists public.client_journey_steps (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.crm_clients(id) on delete cascade,
  step_key text not null,
  step_type text not null check (step_type in ('ENTRADA','RAIOX','MOTOR_VOS','SOLUCAO','MARCO','OUTRO')),
  title text not null,
  description text,
  status text not null check (status in ('CONCLUIDA','EM_ANDAMENTO','PULADA','PLANEJADA','PAUSADA')),
  sequence_order integer not null default 100 check (sequence_order between 0 and 100000),
  started_at timestamptz,
  completed_at timestamptz,
  source_type text not null default 'MANUAL' check (source_type in ('SISTEMA','METODO_VOS','SOLICITACAO_CLIENTE','CONTRATO','MANUAL')),
  source_ref_id uuid,
  visible_to_client boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  unique (client_id, step_key)
);

create index if not exists client_journey_steps_client_sequence_idx
  on public.client_journey_steps(client_id, sequence_order, created_at);

create index if not exists client_journey_steps_source_ref_idx
  on public.client_journey_steps(source_ref_id)
  where source_ref_id is not null;

alter table public.client_journey_steps enable row level security;
revoke all on table public.client_journey_steps from anon, authenticated;
grant select, insert, update, delete on table public.client_journey_steps to service_role;

create or replace function public.set_client_journey_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_journey_steps_updated_at on public.client_journey_steps;
create trigger client_journey_steps_updated_at
before update on public.client_journey_steps
for each row execute function public.set_client_journey_updated_at();

create or replace function public.sync_client_journey(p_client_id uuid, p_actor text default 'SYSTEM')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.crm_clients%rowtype;
  v_vos_status text;
  v_has_services boolean;
  v_count integer := 0;
  v_service record;
  v_step_status text;
  v_order integer := 100;
begin
  select * into v_client from public.crm_clients where id = p_client_id;
  if not found then
    raise exception 'client_not_found';
  end if;

  select exists(select 1 from public.crm_client_services where client_id = p_client_id)
    into v_has_services;

  insert into public.client_journey_steps (
    client_id, step_key, step_type, title, description, status, sequence_order,
    started_at, completed_at, source_type, visible_to_client, created_by, updated_by
  ) values (
    p_client_id, 'ENTRY', 'ENTRADA', 'Início da jornada com a YM',
    'Entrada do cliente na operação e início do acompanhamento.', 'CONCLUIDA', 10,
    coalesce(v_client.became_client_at, v_client.created_at), coalesce(v_client.became_client_at, v_client.created_at),
    'SISTEMA', true, p_actor, p_actor
  )
  on conflict (client_id, step_key) do update set
    title = excluded.title,
    description = excluded.description,
    status = excluded.status,
    sequence_order = excluded.sequence_order,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    source_type = excluded.source_type,
    visible_to_client = excluded.visible_to_client,
    updated_by = excluded.updated_by;
  v_count := v_count + 1;

  insert into public.client_journey_steps (
    client_id, step_key, step_type, title, description, status, sequence_order,
    started_at, completed_at, source_type, source_ref_id, visible_to_client, created_by, updated_by
  ) values (
    p_client_id, 'RAIOX', 'RAIOX', 'Raio-X Estratégico',
    case when v_client.source_intake_id is not null
      then 'Diagnóstico de entrada registrado e conectado à jornada.'
      when v_has_services then 'Etapa não registrada antes da contratação das soluções atuais.'
      else 'Etapa prevista, ainda não iniciada.' end,
    case when v_client.source_intake_id is not null then 'CONCLUIDA'
      when v_has_services then 'PULADA' else 'PLANEJADA' end,
    20,
    null,
    case when v_client.source_intake_id is not null then coalesce(v_client.became_client_at, v_client.created_at) else null end,
    'METODO_VOS', v_client.source_intake_id, true, p_actor, p_actor
  )
  on conflict (client_id, step_key) do update set
    title = excluded.title,
    description = excluded.description,
    status = excluded.status,
    sequence_order = excluded.sequence_order,
    completed_at = excluded.completed_at,
    source_type = excluded.source_type,
    source_ref_id = excluded.source_ref_id,
    visible_to_client = excluded.visible_to_client,
    updated_by = excluded.updated_by;
  v_count := v_count + 1;

  if v_client.source_case_id is not null then
    select status into v_vos_status from public.vos_cases where id = v_client.source_case_id;
  end if;

  v_step_status := case
    when v_client.source_case_id is null and v_has_services then 'PULADA'
    when v_client.source_case_id is null then 'PLANEJADA'
    when coalesce(v_vos_status, '') in ('CONCLUIDO','FINALIZADO','ENTREGUE') then 'CONCLUIDA'
    else 'EM_ANDAMENTO'
  end;

  insert into public.client_journey_steps (
    client_id, step_key, step_type, title, description, status, sequence_order,
    started_at, completed_at, source_type, source_ref_id, visible_to_client, metadata, created_by, updated_by
  ) values (
    p_client_id, 'MOTOR_VOS', 'MOTOR_VOS', 'Motor VOS',
    case
      when v_step_status = 'PULADA' then 'Etapa não realizada antes da contratação das soluções atuais; pode ser retomada quando fizer sentido.'
      when v_step_status = 'PLANEJADA' then 'Etapa prevista, ainda não iniciada.'
      when v_step_status = 'CONCLUIDA' then 'Diagnóstico interno concluído e conectado às decisões da jornada.'
      else 'Diagnóstico interno em construção para orientar as próximas decisões.'
    end,
    v_step_status, 30,
    case when v_client.source_case_id is not null then coalesce(v_client.became_client_at, v_client.created_at) else null end,
    case when v_step_status = 'CONCLUIDA' then now() else null end,
    'METODO_VOS', v_client.source_case_id, true,
    jsonb_build_object('vos_status', v_vos_status), p_actor, p_actor
  )
  on conflict (client_id, step_key) do update set
    title = excluded.title,
    description = excluded.description,
    status = excluded.status,
    sequence_order = excluded.sequence_order,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    source_type = excluded.source_type,
    source_ref_id = excluded.source_ref_id,
    visible_to_client = excluded.visible_to_client,
    metadata = excluded.metadata,
    updated_by = excluded.updated_by;
  v_count := v_count + 1;

  for v_service in
    select * from public.crm_client_services
    where client_id = p_client_id
    order by coalesce(start_date, created_at::date), created_at, id
  loop
    v_step_status := case v_service.status
      when 'CONCLUIDO' then 'CONCLUIDA'
      when 'PAUSADO' then 'PAUSADA'
      when 'CANCELADO' then 'PAUSADA'
      when 'CONTRATADO' then case when v_service.start_date is null or v_service.start_date <= current_date then 'EM_ANDAMENTO' else 'PLANEJADA' end
      else 'EM_ANDAMENTO'
    end;

    insert into public.client_journey_steps (
      client_id, step_key, step_type, title, description, status, sequence_order,
      started_at, completed_at, source_type, source_ref_id, visible_to_client, metadata, created_by, updated_by
    ) values (
      p_client_id, 'SERVICE_' || v_service.id::text, 'SOLUCAO', v_service.service_name,
      case when v_service.notes is not null and btrim(v_service.notes) <> '' then v_service.notes
        else 'Solução contratada e incorporada à jornada do cliente.' end,
      v_step_status, v_order,
      coalesce(v_service.start_date::timestamptz, v_service.created_at),
      case when v_step_status = 'CONCLUIDA' then coalesce(v_service.end_date::timestamptz, v_service.updated_at) else null end,
      'CONTRATO', v_service.id, true,
      jsonb_build_object('service_code', v_service.service_code, 'service_status', v_service.status),
      p_actor, p_actor
    )
    on conflict (client_id, step_key) do update set
      title = excluded.title,
      description = excluded.description,
      status = excluded.status,
      sequence_order = excluded.sequence_order,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at,
      source_type = excluded.source_type,
      source_ref_id = excluded.source_ref_id,
      visible_to_client = excluded.visible_to_client,
      metadata = excluded.metadata,
      updated_by = excluded.updated_by;
    v_count := v_count + 1;
    v_order := v_order + 10;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.set_client_journey_updated_at() from public, anon, authenticated;
revoke all on function public.sync_client_journey(uuid, text) from public, anon, authenticated;
grant execute on function public.sync_client_journey(uuid, text) to service_role;

do $$
declare
  v_client_id uuid;
begin
  for v_client_id in select id from public.crm_clients where status = 'ATIVO'
  loop
    perform public.sync_client_journey(v_client_id, 'MIGRATION_20260825113000');
  end loop;
end;
$$;

comment on table public.client_journey_steps is
  'Linha do tempo persistente da jornada do cliente, combinando método VOS, solicitações, contratos e marcos manuais.';
comment on function public.sync_client_journey(uuid, text) is
  'Sincroniza etapas canônicas da jornada sem apagar marcos manuais nem inventar a próxima etapa.';
