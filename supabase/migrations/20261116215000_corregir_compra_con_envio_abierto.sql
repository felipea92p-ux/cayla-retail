-- ============================================================================
-- 20261116215000_corregir_compra_con_envio_abierto.sql — CAYLA V2 · ADR-0561 (actualización 2026-11-16)
-- «Corregir una compra» también cuando la compra ya salió en un envío que la tienda todavía no recibe
--
-- EL PROBLEMA PRIMERO. El 2026-11-16 la tienda de Trujillo contaba el ENV-24 y el sistema decía «Aretes: dijeron 93, contaste 84, faltan 9» y
-- «Por definir: 13 sin contar». No faltaba nada: la compradora había anotado mal la cantidad de aretes y, al leer las notas, tres prendas que
-- nunca se compraron (Lentes, «Sin leer», «Surtido»). Nadie podía arreglarlo desde el sistema: «Corregir una compra» se negaba a dejar una prenda
-- en menos de lo que ya salió en un envío, y no tenía cómo quitar una prenda. Las 13 se quitaron a mano en la base ese día (queda en Actividad,
-- `envio_lineas_quitadas`); esto es para que la próxima vez lo haga la compradora.
--
-- LO QUE CAMBIA (todo dentro de `corregir_compra_rapida`, con las mismas llaves: módulo, compra propia, ronda abierta, Compras sin completarla):
--   1. BAJAR LA CANTIDAD de una prenda que ya viajó: puede bajar mientras lo que sobra esté en un envío en camino o abierto y la tienda todavía
--      no lo haya recibido (sin prendas entradas, faltantes, pendientes ni separaciones de esa línea). Lo que se baja sale del envío más nuevo
--      primero, y cada línea del envío queda con al menos 1 (para dejarla en 0 está «quitar»). Contar no frena: lo contado se compara después con
--      lo que dice la compra corregida. El envío sube de versión: quien está contando recarga antes de cerrar.
--   2. QUITAR UNA PRENDA que se anotó por error («quitar»: true): sale de la compra y de su envío, si la tienda todavía no la empezó a contar ni
--      anotó nada de ella, no llegó nada de ella, no tiene correcciones anteriores y no es la única prenda de su envío. Una compra se queda con al
--      menos una prenda. Queda en `compra_correcciones` como `quitada`, con lo que decía («Lentes · 3 × S/ 5.40») y el id de la línea en una
--      columna nueva sin llave, `prenda_quitada_id` (la línea ya no existe; el índice único del rastro la incluye).
--   3. `fn_compra_para_corregir` dice por prenda hasta cuánto puede bajar (`envios.minimo`) y si se puede quitar (`envios.quitable`, `por_que`).
--   El papel y lo pagado siguen la regla de siempre: acompañan a las prendas solo si ya cuadraban; lo escrito a mano manda.
--
-- POR QUÉ SE BORRA LA FILA (y no se archiva). La línea de la compra y su línea del envío nunca existieron en la realidad, nunca movieron stock ni
-- dinero (solo se quitan si nada de la tienda depende de ellas). Archivarla con una columna obligaría a que las decenas de funciones que leen
-- `orden_compra_items` y `despacho_items` la filtren, y una que se olvide sumaría prendas fantasma en silencio (principio 2). El rastro vive en
-- `compra_correcciones` (inmutable) y en la Actividad.
--
-- CONTRATO (Liskov)
--   PROMETE: lo que antes se corregía da el mismo resultado; una prenda que la tienda ya recibió no baja ni se quita; nada queda a medias.
--   ASUME:   las funciones vivas tienen el texto con que se escribió esto (cada reemplazo lo comprueba y frena si no).
--   NO HACE: no toca stock, movimientos, conteos ni diferencias; no corrige lo que Compras ya completó o facturó.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable: en `compra_correcciones` una columna nueva, un `check` cambiado, uno nuevo y su índice único
-- rehecho (la tabla es chica); dos funciones nuevas y tres funciones con reemplazos anclados. Sin
-- políticas (ADR-0195), sin `drop trigger`, sin `select … into` dentro de textos (ADR-0288). Pegar ANTES de publicar la web: con la web nueva y
-- la base vieja, «Quitar» da «Una de las prendas no se entiende» y no se guarda nada.
-- VERIFICACIÓN (→ t | t | t | t):
--   select to_regprocedure('retail.fn_compra_linea_envios(uuid)') is not null,
--          position('20261116215000' in pg_get_functiondef('retail.corregir_compra_rapida(uuid,uuid,jsonb,jsonb)'::regprocedure)) > 0,
--          position('20261116215000' in pg_get_functiondef('retail.fn_compra_para_corregir(uuid)'::regprocedure)) > 0,
--          position('compra_quitando' in pg_get_functiondef('retail.fn_despacho_items_al_entrar()'::regprocedure)) > 0;
-- CÓMO SE DESHACE: los reemplazos al revés (el texto de cada `p_nuevo` por su `p_viejo`), `drop function` de las dos nuevas, y el índice y el
-- `check` de antes (solo si no hay filas `quitada`; la columna puede quedarse vacía).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Reemplaza `p_viejo` por `p_nuevo` en la función, exigiendo que el ancla aparezca exactamente `p_veces` veces. Si `p_nuevo` ya está, no hace
-- nada (re-ejecutable).
create or replace function pg_temp.reemplazar_envio_abierto(p_firma text, p_viejo text, p_nuevo text, p_veces integer default 1)
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
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaban %). Regenera el reemplazo desde su definición real.',
      p_firma, v_n, p_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. El rastro acepta «quitada» ----------
