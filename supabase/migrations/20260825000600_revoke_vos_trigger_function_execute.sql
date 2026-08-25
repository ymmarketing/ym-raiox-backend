-- Trigger functions are invoked by Postgres and must not be callable through the API.
revoke all on function public.vos_enforce_hypothesis_validation() from public, anon, authenticated;
revoke all on function public.vos_require_ver_gate_for_order() from public, anon, authenticated;

grant execute on function public.vos_enforce_hypothesis_validation() to service_role;
grant execute on function public.vos_require_ver_gate_for_order() to service_role;
