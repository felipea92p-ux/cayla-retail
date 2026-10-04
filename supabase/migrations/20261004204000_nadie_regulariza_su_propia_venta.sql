-- ============================================================================
-- 20261004204000_nadie_regulariza_su_propia_venta.sql — CAYLA V2 · ADR-0328 (actividad 5, parte c)
-- Quien vendió una prenda «sin registrar» no la regulariza, salvo el líder firmando él mismo; regularizar vuelve a pedir el
-- nombre; no se regulariza una prenda que todavía no se cargó en la sede; y «ya estaba registrada» descuenta de lo disponible.
--
-- EL PROBLEMA PRIMERO. Regularizar decide cuánto stock queda (sale 1, o entra 1 y sale 1) y a qué prenda real pasa la venta
-- (y con ella su costo y la «diferencia» entre lo cobrado y el precio oficial). Hoy la puede hacer cualquiera que opere la sede,
-- también quien la vendió: la misma persona cobra a ojo una prenda sin etiqueta y después dice cuál era y cuánto valía. Felipe
-- (2026-10-04): «Nadie regulariza su propia venta, salvo el líder» (ADR-0328, tabla «Traslados, Recibir y Conteo»).
-- Y desde una terminal la regla no se podía ni comparar: el 2026-09-29 regularizar se soltó del combo «Responsable»
-- (20260929230000, ADR-0280), así que desde la cuenta de una tienda se guardaba SIN persona (`regularizado_por` NULL).
-- La revisión adversarial de esta rama encontró tres huecos más, cada uno probado en una base con todas las migraciones:
--   · R1: la excepción era de la CUENTA. Con la sesión de una líder de equipo abierta en caja (lo normal: cobran con su
--     cuenta, 15-COMO-OPERA-CAYLA R-23), la asesora que vendió se elegía en el combo y regularizaba su propia venta.
--   · R2/R3: «ya estaba registrada» descontaba de cualquier fila con `cantidad >= 1`: con una unidad en Cuarentena o la del
--     piso apartada para otro cliente, chocaba con «Esa prenda está en Cuarentena…» o «Stock insuficiente… apartadas», aunque
--     la pantalla le había mostrado esa prenda como DISPONIBLE (`fn_existencias_base`). Dos definiciones de «de dónde se saca».
--   · R6: regularizar «llegó nueva» una prenda sin ningún movimiento en la sede escribía su entrada y su venta, y después su
--     carga inicial fallaba con `carga_con_historia`: la trampa por la que ADR-0328 (decisión 8) dejó la limpieza para después
--     de cargar. AQP y LIM siguen cargando, y TRU hasta el 15-oct.
--
-- QUÉ HACE (una sola parte; no toca políticas ni hace `alter` de tablas: ADR-0195 no aplica). Tres reemplazos ANCLADOS en
-- `regularizar_prenda` (ver «Por qué por ancla») y una fila menos en una lista:
--   1. Justo después de comprobar que la venta sigue pendiente:
--        · exige que alguien firme (`responsable_requerido`): sin persona no hay con quién comparar;
--        · rechaza (`hint = 'regularizar_propia_venta'`, mensaje de tienda) si firma quien vendió —salvo que sea el líder
--          firmando él mismo: cuenta de líder (`fn_es_lider()`, ADR-0161) Y quien firma es la persona de esa cuenta—, o si la
--          cuenta es de quien vendió y no es de líder (con su propia cuenta, nombrar a otra persona no vuelve ajena la venta).
--          Así, desde una terminal, elegir el nombre del líder tampoco presta la excepción;
--        · toma el candado del stock de esa prenda en esa sede en el orden de siempre (`fn_bloquear_en_orden`, ADR-0190) antes
--          de leer de dónde descontar: dos regularizaciones de ventas parecidas eligen la MISMA candidata; la segunda espera a la
--          primera y, si ya no queda, recibe «prenda_sin_stock_para_descontar» en vez del error crudo de stock negativo.
--   2. Antes de elegir de dónde sale la prenda: si la prenda no tiene NINGÚN movimiento en esa sede (ni como origen ni como
--      destino de un traslado: `fn_prenda_cargada_en_sede`, 20261004203000), rechaza con `hint = 'prenda_sin_cargar_en_sede'`
--      y «Esta prenda todavía no está cargada en <sede>: primero cárgala…». Con las dos respuestas: «llegó nueva» le cerraría la
--      carga inicial, y «ya estaba registrada» no tiene de dónde descontar (antes decía «elige llegó nueva»: una vuelta en círculo).
--   3. «Ya estaba registrada» descuenta de una fila con unidades LIBRES (`cantidad - cantidad_apartada >= 1`) fuera de Cuarentena
--      —la misma cuenta que el «disponible» de `fn_existencias_base`, que es lo que la pantalla le muestra en la candidata—, con
--      el piso primero, después el almacén, el resto al final y el id para desempatar.
--   4. Quita 'regularizar_prenda' de `retail.acciones_sin_responsable`: regularizar vuelve a pedir el nombre UNA vez por
--      operación (la web: `useResponsable` + `ComboResponsable` en el modal). Las otras claves no se tocan (otra actividad
--      quita 'conteo_cerrar' y 'traslado_recibir' en su propia migración).
--
-- CONTRATO de `regularizar_prenda` después de esto. PROMETE: lo mismo que antes (20260923162300) y, además: (a) una venta
-- pendiente nunca queda regularizada por quien la vendió, salvo un líder firmando él mismo desde su cuenta, ni sin una persona
-- que firme; (b) nunca se regulariza una prenda que no tiene historia en la sede; (c) «ya estaba registrada» nunca descuenta de
-- Cuarentena ni de una unidad apartada. ASUME: `prendas_por_regularizar.vendido_por` es la asesora de la venta (`registrar_venta`:
-- la elegida o quien cobró). NO HACE: no juzga una venta sin `vendido_por` (no hay con quién comparar: pasa, como antes); no
-- deduce la respuesta (eso es una sugerencia de la pantalla, nunca un candado: ver 20261004203000).
--
-- ESTADO QUE DEJA DE SER POSIBLE: una fila `regularizada` cuyo `regularizado_por` es su `vendido_por` sin que sea un líder
-- firmando por sí mismo; una regularización sin nadie que firme (`regularizado_por` NULL); una prenda regularizada en una sede
-- donde nunca se cargó (que después ya no se puede cargar); y una venta regularizada que sale de Cuarentena o de lo apartado.
--
-- POR QUÉ POR ANCLA. `regularizar_prenda` vive en producción y puede tener parches en vivo que ningún archivo recoge; reescribirla
-- desde 20260923162300 los borraría. `pg_temp.reemplazar_unico` cambia UN texto que tiene que aparecer exactamente una vez y
-- aborta si no (el cuerpo vivo es otro: hay que regenerar el reemplazo desde su definición real); si el texto nuevo ya está, no
-- hace nada (se puede pegar dos veces). Ningún texto (ni el ancla ni el nuevo) trae `select … into` (ADR-0288): por eso el ancla
-- del punto 3 empieza en el `where` y deja intacta la línea de arriba.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: tal cual en el SQL Editor (trae `retail.` y `set search_path`), en una sola parte, DESPUÉS de
-- 20260923162300, 20260929230000 y 20261004203000 (si falta alguna, aborta con un mensaje claro) y ANTES de fusionar el PR. Si
-- una versión anterior de ESTA migración ya se hubiera pegado, la validación final aborta sin tocar nada (quedarían dos reglas):
-- avisar antes de seguir. Entre el pegado y la publicación de la web (2–3 min), una TERMINAL con la pantalla vieja recibe «Elige
-- quién hace esta operación» al regularizar (no se guarda nada a medias; con la web nueva elige su nombre); una cuenta de persona
-- sigue regularizando. En producción hay 0 regularizaciones en toda su historia (2026-10-03). Antes de pegar, en solo lectura, los
-- tres anclas tienen que aparecer UNA vez cada una: `node scripts/pruebas/ventas_sin_registrar.mjs --sonda` imprime esa sonda
-- (sale de los mismos textos de abajo, y los casos P1–P3 de `pnpm pruebas:ventas-sin-registrar` la prueban contra el cuerpo
-- original de 20260923162300).
-- Después: `select count(*) from retail.acciones_sin_responsable where clave = 'regularizar_prenda';` → 0.
--
-- SE ROMPE SI alguien vuelve a pegar 20260923162300 (recrea `regularizar_prenda` sin estas reglas) o 20260929230000 (vuelve a
-- insertar la clave 'regularizar_prenda': la terminal igual tiene que elegir quién firma, que es por qué el «alguien tiene que
-- firmar» está en la función y no solo en la lista). Y SE ROMPE SI la carga inicial de una sede se cierra (la actividad del
-- cierre de carga, ADR-0328): entonces «cárgala con su stock inicial» ya no es una puerta abierta, y el punto 2 tiene que pasar a
-- valer solo mientras la carga de esa sede siga abierta. Pruebas: `pnpm pruebas:ventas-sin-registrar` (casos C, R y P).
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
  if to_regprocedure('retail.fn_prenda_cargada_en_sede(uuid, uuid)') is null then
    raise exception 'Falta retail.fn_prenda_cargada_en_sede: pega antes 20261004203000_candidatas_por_regularizar.sql';
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

