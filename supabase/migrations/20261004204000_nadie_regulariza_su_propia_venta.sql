-- ============================================================================
-- 20261004204000_nadie_regulariza_su_propia_venta.sql — CAYLA V2 · ADR-0328 (actividad 5, parte c)
-- Quien vendió una prenda «sin registrar» no la regulariza, salvo el líder; y regularizar vuelve a pedir el nombre.
--
-- EL PROBLEMA PRIMERO. Regularizar decide cuánto stock queda (sale 1, o entra 1 y sale 1) y a qué prenda real pasa la venta
-- (y con ella su costo y la «diferencia» entre lo cobrado y el precio oficial). Hoy la puede hacer cualquiera que opere la sede,
-- también quien la vendió: la misma persona cobra a ojo una prenda sin etiqueta y después dice cuál era y cuánto valía. Felipe
-- (2026-10-04): «Nadie regulariza su propia venta, salvo el líder» (ADR-0328, tabla «Traslados, Recibir y Conteo»).
-- Y desde una terminal la regla no se podía ni comparar: el 2026-09-29 regularizar se soltó del combo «Responsable»
-- (20260929230000, ADR-0280), así que desde la cuenta de una tienda se guardaba SIN persona (`regularizado_por` NULL).
--
-- QUÉ HACE (una sola parte; no toca políticas ni hace `alter` de tablas: ADR-0195 no aplica).
--   1. `regularizar_prenda` (reemplazo ANCLADO, ver «Por qué por ancla»), justo después de comprobar que la venta sigue
--      pendiente:
--        · sin líder en la cuenta, exige que alguien firme (`responsable_requerido`): la regla necesita a la persona;
--        · rechaza si la venta la hizo quien firma (`fn_actor_persona_id(true)`, el responsable del combo) o la persona de la
--          cuenta (`fn_actor_persona_id(false)`: con su propia cuenta, nombrar a otra persona en el combo no la vuelve otra).
--          Mensaje de tienda y `hint = 'regularizar_propia_venta'`. El líder (`fn_es_lider()`, la CUENTA, como todo permiso,
--          ADR-0161) sí puede;
--        · toma el candado del stock de esa prenda en esa sede en el orden de siempre (`fn_bloquear_en_orden`, ADR-0190) antes
--          de leer de dónde descontar: con las candidatas de la parte b, dos personas regularizando a la vez dos ventas
--          parecidas eligen la MISMA prenda; la segunda espera a la primera y, si ya no queda, recibe
--          «prenda_sin_stock_para_descontar» en vez del error crudo de stock negativo.
--   2. Quita 'regularizar_prenda' de `retail.acciones_sin_responsable`: regularizar vuelve a pedir el nombre UNA vez por
--      operación (la web: `useResponsable` + `ComboResponsable` en el modal). Las otras claves no se tocan (otra actividad
--      quita 'conteo_cerrar' y 'traslado_recibir' en su propia migración).
--
-- CONTRATO de `regularizar_prenda` después de esto. PROMETE: lo mismo que antes (20260923162300) y, además, que una venta
-- pendiente nunca queda regularizada por quien la vendió salvo que la cuenta sea de un líder, ni sin una persona que firme.
-- ASUME: `prendas_por_regularizar.vendido_por` es la asesora de la venta (`registrar_venta`: la elegida o quien cobró). NO
-- HACE: no juzga una venta sin `vendido_por` (no hay con quién comparar: pasa, como antes).
--
-- ESTADO QUE DEJA DE SER POSIBLE: una fila `regularizada` cuyo `regularizado_por` es su `vendido_por`, hecha sin cuenta de
-- líder; y una regularización desde una terminal sin nadie que firme (`regularizado_por` NULL).
--
-- POR QUÉ POR ANCLA. `regularizar_prenda` vive en producción y puede tener parches en vivo que ningún archivo recoge; reescribirla
-- desde 20260923162300 los borraría. `pg_temp.reemplazar_unico` cambia UN texto que tiene que aparecer exactamente una vez y
-- aborta si no (el cuerpo vivo es otro: hay que regenerar el reemplazo desde su definición real); si el texto nuevo ya está, no
-- hace nada (se puede pegar dos veces). Dentro de los textos no hay `select … into` (ADR-0288).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: tal cual en el SQL Editor (trae `retail.` y `set search_path`), en una sola parte, DESPUÉS de
-- 20260923162300 y 20260929230000 (si faltan, aborta con un mensaje claro) y justo ANTES de fusionar el PR. Entre el pegado y
-- la publicación de la web (2–3 min), la pantalla vieja todavía manda «sin responsable» y regularizar responde «Falta elegir al
-- responsable»: no se guarda nada a medias; se reintenta al recargar con la web nueva. Antes de pegar, en solo lectura:
--   select position('Otra persona ya la regularizó' in prosrc) > 0 from pg_proc where oid = 'retail.regularizar_prenda(uuid, uuid, text)'::regprocedure;
-- debe dar `true` (el ancla está). Después: `select prosrc like '%regularizar_propia_venta%' …` → `true`.
--
-- SE ROMPE SI alguien vuelve a pegar 20260923162300 (recrea `regularizar_prenda` sin el candado) o 20260929230000 (vuelve a
-- insertar la clave 'regularizar_prenda' y la terminal regulariza sin persona: la regla de arriba lo frena igual con
-- `responsable_requerido`, que es por qué el «exige que alguien firme» está en la función y no solo en la lista).
-- Prueba: `pnpm pruebas:ventas-sin-registrar` (casos C).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.regularizar_prenda(uuid, uuid, text)') is null then
    raise exception 'Falta retail.regularizar_prenda: pega antes 20260923162300_regularizar_prenda.sql';
  end if;
  if to_regclass('retail.acciones_sin_responsable') is null then
    raise exception 'Falta retail.acciones_sin_responsable: pega antes 20260929230000_acciones_sin_responsable.sql';
  end if;
