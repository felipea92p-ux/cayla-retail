-- «Atención al personal» va a la cuenta 625, no a la 62 (ADR-0368, corrección del mismo día, 2026-10-09).
--
-- La migración 20261009235900 la puso en la 62 · Gastos de personal. Pero la 62 es la PLANILLA: el estado de resultados suma
-- todo lo de la 62 como «planilla» (`fn_estado_resultados`, `r.cta = '62'`, 20260925130000) y el presupuesto la deja fuera
-- a propósito porque la decide Dynamic. Un café del turno habría salido como sueldo. Lo atrapó «Pruebas de RPC contra Postgres»
-- (presupuesto G8 y G14) antes de fusionar.
-- En el PCGE, la 625 es justamente «Atención al personal», dentro de la 62 pero separada de las remuneraciones: aparece como su
-- propia línea de gastos de operación y se le puede poner un tope en el presupuesto, como a las bolsas.
--
-- Una sola parte: una fila en el plan de cuentas y un cambio de cuenta en una categoría (sin `alter`, políticas ni disparadores).
-- Idempotente. Un gasto no guarda su cuenta (la saca de su categoría), así que lo que ya se haya registrado se mueve solo a la 625.
-- Verificación (una fila: atencion_personal | 625 | Atención al personal | gastos_operacion):
--   select c.codigo, c.cuenta_pcge, k.nombre, k.seccion_resultados
--     from retail.categorias_gasto c join retail.cuentas k on k.codigo = c.cuenta_pcge where c.codigo = 'atencion_personal';

set lock_timeout = '3s';

insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden)
values ('625', 'Atención al personal', 'gasto', 'gastos_operacion', 31)
on conflict (codigo) do nothing;

update retail.categorias_gasto
   set cuenta_pcge = '625'
 where codigo = 'atencion_personal' and cuenta_pcge = '62';
