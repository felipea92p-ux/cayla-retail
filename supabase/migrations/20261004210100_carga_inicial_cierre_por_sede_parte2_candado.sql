-- ============================================================================
-- 20261004210100_carga_inicial_cierre_por_sede_parte2_candado.sql — CAYLA V2 · ADR-0328 (actividad 4) · PARTE 2 de 3
-- El candado: pasada su fecha, una sede ya no acepta carga inicial. Y quién mueve la fecha.
--
-- EL PROBLEMA PRIMERO. La parte 1 le dio a cada sede su fecha (`ubicaciones.carga_inicial_hasta`), pero ninguna puerta la
-- mira. Hay TRES puertas vivas que meten carga inicial: «Nuevo producto» (`crear_producto_con_stock_inicial`), Ajustar
-- stock con prendas nuevas en la tienda (`ajustar_inventario` → `cargar_stock_inicial`) y la propia `cargar_stock_inicial`.
-- Las tres terminan en UNA función interna, `fn_cargar_stock_inicial` (ADR-0212): es la única que escribe el motivo
-- `carga_inicial` como texto fijo en `movimientos` (verificado contra `pg_proc`; la prueba `cierre_carga_inicial.mjs` lo
-- vuelve a mirar en cada CI). El candado va ahí, una vez, y cubre las tres. Había una CUARTA, escondida:
-- `registrar_movimiento` (la RPC de Ajustar) recibe el motivo como texto y aceptaba `'carga_inicial'` en una llamada directa,
-- sin candado ni regla de «sin historia». Se cierra (4b).
--
-- QUÉ HACE.
--   1. `fn_carga_inicial_abierta(sede)`: la ÚNICA definición de «abierta» = sin fecha, o hoy (Lima) ≤ la fecha. La fecha
--      es el último día abierto: TRU carga todo el 15-oct y desde el 16-oct ya no.
--   2. `fn_texto_carga_inicial_cerrada(sede, para)`: la frase, una sola vez («La carga inicial de Tienda TRU se cerró el
--      15-oct. Lo que encuentres entra por «Encontré prendas».»). La usan esta parte y la 3.
--   3. `fn_exigir_carga_inicial_abierta(sede)`: el candado (P0001, hint `carga_inicial_cerrada`).
--   4. `fn_cargar_stock_inicial` lo llama, por reemplazo anclado, justo después de «puedes operar esta tienda» y ANTES de
--      pedir responsable o tomar candados: la persona sabe que está cerrado sin elegir a nadie.
--   4b. `registrar_movimiento` rechaza el motivo `carga_inicial` (hint `carga_inicial_por_su_puerta`).
--   5. `fn_carga_inicial_sedes()` (lectura, cualquier cuenta): cada sede activa con su fecha y si está abierta, y el «hoy»
--      de la base. La leen Configuración, Nuevo producto, Ajustar y la ficha para avisar ANTES.
--   6. `fijar_cierre_carga_inicial(sede, fecha)`: la única forma de cambiar la fecha (la parte 1 cierra la otra).
--        · La fija un líder (P0001 `carga_inicial_solo_lider`), firmada con el responsable del combo (ADR-0162).
--        · Nunca una fecha que ya pasó (`carga_inicial_fecha_pasada`): «hoy» es el día más cercano.
--        · APRETAR (poner fecha donde no había, o adelantarla) lo hace el líder. AFLOJAR —reabrir una sede ya cerrada,
--          quitarle la fecha o correrla más adelante— solo un Admin (`carga_inicial_solo_admin`): el tope es de Felipe.
--        · La fila de la sede se toma `for update`: dos líderes a la vez se ponen en fila y el historial anota el antes
--          real. La misma fecha que ya tenía no escribe nada.
--        · Deja el antes/después en `configuracion_historial` («cierre_carga_inicial»), y Actividad lo cuenta en una línea
--          (reemplazo anclado en `fn_actividad_configuracion`).
--
-- ESTADOS QUE DEJAN DE SER POSIBLES:
--   · Una entrada `carga_inicial` en una sede después de su fecha, por cualquiera de las tres puertas.
--   · Una entrada `carga_inicial` escrita como movimiento suelto (`registrar_movimiento`), sin candado y sobre una prenda
--     que ya tenía historia.
--   · Una fecha de cierre en el pasado, o una sede reabierta por alguien que no es Admin.
--
-- POR QUÉ SE REEMPLAZA POR ANCLA. `fn_cargar_stock_inicial`, `registrar_movimiento` y `fn_actividad_configuracion` viven en
-- producción; si hubiera
-- parches en vivo, reescribirlas desde un archivo los borraría. `pg_temp.cierre_carga_reemplazar` cambia un texto que tiene
-- que aparecer UNA sola vez y aborta si no (re-pegable: si el texto nuevo ya está, no hace nada). Sin `select … into` dentro
-- de los textos entre comillas (ADR-0288).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. DESPUÉS de la parte 1 (usa la columna) y ANTES de publicar la web. Solo funciones: no toma
-- tablas en uso ni lleva políticas ni `drop trigger` (ADR-0195). Idempotente.
--
-- SE ROMPE SI: una función nueva escribe el motivo `carga_inicial` sin pasar por `fn_cargar_stock_inicial` (la prueba
-- `cierre_carga_inicial.mjs` lo detecta: recorre `pg_proc`); o alguien vuelve a pegar 20260926130000 (recrea
-- `fn_cargar_stock_inicial` desde el archivo, sin el candado).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Ya aplicado = el texto NUEVO está (el nuevo contiene al viejo, así que mirar si falta el viejo no serviría: la segunda
-- pegada volvería a insertar el bloque). Si no está, el viejo tiene que aparecer exactamente UNA vez.
create or replace function pg_temp.cierre_carga_reemplazar(p_firma text, p_viejo text, p_nuevo text)
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
    raise exception '% cambió desde que se escribió esta migración: el texto aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ----------------------------------------------------------------------------
