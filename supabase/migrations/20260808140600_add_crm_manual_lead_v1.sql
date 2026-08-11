create or replace function public.crm_create_manual_lead(
  p_name text,p_business_name text,p_email text,p_phone text,p_source text,p_actor text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_contact uuid; v_opp uuid;
begin
  if coalesce(trim(p_actor),'')='' then raise exception 'Responsável é obrigatório'; end if;
  if coalesce(trim(p_name),'')='' and coalesce(trim(p_business_name),'')='' then raise exception 'Nome ou negócio é obrigatório'; end if;
  insert into public.crm_contacts(name,business_name,email,phone,source,owner_email)
  values(nullif(trim(p_name),''),nullif(trim(p_business_name),''),nullif(trim(p_email),''),nullif(trim(p_phone),''),coalesce(nullif(trim(p_source),''),'MANUAL'),p_actor)
  returning id into v_contact;
  insert into public.crm_opportunities(contact_id,current_stage,owner_email,updated_by,notes)
  values(v_contact,'LEAD_MAPEADO',p_actor,p_actor,'Lead criado manualmente no CRM Essencial YM.') returning id into v_opp;
  insert into public.crm_stage_history(opportunity_id,from_stage,to_stage,reason,changed_by)
  values(v_opp,null,'LEAD_MAPEADO','Entrada manual no CRM.',p_actor);
  return v_opp;
end;$$;
revoke execute on function public.crm_create_manual_lead(text,text,text,text,text,text) from public,anon,authenticated;
