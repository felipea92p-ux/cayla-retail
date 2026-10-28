-- ============================================================================
-- 20261015112000_orden_insumo_lotes_columnas_legibles.sql — CAYLA V2 · ADR-0362, fase 7 parte 2 (corrección que pidió el CI el
-- 2026-10-15). Va después de 20261015035000_orden_insumo_recepcion_esquema.sql.
--
-- EL PROBLEMA PRIMERO. `insumo_lotes` tiene el candado de dinero del Taller (ADR-0126; ADR-0133 F4e, 20260921151000): `authenticated` la
-- lee columna por columna, todas menos `costo_unitario`, y una columna nueva nace sin poder leerse. La 20261015035000 sumó
-- `orden_insumo_item_id` y `orden_insumo_recepcion_id` sin abrirlas, y la guardia de `pnpm pruebas:candado-dinero-produccion` (caso 6,
-- «toda columna que no es de dinero es legible») lo marcó en el CI. Ninguna pantalla las lee directo (las leen funciones `security
-- definer`), así que nada se rompió; pero la regla del candado es que se lee todo lo que no es dinero.
--
-- QUÉ HACE. Da SELECT de esas dos columnas a `authenticated`, como se hizo con `token_cliente` en 20260924130000: no son dinero (dicen de
-- qué línea de la orden y de qué recepción sale el lote). Solo si la tabla usa permisos por columna: si `authenticated` ya lee la tabla
-- entera, no hace falta nada.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una parte. Sin tablas, sin políticas, sin `drop trigger` (ADR-0195) y sin
-- `select … into` dentro de textos entre comillas (ADR-0288). Re-ejecutable: se puede pegar dos veces. El bloque final comprueba que
-- quedó y que el costo sigue cerrado.
-- ============================================================================

set lock_timeout = '3s';

do $$
begin
  if not has_table_privilege('authenticated', 'retail.insumo_lotes', 'select')
     and exists (select 1 from information_schema.column_privileges
                  where table_schema = 'retail' and table_name = 'insumo_lotes' and grantee = 'authenticated' and privilege_type = 'SELECT') then
    grant select (orden_insumo_item_id, orden_insumo_recepcion_id) on retail.insumo_lotes to authenticated;
  end if;
end;
$$;

reset lock_timeout;

-- Comprobación: si algo no quedó, el pegado falla y no se aplica nada.
do $$
begin
  if not has_column_privilege('authenticated', 'retail.insumo_lotes', 'orden_insumo_item_id', 'select')
     or not has_column_privilege('authenticated', 'retail.insumo_lotes', 'orden_insumo_recepcion_id', 'select') then
    raise exception 'las columnas de la orden en insumo_lotes siguen sin poder leerse';
  end if;
  if has_column_privilege('authenticated', 'retail.insumo_lotes', 'costo_unitario', 'select') then
    raise exception 'el costo de los lotes quedó a la vista: el candado de dinero del Taller se rompió';
  end if;
end;
$$;
