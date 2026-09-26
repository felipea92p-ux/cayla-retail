-- ============================================================================
-- ADR-0126 (parte B de 2) — Las tablas de dinero de Compras y el bucket de escaneos: solo el líder.
--
-- QUÉ HACE. Cierra la lectura DIRECTA (por la API, sin pasar por ninguna pantalla) de lo que tiene
-- montos: `compras` (totales, IGV, pagado, saldo, notas de crédito), `compra_items` (costo por línea),
-- `compra_pagos` (cada pago), `compra_adjuntos` (los escaneos de las facturas), `compra_notas_credito`
-- (cada nota) y el bucket de Storage `retail-compras-adjuntos`. Desde ADR-0075 las leía cualquier
-- colaborador de la sede; ahora solo quien pasa `fn_puede_ver_dinero_de_compras()` (el líder, de
-- cualquier sede — así que para el líder no cambia nada).
--
-- LO QUE NO SE TOCA.
--   · Las vistas `compras_resumen` y `compra_items_resumen` siguen siendo `security_invoker`: heredan
--     estas políticas solas (un integrante las ve VACÍAS; el líder, completas). No se vuelven
--     `security definer`: una vista así es una puerta de escritura si alguien le deja un GRANT.
--   · `recibir_compras`, `recibir_envio`, `recibir_lote`, `listar_recepciones_compras`, etc. son
--     `security definer` y siguen leyendo lo que necesitan: un integrante recibe igual que antes.
--   · `compra_item_cierres` (cantidad y motivo de un cierre, sin dinero) conserva su política; como
--     se apoya en `compra_items`/`compras`, un integrante deja de leerla directo — para recibir no la
--     necesita (`lineas_compra_operativo` ya trae `cerrado`).
--
-- ORDEN — IMPORTANTE. Se pega DESPUÉS de `20260919160000_dinero_de_compras_lectura_operativa.sql` y
-- DESPUÉS de desplegar la app que usa `listar_compras_operativo` / `lineas_compra_operativo`.
-- Si se pega antes, un integrante vería VACÍA la lista de lo que hay que recibir hasta que se
-- despliegue. Por eso esta migración se niega a correr si la A no está (primer bloque).
--
-- PARA PEGAR EN PRODUCCIÓN: ya trae `set search_path`; no hace falta el prefijo `retail.`.
-- Las políticas de `storage.objects` las crea el mismo rol que ya creó las de este bucket
-- (`20260914180000_compras_adjuntos.sql`), así que se pegan igual en el SQL Editor.
-- ============================================================================

set search_path = retail, public, extensions;

-- 0. Sin la parte A, cerrar las tablas dejaría a un integrante sin ver lo que tiene que recibir.
do $$
begin
  if to_regprocedure('retail.fn_puede_ver_dinero_de_compras()') is null
     or to_regprocedure('retail.listar_compras_operativo(integer, date, timestamp with time zone, uuid, text, uuid, text, boolean, date, date, text)') is null
     or to_regprocedure('retail.lineas_compra_operativo(uuid[])') is null then
    raise exception 'Pega primero 20260919160000_dinero_de_compras_lectura_operativa.sql: sin sus funciones, un integrante se quedaría sin ver lo que tiene que recibir.';
  end if;
end;
$$;

-- 1. Las tablas: de «mi sede» (ADR-0075) a «el líder».
drop policy if exists compras_select on retail.compras;
create policy compras_select on retail.compras
  for select using (retail.fn_puede_ver_dinero_de_compras());

drop policy if exists compra_items_select on retail.compra_items;
create policy compra_items_select on retail.compra_items
  for select using (retail.fn_puede_ver_dinero_de_compras());

drop policy if exists compra_pagos_select on retail.compra_pagos;
create policy compra_pagos_select on retail.compra_pagos
  for select using (retail.fn_puede_ver_dinero_de_compras());

drop policy if exists compra_adjuntos_select on retail.compra_adjuntos;
create policy compra_adjuntos_select on retail.compra_adjuntos
  for select using (retail.fn_puede_ver_dinero_de_compras());

drop policy if exists compra_notas_credito_select on retail.compra_notas_credito;
create policy compra_notas_credito_select on retail.compra_notas_credito
  for select using (retail.fn_puede_ver_dinero_de_compras());

-- 2. El bucket de escaneos de facturas: hasta hoy cualquier usuario con sesión podía listar y bajar
--    todo lo que hubiera (0 archivos al 2026-09-19, así que no se ha filtrado nada; pero el primero
--    que se subiera habría quedado a la vista de todos). Subir sigue como estaba.
drop policy if exists retail_compras_adjuntos_select on storage.objects;
create policy retail_compras_adjuntos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'retail-compras-adjuntos' and retail.fn_puede_ver_dinero_de_compras());

-- ----------------------------------------------------------------------------
-- Cómo mirar que quedó bien (en el SQL Editor):
--   select tablename, policyname, qual from pg_policies
--    where schemaname = 'retail' and tablename in ('compras','compra_items','compra_pagos','compra_adjuntos','compra_notas_credito')
--      and cmd = 'SELECT';                          -- 5 filas, todas con fn_puede_ver_dinero_de_compras()
--   select policyname, qual from pg_policies
--    where schemaname = 'storage' and policyname = 'retail_compras_adjuntos_select';   -- con el candado
-- ----------------------------------------------------------------------------