end $$;

create or replace function pg_temp.reemplazar_unico(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. regularizar_prenda: nadie regulariza su propia venta, salvo el líder; alguien tiene que firmar; candado del stock en orden.
select pg_temp.reemplazar_unico(
  'retail.regularizar_prenda(uuid, uuid, text)',
  $v$  if v_p.estado <> 'pendiente' then
    raise exception 'prenda_ya_regularizada' using hint = 'Otra persona ya la regularizó, o la venta se anuló';
  end if;
$v$,
  $n$  if v_p.estado <> 'pendiente' then
    raise exception 'prenda_ya_regularizada' using hint = 'Otra persona ya la regularizó, o la venta se anuló';
  end if;

  -- ADR-0328 (actividad 5, Felipe 2026-10-04): nadie regulariza su propia venta, salvo el líder (la CUENTA, como todo permiso).
  -- Se compara con quien firma (el responsable del combo) y con la persona de la cuenta: con su propia cuenta, nombrar a otra
  -- persona no vuelve ajena la venta. Sin nadie que firme no hay con quién comparar: se pide el nombre.
  if not fn_es_lider() then
    if v_persona is null then
      raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
    end if;
    if v_p.vendido_por is not null
       and (v_p.vendido_por = v_persona or v_p.vendido_por is not distinct from fn_actor_persona_id(false)) then
      raise exception 'Quien vendió esta prenda no puede regularizarla: que lo haga otra persona del equipo o un líder.'
        using errcode = '42501', hint = 'regularizar_propia_venta';
    end if;
  end if;

  -- ADR-0190: el stock de esa prenda en esa sede se toma en el orden de siempre ANTES de mirar de dónde descontar. Dos
  -- regularizaciones de la misma prenda se ponen en fila; la segunda ve lo que dejó la primera.
  perform fn_bloquear_en_orden(v_p.ubicacion_id, array[p_variante_id], false);
$n$
);

comment on function retail.regularizar_prenda(uuid, uuid, text) is
  'ADR-0179: une una prenda vendida sin registrar con su variante real. p_forma: ya_registrada (sale 1) o llego_nueva (entra 1 y sale 1). Devuelve la diferencia (cobrado − oficial). ADR-0328 (20261004204000): quien la vendió no la regulariza salvo con cuenta de líder (hint regularizar_propia_venta), alguien tiene que firmar (fn_actor_persona_id(true)) y el stock se bloquea en orden (fn_bloquear_en_orden).';

-- 2. Regularizar vuelve a pedir el nombre (una vez por operación).
delete from retail.acciones_sin_responsable where clave = 'regularizar_prenda';

-- 3. Validación final: si algo no quedó, se deshace todo.
do $v$
declare
  v_def text := pg_get_functiondef('retail.regularizar_prenda(uuid, uuid, text)'::regprocedure);
begin
  if (length(v_def) - length(replace(v_def, 'regularizar_propia_venta', ''))) / length('regularizar_propia_venta') <> 1 then
    raise exception 'regularizar_prenda no quedó con UNA sola regla de «su propia venta»';
  end if;
  if position('fn_bloquear_en_orden(v_p.ubicacion_id, array[p_variante_id], false)' in v_def) = 0 then
    raise exception 'regularizar_prenda no quedó con el candado en orden';
  end if;
  -- Lo que ya tenía sigue ahí (las dos respuestas y el «sin stock»).
  if position('prenda_sin_stock_para_descontar' in v_def) = 0 or position('ingreso_regularizado' in v_def) = 0 then
    raise exception 'regularizar_prenda perdió parte de su cuerpo';
  end if;
  if exists (select 1 from retail.acciones_sin_responsable where clave = 'regularizar_prenda') then
    raise exception 'regularizar_prenda sigue en acciones_sin_responsable';
  end if;
end
$v$;

notify pgrst, 'reload schema';
