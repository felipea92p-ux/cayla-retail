-- Categoría de gasto «Atención al personal» (ADR-0368, Felipe 2026-10-09).
--
-- El gasto rápido de Caja suma el botón «Refrigerio»: el café, el almuerzo o el agua de mesa DEL EQUIPO durante el turno (no de los
-- clientes: eso sería otra cuenta y otra decisión). Ninguna categoría existente calzaba: en Suministros (656) se mezclaba con bolsas y
-- lejía, y en Servicios básicos (636) con la luz. Va a la cuenta 62 · Gastos de personal, que ya está en el plan (20260924235000) y
-- que ninguna categoría usaba. NO es planilla: la planilla se sigue leyendo de Dynamic, y por eso el nombre dice «atención».
--
-- Una sola parte: solo inserta una fila en un catálogo (sin `alter`, sin políticas, sin disparadores). Idempotente.
-- Verificación en producción (debe devolver UNA fila: atencion_personal | 62 | true):
--   select codigo, cuenta_pcge, activo from retail.categorias_gasto where codigo = 'atencion_personal';

set lock_timeout = '3s';

insert into retail.categorias_gasto (codigo, nombre, ejemplos, cuenta_pcge, orden)
values ('atencion_personal', 'Atención al personal', 'Refrigerio, café o agua de mesa del equipo en el turno', '62', 11)
on conflict (codigo) do nothing;