-- 1. Qué es «abierta» (una sola definición)
-- ----------------------------------------------------------------------------
-- PROMETE: true si la sede no tiene fecha o si hoy (Lima) es su fecha o antes. ASUME: `fn_hoy_lima()` es el «hoy» de todo
-- el ERP. Una sede que no existe da true: las puertas ya la rechazan antes con su propio mensaje.
create or replace function retail.fn_carga_inicial_abierta(p_ubicacion_id uuid)
returns boolean
language sql
stable
set search_path = retail, public, extensions
as $$
  select coalesce(
    (select u.carga_inicial_hasta is null or retail.fn_hoy_lima() <= u.carga_inicial_hasta
       from retail.ubicaciones u
      where u.id = p_ubicacion_id),
    true);
$$;

comment on function retail.fn_carga_inicial_abierta(uuid) is
  'ADR-0328: ¿la sede acepta carga inicial hoy? Sin fecha = sí; con fecha = hasta ese día inclusive (hora de Lima). Interna.';

revoke all on function retail.fn_carga_inicial_abierta(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. La frase (una sola vez)
-- ----------------------------------------------------------------------------
-- PROMETE: la frase en voz de tienda, con el nombre de la sede y la fecha corta («15-oct»). `p_para`: 'carga' (alta o
-- carga de stock inicial) o 'ajuste' (un ajuste sobre una prenda que nunca estuvo en la sede). ASUME: la sede está cerrada.
create or replace function retail.fn_texto_carga_inicial_cerrada(p_ubicacion_id uuid, p_para text default 'carga')
returns text
language sql
stable
set search_path = retail, public, extensions
as $$
  select case p_para
           when 'ajuste' then
             'Esta prenda nunca estuvo en ' || u.nombre || ' y su carga inicial se cerró el ' || f.corta
             || ': si la encontraste, regístrala con «Encontré prendas» y cuenta dónde estaba.'
           else
             'La carga inicial de ' || u.nombre || ' se cerró el ' || f.corta || '. Lo que encuentres entra por «Encontré prendas».'
         end
    from retail.ubicaciones u
   cross join lateral (
     select to_char(u.carga_inicial_hasta, 'FMDD') || '-'
            || (array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'])[extract(month from u.carga_inicial_hasta)::integer]
            as corta
   ) f
   where u.id = p_ubicacion_id;
$$;

comment on function retail.fn_texto_carga_inicial_cerrada(uuid, text) is
  'ADR-0328: la frase de la carga inicial cerrada de una sede («… se cerró el 15-oct. Lo que encuentres entra por «Encontré prendas».»). p_para: carga | ajuste. Interna.';

revoke all on function retail.fn_texto_carga_inicial_cerrada(uuid, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. El candado
-- ----------------------------------------------------------------------------
-- PROMETE: no hace nada si la sede está abierta; si está cerrada, P0001 con la frase y el hint `carga_inicial_cerrada`.
create or replace function retail.fn_exigir_carga_inicial_abierta(p_ubicacion_id uuid)
returns void
language plpgsql
stable
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_carga_inicial_abierta(p_ubicacion_id) then
    raise exception '%', retail.fn_texto_carga_inicial_cerrada(p_ubicacion_id, 'carga')
      using errcode = 'P0001', hint = 'carga_inicial_cerrada';
  end if;
end;
$$;

comment on function retail.fn_exigir_carga_inicial_abierta(uuid) is
  'ADR-0328: candado de la carga inicial por sede (hint carga_inicial_cerrada). Lo llama fn_cargar_stock_inicial, la única que escribe el motivo carga_inicial. Interna.';

revoke all on function retail.fn_exigir_carga_inicial_abierta(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. fn_cargar_stock_inicial: el candado, después de «puedes operar esta tienda» y antes de todo lo demás
-- ----------------------------------------------------------------------------
select pg_temp.cierre_carga_reemplazar(
  'retail.fn_cargar_stock_inicial(uuid, jsonb, text)',
  $v$  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then$v$,
  $n$  -- ADR-0328: pasada su fecha, la sede ya no acepta carga inicial (carga_inicial_cerrada). Antes de pedir responsable.
  perform retail.fn_exigir_carga_inicial_abierta(p_ubicacion_id);
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then$n$
);

-- ----------------------------------------------------------------------------
-- 4b. La cuarta puerta: `registrar_movimiento` (RPC de Ajustar) recibe el motivo como texto, así que una llamada directa
--     podía escribir una entrada «carga_inicial» sin pasar por el candado. Se cierra: el motivo `carga_inicial` lo escribe UNA función.
-- ----------------------------------------------------------------------------
select pg_temp.cierre_carga_reemplazar(
  'retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid)',
  $v$  if p_tipo not in ('entrada', 'salida', 'ajuste') then$v$,
  $n$  -- ADR-0328: el stock inicial entra SOLO por fn_cargar_stock_inicial (con su candado por sede); un movimiento suelto no se
  -- disfraza de carga inicial (carga_inicial_por_su_puerta).
  if lower(btrim(coalesce(p_motivo, ''))) = 'carga_inicial' then
    raise exception 'El stock inicial se carga desde Nuevo producto o desde Ajustar stock (prendas nuevas en la tienda), no como un movimiento suelto.'
      using hint = 'carga_inicial_por_su_puerta';
  end if;
  if p_tipo not in ('entrada', 'salida', 'ajuste') then$n$
);

-- ----------------------------------------------------------------------------
-- 5. La lectura para avisar antes (cualquier cuenta)
-- ----------------------------------------------------------------------------
-- PROMETE: {hoy, sedes: [{ubicacion_id, nombre, tipo, hasta, abierta}]} de las sedes activas, tiendas primero. «abierta»
-- sale de `fn_carga_inicial_abierta`, la misma que usa el candado: la pantalla y la base no pueden decir cosas distintas.
create or replace function retail.fn_carga_inicial_sedes()
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    'hoy', retail.fn_hoy_lima(),
    'sedes', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'ubicacion_id', u.id,
                 'nombre', u.nombre,
                 'tipo', u.tipo,
                 'hasta', u.carga_inicial_hasta,
                 'abierta', retail.fn_carga_inicial_abierta(u.id))
               order by case u.tipo when 'tienda' then 0 when 'taller' then 1 else 2 end, u.nombre)
        from retail.ubicaciones u
       where u.activo), '[]'::jsonb));