-- La línea quitada ya no existe, así que el rastro no puede apuntarle con su llave (`orden_compra_item_id` queda vacío): guarda su id en
-- `prenda_quitada_id`, sin llave. Así dos prendas quitadas en la misma corrección no chocan en `compra_correcciones_lote_dato`, y se sabe cuál fue.
alter table retail.compra_correcciones add column if not exists prenda_quitada_id uuid;
comment on column retail.compra_correcciones.prenda_quitada_id is
  'Solo en una fila «quitada» (20261116215000): el id de la línea de la compra que se quitó por anotarse por error. Sin llave: la línea ya no existe.';
do $c$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.compra_correcciones'::regclass and conname = 'compra_correcciones_campo_check'
                   and pg_get_constraintdef(oid) like '%quitada%') then
    alter table retail.compra_correcciones drop constraint if exists compra_correcciones_campo_check;
    alter table retail.compra_correcciones add constraint compra_correcciones_campo_check
      check (campo = any (array['cantidad', 'costo', 'precio_venta', 'nombre', 'categoria', 'marca', 'tienda', 'monto', 'pagado', 'medio_pago', 'quitada']));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'retail.compra_correcciones'::regclass and conname = 'compra_correcciones_quitada_con_su_prenda') then
    alter table retail.compra_correcciones add constraint compra_correcciones_quitada_con_su_prenda
      check ((campo = 'quitada') = (prenda_quitada_id is not null and orden_compra_item_id is null));
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'retail' and indexname = 'compra_correcciones_lote_dato' and indexdef like '%prenda_quitada_id%') then
    drop index if exists retail.compra_correcciones_lote_dato;
    create unique index compra_correcciones_lote_dato on retail.compra_correcciones
      (lote, papel_id, coalesce(orden_compra_item_id, prenda_quitada_id, '00000000-0000-0000-0000-000000000000'::uuid), campo);
  end if;
end $c$;

