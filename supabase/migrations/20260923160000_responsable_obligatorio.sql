-- ============================================================================
-- 20260923160000_responsable_obligatorio.sql — CAYLA V2 (ADR-0161/0162)
--
-- QUÉ HACE. El interruptor `fn_exige_responsable()` deja de ser código (`select false`) y pasa a ser un DATO:
-- la columna `configuracion_empresa.exige_responsable` (una sola fila, la de la empresa), apagada por defecto.
-- Encendida, una PERSONA ya no puede guardar una operación de tienda sin elegir el responsable del combo: la
-- base responde «Elige quién hace esta operación» (42501, hint `responsable_requerido`), igual que ya hacía
-- con las terminales. Las terminales lo exigen siempre, con o sin interruptor.
--
-- DECISIÓN DE FELIPE (2026-09-23): «Todas obligatorias, un mismo flujo para todos; si nadie marcó asistencia
-- no se podrá vender». Las tres tiendas a la vez, sin excepción para el líder. Se le advirtió que en una tienda
-- donde nadie marcó entrada en Dynamic no se puede guardar nada (ese día: 0 marcados en Arequipa y en Lima, y
-- Lima sin asistencia cargada) y lo aceptó.
--
-- POR QUÉ UN DATO Y NO UN `create or replace ... select true` (decisión técnica):
--   1. Se apaga en segundos si una mañana una tienda queda trabada:
--        update retail.configuracion_empresa set exige_responsable = false;
--      sin escribir ni pegar una migración a las 9 de la mañana.
--   2. La base local y la del CI arrancan apagadas (valor por defecto): las pruebas que operan como persona sin
--      encabezado siguen probando lo que prueban. La prueba del interruptor lo enciende dentro de su transacción.
--
-- CÓMO SE ENCIENDE EN PRODUCCIÓN (después de publicar la web que manda el responsable en TODAS las pantallas):
--   update retail.configuracion_empresa set exige_responsable = true;
-- Encenderlo antes rompe las pantallas que todavía no mandan el combo (anular venta, aprobar devolución, …).
--
-- Re-ejecutable. En el repo sin prefijo; al pegar en el SQL Editor de producción, empezar con
-- `set search_path to retail, public, extensions;`.
-- ============================================================================

set search_path = retail, public, extensions;

alter table configuracion_empresa
  add column if not exists exige_responsable boolean not null default false;

comment on column configuracion_empresa.exige_responsable is
  'ADR-0161/0162: ¿toda operación de tienda de una PERSONA exige elegir el responsable del combo? Las terminales lo exigen siempre. Apagarlo en una emergencia: update retail.configuracion_empresa set exige_responsable = false.';

-- Security definer: la lee cualquier sesión que guarda, sin depender de la RLS de la tabla. Sin fila → apagado.
create or replace function fn_exige_responsable() returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select coalesce((select c.exige_responsable from retail.configuracion_empresa c limit 1), false);
$$;

comment on function fn_exige_responsable() is
  'ADR-0161/0162 (20260923160000): ¿una PERSONA debe mandar x-responsable en las operaciones de tienda? Lo decide configuracion_empresa.exige_responsable (apagado por defecto). Las terminales lo exigen siempre, sin mirar esto.';

revoke all on function fn_exige_responsable() from public, anon;
grant execute on function fn_exige_responsable() to authenticated, service_role;