$$;

comment on function retail.fn_carga_inicial_sedes() is
  'ADR-0328: cada sede activa con su fecha de cierre de la carga inicial y si hoy está abierta, más el «hoy» de la base. Solo lectura, cualquier cuenta.';

revoke all on function retail.fn_carga_inicial_sedes() from public, anon;
grant execute on function retail.fn_carga_inicial_sedes() to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Fijar la fecha
-- ----------------------------------------------------------------------------
-- PROMETE: deja la fecha pedida (o ninguna) y devuelve {ubicacion_id, hasta, abierta, hoy}; anota el cambio en
-- configuracion_historial. Apretar lo hace un líder; aflojar, solo un Admin. ASUME: `fn_es_admin()` implica líder activo
-- (ADR-0178), así que el Admin pasa también el primer candado.
create or replace function retail.fijar_cierre_carga_inicial(p_ubicacion_id uuid, p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_actor uuid;
  v_nombre text;
  v_antes date;
  v_afloja boolean;
begin
  if not retail.fn_es_lider() then
    raise exception 'La fecha de cierre de la carga inicial la fija un líder.'
      using errcode = 'P0001', hint = 'carga_inicial_solo_lider';
  end if;

  -- Firma quien hace la operación (el combo «Responsable», ADR-0162). Primero quién, después qué.
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  -- La fila de la sede, tomada: dos cambios a la vez se ponen en fila y cada uno anota el «antes» que de verdad había.
  select u.nombre, u.carga_inicial_hasta into v_nombre, v_antes
    from retail.ubicaciones u
   where u.id = p_ubicacion_id and u.activo
     for update;
  if not found then
    raise exception 'Esa sede no existe o está archivada.' using errcode = 'P0001', hint = 'carga_inicial_sin_sede';
  end if;

  if p_fecha is not null and p_fecha < v_hoy then
    raise exception 'La fecha de cierre no puede ser un día que ya pasó: elige hoy o un día que viene.'
      using errcode = 'P0001', hint = 'carga_inicial_fecha_pasada';
  end if;

  if p_fecha is not distinct from v_antes then
    return jsonb_build_object('ubicacion_id', p_ubicacion_id, 'hasta', v_antes,
                              'abierta', retail.fn_carga_inicial_abierta(p_ubicacion_id), 'hoy', v_hoy);
  end if;

  -- Aflojar = dejar entrar más carga inicial de la que se dejaba: reabrir una sede ya cerrada (cualquier fecha nueva es hoy
  -- o después, así que la reabre), quitarle la fecha, o correr el cierre más adelante. Eso es del Admin: el tope es de Felipe.
  v_afloja := (v_antes is not null and v_antes < v_hoy)
           or p_fecha is null
           or (v_antes is not null and p_fecha > v_antes);
  if v_afloja and not retail.fn_es_admin() then
    raise exception 'Reabrir la carga inicial de %, quitarle la fecha o correr el cierre más adelante lo hace un Admin. Un líder puede adelantarlo o ponerle fecha si no tiene.', v_nombre
      using errcode = 'P0001', hint = 'carga_inicial_solo_admin';
  end if;

  update retail.ubicaciones set carga_inicial_hasta = p_fecha where id = p_ubicacion_id;
  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('cierre_carga_inicial', jsonb_build_object('ubicacion_id', p_ubicacion_id, 'antes', v_antes, 'despues', p_fecha), v_actor);

  return jsonb_build_object('ubicacion_id', p_ubicacion_id, 'hasta', p_fecha,
                            'abierta', retail.fn_carga_inicial_abierta(p_ubicacion_id), 'hoy', v_hoy);
end;
$$;

comment on function retail.fijar_cierre_carga_inicial(uuid, date) is
  'ADR-0328: fija (o quita) el último día de carga inicial de una sede. Líder: poner fecha o adelantarla (hoy o después). Solo Admin: reabrir una sede cerrada, quitar la fecha o correrla más adelante. Firma el responsable y anota en configuracion_historial.';

revoke all on function retail.fijar_cierre_carga_inicial(uuid, date) from public, anon;
grant execute on function retail.fijar_cierre_carga_inicial(uuid, date) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Actividad: la línea del cambio de fecha
-- ----------------------------------------------------------------------------
select pg_temp.cierre_carga_reemplazar(
  'retail.fn_actividad_configuracion(bigint, text)',
  $v$  elsif h.que = 'parametros_finanzas' then$v$,
  $n$  elsif h.que = 'cierre_carga_inicial' then
    -- ADR-0328: «fijó el cierre de la carga inicial de Tienda TRU: sin fecha → 15/10/2026».
    v_texto := case when nullif(d ->> 'despues', '') is null then 'quitó la fecha de cierre de la carga inicial'
                    else 'fijó el cierre de la carga inicial' end
      || v_tienda || ': '
      || coalesce(to_char(nullif(d ->> 'antes', '')::date, 'DD/MM/YYYY'), 'sin fecha') || ' → '
      || coalesce(to_char(nullif(d ->> 'despues', '')::date, 'DD/MM/YYYY'), 'sin fecha');
  elsif h.que = 'parametros_finanzas' then$n$
);

reset lock_timeout;

notify pgrst, 'reload schema';