-- 1. Nadie regulariza su propia venta, salvo el líder firmando él mismo; alguien tiene que firmar; candado del stock en orden.
select pg_temp.reemplazar_unico(
  'retail.regularizar_prenda(uuid, uuid, text)',
  $v$  if v_p.estado <> 'pendiente' then
    raise exception 'prenda_ya_regularizada' using hint = 'Otra persona ya la regularizó, o la venta se anuló';
  end if;
$v$,
  $n$  if v_p.estado <> 'pendiente' then
    raise exception 'prenda_ya_regularizada' using hint = 'Otra persona ya la regularizó, o la venta se anuló';
  end if;

  -- ADR-0328 (actividad 5, Felipe 2026-10-04): nadie regulariza su propia venta, salvo el líder. Sin nadie que firme no hay con
  -- quién comparar: se pide el nombre. «Salvo el líder» es el líder FIRMANDO ÉL MISMO: cuenta de líder (fn_es_lider, la cuenta,
  -- como todo permiso) y quien firma es la persona de esa cuenta. Con la sesión de una líder abierta en caja, elegir en el combo
  -- a la asesora que vendió no le presta la excepción; desde una terminal, elegir el nombre del líder tampoco. Y con su propia
  -- cuenta (sin ser líder), nombrar a otra persona no vuelve ajena la venta.
  if v_persona is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if v_p.vendido_por is not null
     and ((v_p.vendido_por = v_persona and not (fn_es_lider() and v_persona is not distinct from fn_actor_persona_id(false)))
          or (v_p.vendido_por is not distinct from fn_actor_persona_id(false) and not fn_es_lider())) then
    raise exception 'Quien vendió esta prenda no puede regularizarla: que lo haga otra persona del equipo o un líder.'
      using errcode = '42501', hint = 'regularizar_propia_venta';
  end if;

  -- ADR-0190: el stock de esa prenda en esa sede se toma en el orden de siempre ANTES de mirar de dónde descontar. Dos
  -- regularizaciones de la misma prenda se ponen en fila; la segunda ve lo que dejó la primera.
  perform fn_bloquear_en_orden(v_p.ubicacion_id, array[p_variante_id], false);
$n$
);

