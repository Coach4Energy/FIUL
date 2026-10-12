-- FIUL · Borra la cuenta de prueba de Juanba (ficha, plan, mediciones y registros).
-- Después, borrar también el usuario juanba+prueba@coach4energy.com en Authentication → Users.
delete from public.clientes where email = 'juanba+prueba@coach4energy.com';
