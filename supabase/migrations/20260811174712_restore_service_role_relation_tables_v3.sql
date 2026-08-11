grant select, insert, update, delete on table public.vos_entry_evidence to service_role;
grant select, insert, update, delete on table public.vos_test_evidence to service_role;
revoke all on table public.vos_entry_evidence from anon, authenticated;
revoke all on table public.vos_test_evidence from anon, authenticated;
