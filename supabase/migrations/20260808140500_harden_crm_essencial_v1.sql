alter table public.crm_opportunities
add constraint crm_route_stage_requires_human_check
check ((current_stage <> 'ROTA_RECOMENDADA') or (recommended_route is not null and route_validated_by is not null and route_validated_at is not null));

comment on constraint crm_route_stage_requires_human_check on public.crm_opportunities is 'ROTA_RECOMENDADA só existe após validação humana explícita.';

alter function public.crm_touch_updated_at() set search_path=public;
alter function public.crm_track_stage_change() set search_path=public;