-- ---------- 2. Lo que la tienda ya hizo con una línea del envío ----------
-- Una línea del envío está «fija» si de ella ya entró algo, faltó o sobró, quedó pendiente, se separó o salió: eso ya es de la tienda.
create or replace function retail.fn_despacho_item_fijo(p_despacho_item_id uuid)
returns boolean
language sql
stable
set search_path = retail, public, extensions
as $$
  select exists (select 1 from retail.despacho_recibidos r where r.despacho_item_id = p_despacho_item_id)
      or exists (select 1 from retail.despacho_diferencias f where f.despacho_item_id = p_despacho_item_id)
      or exists (select 1 from retail.despacho_pendientes x where x.despacho_item_id = p_despacho_item_id)
      or exists (select 1 from retail.despacho_separaciones s where s.despacho_item_id = p_despacho_item_id)
      or exists (select 1 from retail.despacho_salidas s where s.despacho_item_id = p_despacho_item_id);
$$;
revoke all on function retail.fn_despacho_item_fijo(uuid) from public, anon, authenticated;

-- Cuánto viajó una prenda de la compra, hasta cuánto puede bajar y si se puede quitar (y si no, por qué, en palabras de tienda).
create or replace function retail.fn_compra_linea_envios(p_item_id uuid)
returns jsonb
language plpgsql
stable
set search_path = retail, public, extensions
as $$
declare
  v_enviadas integer := 0;
  v_quedan integer := 0;
  v_libres integer := 0;
  v_l record;
  v_por_que text;
begin
  for v_l in
    select di.id, di.despacho_id, di.cantidad, d.estado, retail.fn_despacho_item_fijo(di.id) as fijo
      from retail.despacho_items di
      join retail.despachos d on d.id = di.despacho_id
     where di.orden_compra_item_id = p_item_id and d.estado in ('en_camino', 'abierto', 'cerrado')
  loop
    v_enviadas := v_enviadas + v_l.cantidad;
    if v_l.estado = 'cerrado' or v_l.fijo then
      v_quedan := v_quedan + v_l.cantidad;
    else
      v_libres := v_libres + 1;
    end if;
  end loop;

  v_por_que := case
    when v_quedan > 0 then 'ya llegó a la tienda'
    when exists (select 1 from retail.despacho_conteos k join retail.despacho_items di on di.id = k.despacho_item_id
                  where di.orden_compra_item_id = p_item_id) then 'la tienda ya la está contando'
    when exists (select 1 from retail.despacho_observaciones o join retail.despacho_items di on di.id = o.despacho_item_id
                  where di.orden_compra_item_id = p_item_id) then 'la tienda ya anotó algo de ella'
    when exists (select 1 from retail.compra_items ci where ci.orden_compra_item_id = p_item_id) then 'ya tiene su factura'
    when exists (select 1 from retail.compra_correcciones c where c.orden_compra_item_id = p_item_id) then 'ya la corregiste antes: avísale a Compras'
    when exists (select 1 from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id
                  where di.orden_compra_item_id = p_item_id and d.estado in ('en_camino', 'abierto')
                    and not exists (select 1 from retail.despacho_items o where o.despacho_id = di.despacho_id and o.id <> di.id))
      then 'es la única prenda de su envío: avísale a Compras'
    else null
  end;

  return jsonb_build_object(
    'enviadas', v_enviadas,
    -- Cada línea viva que la tienda no recibió puede bajar hasta 1; lo demás ya no se mueve.
    'minimo', greatest(1, v_quedan + v_libres),
    'quitable', v_por_que is null,
    'por_que', v_por_que);
end $$;
revoke all on function retail.fn_compra_linea_envios(uuid) from public, anon, authenticated;

