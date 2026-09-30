-- Prospecção manual: checagem e criação na mesma transação. Apenas service_role.
create or replace function public.crm_researched_prospect(
  p_mode text, p_business text, p_name text, p_email text, p_phone text,
  p_segment text, p_source_url text, p_researched_on date,
  p_signal text, p_hypothesis text, p_next_action text,
  p_due_at timestamptz, p_actor text
) returns jsonb
language plpgsql security invoker set search_path=public
as $$
declare
  v_business text:=trim(coalesce(p_business,''));
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_phone text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  v_matches jsonb; v_contact uuid; v_opp uuid;
begin
  if p_mode not in ('CHECK','CREATE') then raise exception 'Modo inválido'; end if;
  if length(v_business)<2 then raise exception 'Empresa obrigatória'; end if;
  -- Serializa verificações da mesma empresa; a checagem é repetida na criação.
  perform pg_advisory_xact_lock(hashtextextended(lower(v_business),91827));
  select coalesce(jsonb_agg(jsonb_build_object(
    'contact_id',c.id,'business_name',c.business_name,'name',c.name,
    'opportunity_id',o.id,'archived',o.archived_at is not null,
    'stage',o.current_stage) order by c.created_at desc), '[]'::jsonb)
    into v_matches
  from public.crm_contacts c
  left join lateral (
    select id,archived_at,current_stage from public.crm_opportunities
    where contact_id=c.id order by created_at desc limit 1
  ) o on true
  where (c.business_name is not null and lower(regexp_replace(trim(c.business_name),'\s+',' ','g'))=lower(regexp_replace(v_business,'\s+',' ','g')))
     or (v_email<>'' and lower(trim(coalesce(c.email,'')))=v_email)
     or (length(v_phone)>=8 and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=v_phone);
  if p_mode='CHECK' or jsonb_array_length(v_matches)>0 then
    return jsonb_build_object('created',false,'matches',v_matches);
  end if;
  if length(trim(coalesce(p_actor,'')))<3 then raise exception 'Responsável obrigatório'; end if;
  if p_source_url !~* '^https?://[^[:space:]]+\.[^[:space:]]+' or length(p_source_url)>1500 then raise exception 'URL pública inválida'; end if;
  if p_researched_on is null or p_researched_on>current_date then raise exception 'Data da pesquisa inválida'; end if;
  if length(trim(coalesce(p_signal,'')))<10 then raise exception 'Descreva um fato público observado'; end if;
  if length(trim(coalesce(p_hypothesis,'')))<10 then raise exception 'Descreva uma hipótese a validar'; end if;
  if length(trim(coalesce(p_next_action,'')))<5 then raise exception 'Próxima ação obrigatória'; end if;
  insert into public.crm_contacts(name,business_name,email,phone,segment,source,owner_email,
    research_source,public_signal,opportunity_to_validate,lead_class,lead_confidence,source_payload)
  values(nullif(trim(p_name),''),v_business,nullif(v_email,''),nullif(trim(p_phone),''),
    nullif(trim(p_segment),''),'PESQUISA_ICP',p_actor,p_source_url,trim(p_signal),
    trim(p_hypothesis),'ICP_A_VALIDAR','HIPOTESE',
    jsonb_build_object('research_date',p_researched_on,'source_url',p_source_url,'research_type','MANUAL'))
  returning id into v_contact;
  insert into public.crm_opportunities(contact_id,current_stage,owner_email,updated_by,notes,next_action,next_action_due_at)
  values(v_contact,'LEAD_MAPEADO',p_actor,p_actor,'Pesquisa pública; hipótese ainda não validada.',
    trim(p_next_action),p_due_at) returning id into v_opp;
  insert into public.crm_stage_history(opportunity_id,from_stage,to_stage,reason,changed_by)
  values(v_opp,null,'LEAD_MAPEADO','Pesquisa ICP com fonte pública e revisão humana.',p_actor);
  return jsonb_build_object('created',true,'contact_id',v_contact,'opportunity_id',v_opp,'matches','[]'::jsonb);
end;$$;
revoke all on function public.crm_researched_prospect(text,text,text,text,text,text,text,date,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.crm_researched_prospect(text,text,text,text,text,text,text,date,text,text,text,timestamptz,text) to service_role;
