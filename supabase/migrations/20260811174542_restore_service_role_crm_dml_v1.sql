grant select, insert, update, delete on table public.crm_contacts to service_role;
grant select, insert, update, delete on table public.crm_opportunities to service_role;
grant select, insert, update, delete on table public.crm_stage_history to service_role;
grant select, insert, update, delete on table public.crm_activities to service_role;

revoke all on table public.crm_contacts from anon, authenticated;
revoke all on table public.crm_opportunities from anon, authenticated;
revoke all on table public.crm_stage_history from anon, authenticated;
revoke all on table public.crm_activities from anon, authenticated;