-- ---------- 3. Una línea del envío se borra solo cuando «Corregir una compra» la quita ----------
select pg_temp.reemplazar_envio_abierto(
  'retail.fn_despacho_items_al_entrar()',
  $v$  if tg_op = 'DELETE' then
    raise exception 'Una línea de un envío no se borra: se anula el envío'$v$,
  $n$  -- 20261116215000: «Corregir una compra» quita una prenda que se anotó por error, mientras su envío no llega y la tienda no la empezó a contar.
  if tg_op = 'DELETE' and coalesce(current_setting('retail.compra_quitando', true), '') = 'si'
     and exists (select 1 from retail.despachos d where d.id = old.despacho_id and d.estado in ('en_camino', 'abierto'))
     and not exists (select 1 from retail.despacho_conteos k where k.despacho_item_id = old.id) then
    return old;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Una línea de un envío no se borra: se anula el envío'$n$);

-- ---------- 4. Lo que la hoja necesita saber de cada prenda ----------
select pg_temp.reemplazar_envio_abierto(
  'retail.fn_compra_para_corregir(uuid)',
  $v$               'enviadas', (select coalesce(sum(di.cantidad), 0)::integer$v$,
  $n$               'envios', retail.fn_compra_linea_envios(i.id) /* 20261116215000 */,
               'enviadas', (select coalesce(sum(di.cantidad), 0)::integer$n$);

-- ---------- 5. Corregir: bajar lo que ya viajó y quitar lo que se anotó por error ----------
select pg_temp.reemplazar_envio_abierto(
  'retail.corregir_compra_rapida(uuid,uuid,jsonb,jsonb)',
  $v$  v_tiene numeric;
begin$v$,
  $n$  v_tiene numeric;
  -- 20261116215000
  v_env jsonb;
  v_minimo integer;
  v_falta integer;
  v_toma integer;
  v_l record;
  v_despachos uuid[] := '{}';
begin$n$);

select pg_temp.reemplazar_envio_abierto(
  'retail.corregir_compra_rapida(uuid,uuid,jsonb,jsonb)',
  $v$    v_nombre := coalesce(nullif(btrim(v_item.descripcion), ''), 'la prenda');
$v$,
  $n$    v_nombre := coalesce(nullif(btrim(v_item.descripcion), ''), 'la prenda');

    -- 20261116215000: «Se anotó por error». La prenda sale de la compra y de su envío mientras la tienda no la empezó a contar ni llegó nada
    -- de ella (`fn_compra_linea_envios`). El rastro guarda lo que decía; la fila se borra porque nunca existió en la realidad.
    if v_cambio ? 'quitar' then
      if jsonb_typeof(v_cambio -> 'quitar') <> 'boolean' or not (v_cambio ->> 'quitar')::boolean then
        raise exception 'Una de las prendas no se entiende' using errcode = 'P0001', hint = 'compra_corregir_cambio';
      end if;
      v_env := retail.fn_compra_linea_envios(v_item.id);
      if not coalesce((v_env ->> 'quitable')::boolean, false) then
        raise exception '«%» no se puede quitar: %', v_nombre, v_env ->> 'por_que' using errcode = 'P0001', hint = 'compra_corregir_no_se_quita';
      end if;
      v_n := v_n + 1;
      insert into retail.compra_correcciones (lote, papel_id, orden_compra_item_id, prenda_quitada_id, campo, antes, despues, corregida_por)
      values (p_lote, p_papel_id, null, v_item.id, 'quitada',
              v_nombre || ' · ' || v_item.cantidad || ' × S/ ' || to_char(v_item.precio_unitario, 'FM999999990.00'), null, v_actor);
      perform set_config('retail.compra_quitando', 'si', true);
      for v_l in select di.id, di.despacho_id from retail.despacho_items di where di.orden_compra_item_id = v_item.id order by di.id for update loop
        delete from retail.despacho_items where id = v_l.id;
        -- El envío cambia: quien lo está contando recarga antes de cerrar (la versión sube sola).
        update retail.despachos set version = version where id = v_l.despacho_id;
        v_despachos := v_despachos || v_l.despacho_id;
      end loop;
      perform set_config('retail.compra_quitando', '', true);
      delete from retail.orden_compra_items where id = v_item.id;
      if not (v_item.orden_compra_id = any (v_ordenes)) then
        v_ordenes := v_ordenes || v_item.orden_compra_id;
      end if;
      continue;
    end if;
$n$);

select pg_temp.reemplazar_envio_abierto(
  'retail.corregir_compra_rapida(uuid,uuid,jsonb,jsonb)',
  $v$    if v_cantidad < v_enviadas then
      raise exception '«%» ya salió en un envío con % unidades: no puede quedar en menos', v_nombre, v_enviadas
$v$,
  $n$    -- 20261116215000: puede bajar mientras lo que sobra esté en un envío que la tienda todavía no recibió.
    v_env := retail.fn_compra_linea_envios(v_item.id);
    v_minimo := (v_env ->> 'minimo')::integer;
    if v_cantidad < v_minimo then
      raise exception '«%» ya salió en un envío: no puede quedar en menos de %', v_nombre, v_minimo
$n$);

select pg_temp.reemplazar_envio_abierto(
  'retail.corregir_compra_rapida(uuid,uuid,jsonb,jsonb)',
  $v$           precio_por_definir = (v_item.precio_por_definir and v_venta is null) /* ADR-0660 */
     where id = v_item.id;
$v$,
  $n$           precio_por_definir = (v_item.precio_por_definir and v_venta is null) /* ADR-0660 */
     where id = v_item.id;
    -- 20261116215000: si quedó en menos de lo que viajó, lo de más sale de sus envíos en camino o abiertos que la tienda no recibió, del más
    -- nuevo al más viejo, y cada línea queda con al menos 1.
    v_falta := v_enviadas - v_cantidad;
    if v_falta > 0 then
      for v_l in
        select di.id, di.despacho_id, di.cantidad
          from retail.despacho_items di
          join retail.despachos d on d.id = di.despacho_id
         where di.orden_compra_item_id = v_item.id and d.estado in ('en_camino', 'abierto') and not retail.fn_despacho_item_fijo(di.id)
         order by d.numero desc, di.id
           for update of di
      loop
        exit when v_falta = 0;
        v_toma := least(v_falta, v_l.cantidad - 1);
        if v_toma > 0 then
          update retail.despacho_items set cantidad = cantidad - v_toma where id = v_l.id;
          update retail.despachos set version = version where id = v_l.despacho_id;
          v_falta := v_falta - v_toma;
        end if;
      end loop;
      if v_falta > 0 then
        raise exception '«%» ya salió en un envío: no puede quedar en menos de %', v_nombre, v_minimo
          using errcode = 'P0001', hint = 'compra_corregir_menos_de_lo_enviado';
      end if;
    end if;
$n$);

select pg_temp.reemplazar_envio_abierto(
  'retail.corregir_compra_rapida(uuid,uuid,jsonb,jsonb)',
  $v$'Corrección de la compra: se movieron todas sus prendas a otra tienda'$v$,
  $n$'Corrección de la compra: se quitaron o se movieron todas sus prendas'$n$);

select pg_temp.reemplazar_envio_abierto(
  'retail.corregir_compra_rapida(uuid,uuid,jsonb,jsonb)',
  $v$  -- El papel: si ya cuadraba con las prendas, sigue cuadrando;$v$,
  $n$  -- 20261116215000: una compra se queda con al menos una prenda, y un envío también.
  if not exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id where o.papel_id = p_papel_id) then
    raise exception 'La compra se queda con al menos una prenda: si toda fue un error, avísale a Compras' using errcode = 'P0001', hint = 'compra_corregir_sin_prendas';
  end if;
  if exists (select 1 from retail.despachos d where d.id = any (v_despachos)
              and not exists (select 1 from retail.despacho_items di where di.despacho_id = d.id)) then
    raise exception 'Un envío se quedaría sin prendas: avísale a Compras para anularlo' using errcode = 'P0001', hint = 'compra_corregir_envio_vacio';
  end if;

  -- El papel: si ya cuadraba con las prendas, sigue cuadrando;$n$);

reset lock_timeout;
reset search_path;
