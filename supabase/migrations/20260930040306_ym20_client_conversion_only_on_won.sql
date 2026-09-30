-- A compra do diagnóstico digital não inicia automaticamente contrato de consultoria.
-- O serviço Digital permanece em cobrança/intake/relatório; registros legados são preservados.
create or replace function public.crm_apply_stage_side_effects()
returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if new.current_stage<>'GANHO' then return new; end if;
  insert into public.crm_clients(
    contact_id,source_opportunity_id,status,source_intake_id,source_case_id,updated_by
  ) values (
    new.contact_id,new.id,'ATIVO',new.source_intake_id,new.source_case_id,
    coalesce(nullif(new.updated_by,''),'SYSTEM')
  )
  on conflict (contact_id) do update set
    source_opportunity_id=coalesce(public.crm_clients.source_opportunity_id,excluded.source_opportunity_id),
    source_intake_id=coalesce(public.crm_clients.source_intake_id,excluded.source_intake_id),
    source_case_id=coalesce(public.crm_clients.source_case_id,excluded.source_case_id),
    updated_at=now(),
    updated_by=excluded.updated_by;
  return new;
end;$$;
revoke all on function public.crm_apply_stage_side_effects() from public,anon,authenticated;
grant execute on function public.crm_apply_stage_side_effects() to service_role;
