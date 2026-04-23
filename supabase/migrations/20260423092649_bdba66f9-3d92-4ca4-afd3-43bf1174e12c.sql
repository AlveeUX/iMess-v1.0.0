INSERT INTO public.members (name, phone, room) VALUES
  ('Rahim', '01711000001', 'A1'),
  ('Karim', '01711000002', 'A2'),
  ('Jamal', '01711000003', 'B1'),
  ('Salim', '01711000004', 'B2'),
  ('Tamim', '01711000005', 'C1');

INSERT INTO public.expenses (title, amount, category, date) VALUES
  ('Rice 25kg', 1750, 'bazar', CURRENT_DATE - 10),
  ('Vegetables', 850, 'bazar', CURRENT_DATE - 8),
  ('Chicken 3kg', 900, 'bazar', CURRENT_DATE - 6),
  ('Fish', 1200, 'bazar', CURRENT_DATE - 4),
  ('Oil & spices', 650, 'bazar', CURRENT_DATE - 2),
  ('Eggs & milk', 480, 'bazar', CURRENT_DATE - 1),
  ('Gas cylinder', 1400, 'gas', CURRENT_DATE - 7);

INSERT INTO public.deposits (member_id, amount, method, date)
SELECT id, 3000, 'cash', CURRENT_DATE - 12 FROM public.members;

INSERT INTO public.meals (member_id, date, meal_count)
SELECT m.id, d::date, (1 + floor(random()*2.5))::numeric(5,2)
FROM public.members m, generate_series(CURRENT_DATE - 12, CURRENT_DATE, '1 day'::interval) d;