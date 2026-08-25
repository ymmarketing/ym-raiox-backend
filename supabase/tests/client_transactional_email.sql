begin;

select plan(10);

select has_column('public', 'client_calendar_events', 'status', 'calendar event status exists');
select has_column('public', 'client_calendar_events', 'cancelled_at', 'calendar cancellation timestamp exists');
select has_column('public', 'client_calendar_events', 'cancellation_reason', 'calendar cancellation reason exists');
select has_column('public', 'client_calendar_events', 'cancelled_by_email', 'calendar cancellation actor exists');
select has_table('public', 'client_email_deliveries', 'transactional email audit table exists');
select has_pk('public', 'client_email_deliveries', 'email delivery audit has a primary key');
select col_is_unique('public', 'client_email_deliveries', array['idempotency_key'], 'email delivery idempotency keys are unique');
select has_index('public', 'client_email_deliveries', 'client_email_deliveries_client_created_idx', 'client email history index exists');
select has_index('public', 'client_email_deliveries', 'client_email_deliveries_resource_idx', 'resource lookup index exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.client_email_deliveries'::regclass),
  true,
  'email delivery audit has row level security enabled'
);

select * from finish();
rollback;
