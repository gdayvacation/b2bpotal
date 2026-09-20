-- Optional: fill sample cash_on_tour on Sep 18–20 mock bookings.
-- Run after seed-sep18-20-mock.sql (requires cash_on_tour column).

update public.bookings set cash_on_tour = '1,800 THB' where code = 'PP2609-0187';
update public.bookings set cash_on_tour = '2,400 THB' where code = 'PP2609-0216';
update public.bookings set cash_on_tour = '900 THB' where code = 'PP2609-0199';
update public.bookings set cash_on_tour = '1,500 THB' where code = 'JB2609-0183';
update public.bookings set cash_on_tour = '3,200 THB' where code = 'JB2609-0194';
update public.bookings set cash_on_tour = '2,000 THB' where code = 'PP2609-0192';
update public.bookings set cash_on_tour = '1,200 THB' where code = 'JB2609-0202';
