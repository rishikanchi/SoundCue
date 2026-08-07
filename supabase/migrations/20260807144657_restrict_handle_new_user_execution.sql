-- This trigger function runs only when auth.users inserts a row. Keep it out of
-- the Data API so clients cannot invoke its SECURITY DEFINER privileges as RPC.
revoke all on function public.handle_new_user() from public, anon, authenticated;