-- 2. Una prenda que todavía no se cargó en la sede no se regulariza: primero su carga inicial.
select pg_temp.reemplazar_unico(
  'retail.regularizar_prenda(uuid, uuid, text)',
  $v$  v_piso := fn_sububicacion_por_defecto(v_p.ubicacion_id, 'venta');
$v$,
  $n$  -- ADR-0328 (actividad 5, revisión): una prenda SIN ningún movimiento en esta sede todavía no se cargó aquí. «Llegó nueva»
  -- escribiría una entrada y una venta y le cerraría para siempre su carga inicial (`fn_cargar_stock_inicial` exige que no tenga
  -- historia: `carga_con_historia`); «ya estaba registrada» no tiene de dónde descontar. Primero se carga con lo que hay hoy en
  -- la tienda (sin la vendida) y después se regulariza como «llegó nueva». Si una carga de esta misma prenda corre a la vez, aquí
  -- se lee lo confirmado: o se ve la carga ya hecha y se sigue, o no se ve y se rechaza; nunca se escribe antes que ella.
  if not coalesce(fn_prenda_cargada_en_sede(p_variante_id, v_p.ubicacion_id), false) then
    raise exception 'Esta prenda todavía no está cargada en %: primero cárgala con su stock inicial (lo que hay hoy en la tienda, sin la vendida) y vuelve a regularizarla.',
      coalesce((select u.nombre from ubicaciones u where u.id = v_p.ubicacion_id), 'esta tienda')
      using hint = 'prenda_sin_cargar_en_sede';
  end if;

  v_piso := fn_sububicacion_por_defecto(v_p.ubicacion_id, 'venta');
$n$
);

