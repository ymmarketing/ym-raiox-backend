grant select on table public.vos_internal_access to service_role;
grant insert, select on table public.vos_access_audit to service_role;
grant select on table public.raiox_intakes to service_role;
grant select on table public.vos_cases to service_role;
grant select on table public.vos_gates to service_role;
grant execute on function public.vos_create_case_from_intake(uuid,text) to service_role;
grant execute on function public.vos_get_case_bundle(uuid) to service_role;
