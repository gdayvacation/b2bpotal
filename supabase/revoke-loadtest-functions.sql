-- Load-test helpers are service-role only. Safe to re-run.
revoke execute on function public.loadtest_assign_boat(text, integer) from public, anon, authenticated;
revoke execute on function public.loadtest_board_snapshot(date) from public, anon, authenticated;
revoke execute on function public.loadtest_cleanup() from public, anon, authenticated;
revoke execute on function public.loadtest_guest_check_in(text) from public, anon, authenticated;
revoke execute on function public.loadtest_setup(integer, date) from public, anon, authenticated;
grant execute on function public.loadtest_assign_boat(text, integer) to service_role;
grant execute on function public.loadtest_board_snapshot(date) to service_role;
grant execute on function public.loadtest_cleanup() to service_role;
grant execute on function public.loadtest_guest_check_in(text) to service_role;
grant execute on function public.loadtest_setup(integer, date) to service_role;