-- 3. «Ya estaba registrada» descuenta de lo DISPONIBLE (ni Cuarentena ni apartadas): la misma cuenta que la candidata.
select pg_temp.reemplazar_unico(
  'retail.regularizar_prenda(uuid, uuid, text)',
  $v$      where variante_id = p_variante_id and ubicacion_id = v_p.ubicacion_id and cantidad >= 1
      order by (sububicacion_id is not distinct from v_piso) desc
      limit 1;
$v$,
  $n$      -- ADR-0328 (actividad 5, revisión): de una fila con unidades LIBRES y fuera de Cuarentena, la misma cuenta que el
      -- «disponible» de fn_existencias_base (lo que la pantalla muestra en la candidata): el piso de venta primero, después el
      -- almacén, el resto al final, y el id para que el orden sea siempre el mismo.
      where variante_id = p_variante_id and ubicacion_id = v_p.ubicacion_id and cantidad - cantidad_apartada >= 1
        and not exists (select 1 from sububicaciones sb where sb.id = stock.sububicacion_id and sb.tipo = 'cuarentena')
      order by (sububicacion_id is not distinct from v_piso) desc,
               (select case sb.tipo when 'piso_venta' then 0 when 'almacen_tienda' then 1 else 2 end
                  from sububicaciones sb where sb.id = stock.sububicacion_id) nulls last,
               sububicacion_id
      limit 1;
$n$
);

comment on function retail.regularizar_prenda(uuid, uuid, text) is
  'ADR-0179: une una prenda vendida sin registrar con su variante real. p_forma: ya_registrada (sale 1 de lo disponible: ni Cuarentena ni apartadas) o llego_nueva (entra 1 y sale 1). Devuelve la diferencia (cobrado − oficial). ADR-0328 (20261004204000): quien la vendió no la regulariza salvo un líder firmando él mismo (hint regularizar_propia_venta), alguien tiene que firmar (fn_actor_persona_id(true)), una prenda sin historia en la sede no se regulariza (hint prenda_sin_cargar_en_sede) y el stock se bloquea en orden (fn_bloquear_en_orden).';

-- 4. Regularizar vuelve a pedir el nombre (una vez por operación).
delete from retail.acciones_sin_responsable where clave = 'regularizar_prenda';

-- 5. Validación final: si algo no quedó, se deshace todo.
do $v$
declare
  v_def text := pg_get_functiondef('retail.regularizar_prenda(uuid, uuid, text)'::regprocedure);
  v_marca text;
begin
  foreach v_marca in array array[
    'regularizar_propia_venta',
    'fn_bloquear_en_orden(v_p.ubicacion_id, array[p_variante_id], false)',
    'prenda_sin_cargar_en_sede',
    'cantidad - cantidad_apartada >= 1'
  ] loop
    if (length(v_def) - length(replace(v_def, v_marca, ''))) / length(v_marca) <> 1 then
      raise exception 'regularizar_prenda no quedó con UNA sola vez «%»: ¿se pegó antes otra versión de esta migración?', v_marca;
    end if;
  end loop;
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
