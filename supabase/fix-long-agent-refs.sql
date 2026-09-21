-- Shorten unrealistically long / combined voucher numbers for UI testing.
-- Real partner refs are typically short (e.g. GDV-13622, ABC-4821).
-- Safe to re-run.

update public.bookings
set agent_ref = case agent_slug
  when 'abc-travel' then 'ABC-' || right(regexp_replace(code, '\D', '', 'g'), 4)
  when 'mumbai-holidays' then 'MH-' || right(regexp_replace(code, '\D', '', 'g'), 4)
  when 'delhi-travel' then 'DT-' || right(regexp_replace(code, '\D', '', 'g'), 4)
  when 'golden-triangle' then 'GT-' || right(regexp_replace(code, '\D', '', 'g'), 4)
  else 'GDV-' || right(regexp_replace(code, '\D', '', 'g'), 4)
end
where length(coalesce(agent_ref, '')) > 12
   or position('/' in coalesce(agent_ref, '')) > 0;
