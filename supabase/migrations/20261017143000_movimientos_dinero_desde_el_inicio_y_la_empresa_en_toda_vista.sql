-- ============================================================================
-- 20261017143000_movimientos_dinero_desde_el_inicio_y_la_empresa_en_toda_vista.sql — CAYLA V2
-- (ADR-0417, actualización 2026-10-17; los dos hallazgos de /chaos del 2026-10-16 sobre «Registrar movimiento»)
--
-- EL PROBLEMA PRIMERO. /chaos del 2026-10-16 (semilla 1016) sobre la hoja «Registrar movimiento» de Finanzas ▸ Cuentas y dinero, con los
-- tipos nuevos `pago_planilla` y `pago_sunat` (ADR-0417), dejó dos hallazgos de gravedad 2: un dato malo o invisible en silencio. La web
-- ya los frena o avisa (commit 9b4575544 de la rama de revisiones); esta migración es su mitad en la base, la que vale también por la API:
--   1. `registrar_movimiento_dinero` acepta cualquier fecha pasada: un pago de planilla con fecha 1900-01-01 se guardaba y quedaba en
--      un mes que ningún reporte mira (Finanzas cuenta desde `parametros_finanzas.inicio_finanzas`, ADR-0332). `registrar_gasto` tiene
--      ese piso desde ADR-0412 (`gasto_antes_del_inicio`, 20261015003000); un movimiento de dinero no lo tenía.
--   2. `fn_movimientos_dinero(p_ubicacion_id, p_limite)` filtra `d.ubicacion_id = p_ubicacion_id` cuando el líder mira una tienda, y lo
--      de la empresa no aparece en ninguna lista salvo en «Todas las tiendas». «De la empresa» es todo movimiento sin tienda: el
--      disparador deja `ubicacion_id` nulo cuando ni la cuenta de origen ni la de destino son de una tienda —el pago de la planilla, el
--      pago a SUNAT, una transferencia entre bancos, el pago de la tarjeta, la plata del dueño que entra o sale de un banco—. Registrado
--      mirando Trujillo, el pago bajaba el saldo del banco, que SÍ se ve en toda tienda («los bancos son de CAYLA entera», dice la
--      pantalla), y el movimiento que explica esa bajada no estaba.
--
-- CONTRATO (Liskov)
--   PROMETE: (1) `registrar_movimiento_dinero` rechaza una fecha anterior al inicio de Finanzas con el mismo mensaje que un gasto
--            (`P0001`, pista `movimiento_antes_del_inicio`); sin inicio elegido no frena nada, como el gasto. Es la fecha que la persona
--            escribió: la de un egreso del cajón ya registrado la sigue poniendo la caja. (2) Para quien ve Finanzas de todo (el líder),
--            la lista de UNA tienda trae además los movimientos sin tienda; «Todas» no cambia; quien no es líder ve exactamente lo mismo
--            que antes (solo lo de su tienda, y solo con el módulo).
--   ASUME:   `fn_finanzas_desde()` (20261004190000) y las dos funciones vivas con el texto que anclan los reemplazos.
--   NO HACE: no toca filas, tablas ni políticas; no cambia quién puede anular qué.
--
-- CÓMO. Reemplazos ANCLADOS sobre las funciones vivas (el patrón de 20261015003000 y 20261016002000): cada uno aborta sin tocar nada
-- si su ancla no aparece exactamente una vez, y no hace nada si su marca ya está. Las anclas son texto de la migración ORIGINAL
-- (20260925110000) que ningún parche posterior toca: la 182000, la 235000 y la 145000 anclan el `puede_anular` de la lista, no su
-- `where`; la 003000 y la 002000 anclan el token y la lista de tipos de la puerta, no su fecha. Los bloques se SUMAN sin partir el texto
-- que otra migración dejó (la regla de la 183000). Sin políticas, sin `alter`. Idempotente: pegarla dos veces no cambia nada.
-- Verificado: `scripts/pruebas/movimientos_dinero_inicio_y_empresa.mjs`.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Inserta `p_bloque` antes de la primera aparición de `p_ancla`, que tiene que aparecer exactamente `p_veces` veces.
-- Si `p_marca` ya está en la función, no hace nada. (La misma pieza de 20261015003000.)
create or replace function pg_temp.insertar_antes(p_firma text, p_ancla text, p_veces integer, p_bloque text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_ancla, v_n;
  end if;
  execute overlay(v_def placing p_bloque || p_ancla from position(p_ancla in v_def) for length(p_ancla));
end;
$f$;

-- Reemplaza `p_viejo` por `p_nuevo` en una función viva; si `p_nuevo` ya está, no hace nada. (La misma pieza de 20261016002000.)
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. La puerta: un movimiento anterior al inicio de Finanzas no entra ----------
-- Va justo antes del candado de la fecha futura, sobre la fecha que la persona escribió (`v_fecha`): la de un egreso del cajón ya
-- registrado la pone la caja más abajo y no pasa por aquí (como el gasto de una factura de Compras, ADR-0412).
select pg_temp.insertar_antes(
  'retail.registrar_movimiento_dinero(text, numeric, uuid, uuid, date, text, numeric, uuid, uuid, uuid)',
  $v$  if v_fecha > v_hoy then$v$, 1,
  $v$  -- Finanzas cuenta desde su inicio (ADR-0332): un movimiento anterior no entraría a ningún reporte. El mismo piso que el gasto
  -- (ADR-0412), sobre la fecha que la persona escribió; la de un egreso del cajón la pone la caja (ADR-0417 act. 2026-10-17).
  if v_fecha < retail.fn_finanzas_desde() then
    raise exception 'Finanzas cuenta desde el %: un movimiento anterior no entraría a ningún reporte. Si lo pagaste ahora, ponle la fecha del pago.',
      to_char(retail.fn_finanzas_desde(), 'DD/MM/YYYY')
      using errcode = 'P0001', hint = 'movimiento_antes_del_inicio';
  end if;
$v$,
  $v$movimiento_antes_del_inicio$v$);

-- ---------- 2. La lista: el líder ve lo de la empresa desde cualquier tienda ----------
select pg_temp.reemplazar('retail.fn_movimientos_dinero(uuid, integer)',
$v$   where (v_lider and (p_ubicacion_id is null or d.ubicacion_id = p_ubicacion_id))$v$,
$n$   -- Lo de la empresa (sin tienda: la planilla, SUNAT, entre bancos, la tarjeta, la plata del dueño) se ve desde cualquier tienda,
   -- como los bancos por donde pasa; quien no es líder sigue viendo solo lo de su tienda (ADR-0417 act. 2026-10-17).
   where (v_lider and (p_ubicacion_id is null or d.ubicacion_id = p_ubicacion_id or d.ubicacion_id is null))$n$,
1);

comment on function retail.fn_movimientos_dinero(uuid, integer) is
  'Los movimientos de dinero que ve la cuenta (ADR-0195 F3). El líder: los de la tienda pedida más los de la empresa (sin tienda: planilla, SUNAT, entre bancos, tarjeta, plata del dueño), o todos sin tienda pedida. Con el módulo y sin ser líder: solo los de su tienda. `puede_anular` dice si esa cuenta puede anular cada uno.';

-- ---------- 3. Que quedó como se prometió ----------
do $$
declare
  v_r text := pg_get_functiondef('retail.registrar_movimiento_dinero(text, numeric, uuid, uuid, date, text, numeric, uuid, uuid, uuid)'::regprocedure);
  v_m text := pg_get_functiondef('retail.fn_movimientos_dinero(uuid, integer)'::regprocedure);
begin
  if (length(v_r) - length(replace(v_r, 'movimiento_antes_del_inicio', ''))) / length('movimiento_antes_del_inicio') <> 1
     or position($x$  if v_fecha < retail.fn_finanzas_desde() then$x$ in v_r) = 0
     or position($x$  if v_fecha < retail.fn_finanzas_desde() then$x$ in v_r) > position($x$  if v_fecha > v_hoy then$x$ in v_r) then
    raise exception 'ADR-0417 (2026-10-17): registrar_movimiento_dinero no quedó con el piso de fecha antes del candado de la fecha futura';
  end if;
  if position($x$or d.ubicacion_id = p_ubicacion_id or d.ubicacion_id is null))$x$ in v_m) = 0
     or position($x$or (not v_lider and d.ubicacion_id = any (v_ubics))$x$ in v_m) = 0 then
    raise exception 'ADR-0417 (2026-10-17): fn_movimientos_dinero no quedó con lo de la empresa para el líder, o perdió lo de quien no lo es';
  end if;
end $$;

reset lock_timeout;
