-- Allow SUV as a private transfer vehicle type (Car / SUV / Van).

alter table public.bookings
  drop constraint if exists bookings_private_transfer_vehicle_check;

alter table public.bookings
  add constraint bookings_private_transfer_vehicle_check
  check (private_transfer_vehicle in ('', 'Car', 'SUV', 'Van'));