create or replace function public.crm_prepare_stage_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.current_stage in ('GANHO','PERDIDO','DESQUALIFICADO') and new.closing_date is null then
    new.closing_date := current_date;
  end if;

  if new.current_stage='GANHO' and new.won_at is null then
    new.won_at := coalesce(new.closing_date::timestamptz, now());
  end if;

  if new.current_stage='PERDIDO' and new.lost_at is null then
    new.lost_at := coalesce(new.closing_date::timestamptz, now());
  end if;

  return new;
end;
$function$;

create or replace function public.crm_apply_stage_side_effects()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_client_id uuid;
  v_service_id uuid;
begin
  if new.current_stage not in ('RAIOX_PAGO','RAIOX_ENTREGUE','GANHO') then
    return new;
  end if;

  insert into public.crm_clients(
    contact_id, source_opportunity_id, status, source_intake_id, source_case_id, updated_by
  ) values (
    new.contact_id, new.id, 'ATIVO', new.source_intake_id, new.source_case_id,
    coalesce(nullif(new.updated_by,''),'SYSTEM')
  )
  on conflict (contact_id) do update set
    source_opportunity_id = coalesce(public.crm_clients.source_opportunity_id, excluded.source_opportunity_id),
    source_intake_id = coalesce(public.crm_clients.source_intake_id, excluded.source_intake_id),
    source_case_id = coalesce(public.crm_clients.source_case_id, excluded.source_case_id),
    updated_at = now(),
    updated_by = excluded.updated_by
  returning id into v_client_id;

  if new.current_stage in ('RAIOX_PAGO','RAIOX_ENTREGUE') then
    select id into v_service_id
    from public.crm_client_services
    where client_id=v_client_id
      and opportunity_id=new.id
      and service_code in ('RAIOX_ESTRATEGICO','RAIO_X_ESTRATEGICO')
    order by case when service_code='RAIOX_ESTRATEGICO' then 0 else 1 end
    limit 1;

    if v_service_id is null then
      insert into public.crm_client_services(
        client_id, opportunity_id, service_code, service_name, service_type, status,
        start_date, end_date, updated_by
      ) values (
        v_client_id, new.id, 'RAIOX_ESTRATEGICO', 'Raio-X Estratégico', 'AVULSO',
        case when new.current_stage='RAIOX_ENTREGUE' then 'CONCLUIDO' else 'EM_EXECUCAO' end,
        current_date,
        case when new.current_stage='RAIOX_ENTREGUE' then current_date else null end,
        coalesce(nullif(new.updated_by,''),'SYSTEM')
      ) returning id into v_service_id;
    elsif new.current_stage='RAIOX_ENTREGUE' then
      update public.crm_client_services
      set status='CONCLUIDO',
          end_date=coalesce(end_date,current_date),
          updated_at=now(),
          updated_by=coalesce(nullif(new.updated_by,''),'SYSTEM')
      where id=v_service_id;
    elsif new.current_stage='RAIOX_PAGO' then
      update public.crm_client_services
      set status=case when status='CONCLUIDO' then status else 'EM_EXECUCAO' end,
          updated_at=now(),
          updated_by=coalesce(nullif(new.updated_by,''),'SYSTEM')
      where id=v_service_id;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_crm_sync_stage_side_effects on public.crm_opportunities;
drop trigger if exists trg_crm_prepare_stage_fields on public.crm_opportunities;
drop trigger if exists trg_crm_apply_stage_side_effects on public.crm_opportunities;

create trigger trg_crm_prepare_stage_fields
before insert or update on public.crm_opportunities
for each row
execute function public.crm_prepare_stage_fields();

create trigger trg_crm_apply_stage_side_effects
after insert or update on public.crm_opportunities
for each row
execute function public.crm_apply_stage_side_effects();

revoke all on function public.crm_prepare_stage_fields() from public, anon, authenticated;
revoke all on function public.crm_apply_stage_side_effects() from public, anon, authenticated;
grant execute on function public.crm_prepare_stage_fields() to service_role;
grant execute on function public.crm_apply_stage_side_effects() to service_role;

drop function if exists public.crm_sync_stage_side_effects();
