-- ============================================================================
-- 20261028232000_precio_de_tienda_por_combinacion_escribir_y_leer.sql — CAYLA V2 · ADR-0370 (act. 2026-10-28)
-- ACTIVIDAD 2 de 7: quien escribe las excepciones de precio por combinación (color y talla) en una tienda, su limpieza automática y
-- lo que las muestra. (La tabla y la regla de cobro están en 20261028230000: esta se pega DESPUÉS de esa.)
--
-- EL PROBLEMA PRIMERO. La tabla `precios_sede_variante` ya existe y `fn_precio_en_sede` ya la lee, pero nadie la escribe, y varias
-- funciones que MUESTRAN precios por tienda (la lista de «precios de esta tienda», el filtro de Productos por precio, el historial de la
-- prenda) solo conocen el precio de la prenda entera: con una excepción mostrarían un precio distinto al que se cobra. Y una excepción
-- puede quedar vieja sin que nadie lo note (la talla se apaga, el precio de la prenda pasa a ser el mismo).
--
-- QUÉ HACE
--   1. ESCRIBIR. `poner_precio_sede_variantes(prenda, tienda, {combinación: precio}, motivo)`: pone varias excepciones de una prenda en una
--      tienda, TODO O NADA (un error en una combinación deja todas como estaban). Mismos candados que el precio de la prenda
--      (`fn_precio_sede_exigir`: el módulo Productos —o Recibir, que lo pide desde su función—, tienda abierta, solo tu tienda) y los de
--      cada combinación: es de esa prenda y está activa, no es de obsequio, el precio va de más de 0 a 5 000 con dos decimales y no queda
--      bajo el costo de ESA talla (sin decir cuánto cuesta). Un precio igual al de lo de abajo (el de la prenda en esa tienda o, sin él, el
--      general) no se guarda como excepción: si había una, se quita.
--      `quitar_precio_sede_variante(combinación, tienda, motivo)`: la quita (queda archivada) y la combinación vuelve a lo de abajo.
--   2. LIMPIEZA SOLA (el cuidado de ADR-0370: nada queda guardado sin efecto). `fn_precio_sede_variante_depurar(prenda)` archiva la
--      excepción de una talla que se apagó o pasó a ser de obsequio, y la que quedó igual a lo de abajo. Corre en el mismo disparador
--      diferido que ya depura el precio de la prenda (`fn_variantes_depurar_precio_de_tienda`: al cambiar el precio general o activar y
--      apagar tallas), ahora también cuando la prenda solo tiene excepciones (`fn_producto_tiene_precio_de_tienda` las cuenta).
--   3. LA PRENDA ENTERA MANDA. Un precio NUEVO de la prenda en una tienda (`poner_precio_sede`, también el de Recibir «solo esta tienda»)
--      archiva las excepciones de sus combinaciones en esa tienda: «toda la prenda pasa a valer esto aquí». Se hace con un disparador sobre
--      `precios_sede_prenda`, así que ninguna puerta lo olvida. Quitar el precio de la prenda NO toca las excepciones: son filas aparte, con
--      su propio quitar. El historial de cada combinación dice lo que valía antes de ese cambio (`fn_precio_sede_antes_de_la_prenda`).
--   4. LEER. `fn_precios_en_sede(tienda)` también devuelve las combinaciones que solo tienen una excepción; `fn_producto_historia` cuenta
--      las excepciones entre «precios propios de una tienda» (hacen que la prenda no se pueda eliminar, como el precio de la prenda);
--      `fn_productos_filtro` aplica la misma regla de cobro en línea (la prueba exige que digan lo mismo en cada variante); y
--      `fn_precios_sede_variantes_producto(prenda)` lista las excepciones vigentes (tienda, combinación, precio, desde cuándo, quién).
--
-- LO QUE NO CAMBIA
--   · Sin ninguna excepción, todo devuelve lo mismo que ayer (se prueba contra la regla de ayer, combinación por combinación).
--   · `poner_precio_sede`, `quitar_precio_sede` y `fn_precios_sede_producto` (el precio de la PRENDA) siguen con su firma y su resultado.
--   · Ninguna función que cobra, aparta, cotiza, cambia o regulariza.
--
-- DESCARTÉ
--   · Que quitar el precio de la prenda borre también las excepciones: «quitar» no dice «quitar todo», y una excepción es un precio
--     absoluto de una combinación que quien la puso quiere ver y quitar por separado. Solo un precio NUEVO de la prenda es un «ahora todo vale
--     esto».
--   · Un disparador en `precios_sede_prenda` también al archivar: al quitar el precio de la prenda no hay un precio nuevo que decir.
--   · Cambiar el tipo de lo que devuelve `fn_precios_sede_producto`: la ficha de la prenda lo lee; las excepciones van en una función nueva.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe; hoy solo local), DESPUÉS de 20261028230000. UNA parte, sin políticas ni `drop trigger`
-- (ADR-0195): funciones, un `create or replace trigger` y reemplazos anclados que se detienen sin tocar nada si la función viva cambió.
-- Idempotente. Sin `select … into` dentro de textos entre comillas (ADR-0288). Prueba: `pnpm pruebas:precio-sede-variante`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Reemplazo anclado (el mismo de 20261013173000): falla si la función viva cambió, y es re-ejecutable.
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

-- ---------- 1. Escribir ----------

-- Pone varias excepciones de una prenda en una tienda. Devuelve cuántas cambiaron (una igual a lo de abajo que no existía, o el mismo precio y
-- motivo otra vez, no cuentan).
create or replace function retail.poner_precio_sede_variantes(
  p_producto_id uuid, p_ubicacion_id uuid, p_precios jsonb, p_motivo text
) returns integer
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_actor uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_prenda numeric;
  v_e record;
  v_id uuid;
  v_precio numeric(12,2);
  v_ok boolean;
  v_var_precio numeric;
  v_var_costo numeric;
  v_var_cat uuid;
  v_abajo numeric;
  v_vig retail.precios_sede_variante%rowtype;
  v_n integer := 0;
begin
  if p_precios is null or jsonb_typeof(p_precios) <> 'object' or p_precios = '{}'::jsonb then
    raise exception 'Elige al menos una combinación y su precio.' using hint = 'precio_sede_sin_combinaciones';
  end if;
  if length(v_motivo) < 3 then
    raise exception 'Escribe por qué esta tienda tiene otro precio.';
  end if;
  perform retail.fn_precio_sede_exigir(p_producto_id, p_ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);

  -- Lo que vale en esta tienda por debajo de las excepciones: el precio de la prenda aquí, si lo hay (si no, la grilla de cada combinación).
  -- `for … loop exit` y no la forma corta: el SQL Editor no se confunde (CLAUDE.md, «El SQL Editor agrega líneas por su cuenta»).
  for v_prenda in
    select ps.precio from retail.precios_sede_prenda ps
     where ps.producto_id = p_producto_id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null
  loop
    exit;
  end loop;

  for v_e in select e.key, e.value from jsonb_each(p_precios) e order by e.key loop
    begin
      v_id := v_e.key::uuid;
    exception when others then
      raise exception 'Una combinación no se entiende: vuelve a elegirla.' using hint = 'precio_sede_combinacion';
    end;
    begin
      v_precio := round((v_e.value #>> '{}')::numeric, 2);
    exception when others then
      raise exception 'Un precio no se entiende: escribe solo números.' using hint = 'precio_invalido';
    end;
    -- NaN (que numeric acepta y que Postgres ordena por ENCIMA de todo número) no pasa por «<= 0» ni por el tope: se rechaza aquí.
    if v_precio is null or v_precio = 'NaN'::numeric or v_precio <= 0 or v_precio > 5000 then
      raise exception 'Escribe un precio mayor que cero (hasta S/ 5,000).' using hint = 'precio_invalido';
    end if;

    v_ok := false;
    for v_var_precio, v_var_costo, v_var_cat in
      select v.precio, v.costo, pr.categoria_id
        from retail.variantes v join retail.productos pr on pr.id = v.producto_id
       where v.id = v_id and v.producto_id = p_producto_id and v.activo
    loop
      v_ok := true;
      exit;
    end loop;
    if not v_ok then
      raise exception 'Esa combinación no es de esta prenda o está desactivada.' using hint = 'precio_sede_combinacion';
    end if;
    -- La talla de obsequio vale S/ 0 en toda tienda (ADR-0384, 20261015121000): no tiene precio de tienda que cambiar.
    if v_var_precio = 0 and retail.fn_categoria_admite_precio_cero(v_var_cat) then
      raise exception 'Esa talla se regala (vale 0): un precio de tienda no la cambia.' using hint = 'precio_sede_obsequio';
    end if;
    -- El piso (Felipe 2026-10-11): igual que la caja, el precio de una tienda no baja del costo de la talla. El mensaje no dice cuánto cuesta.
    if v_precio < v_var_costo then
      raise exception 'Ese precio queda por debajo de lo que cuesta la prenda. Para liquidar usa una campaña (Catálogo ▸ Atributos ▸ Etiquetas).'
        using hint = 'precio_sede_bajo_costo';
    end if;

    v_abajo := coalesce(v_prenda, v_var_precio);
    v_vig := null;
    for v_vig in
      select * from retail.precios_sede_variante pv
       where pv.variante_id = v_id and pv.ubicacion_id = p_ubicacion_id and pv.archivado_en is null
    loop
      exit;
    end loop;

    if v_precio = v_abajo then
      -- Igual a lo de abajo no es una excepción: si había una, se quita.
      if v_vig.id is not null then
        update retail.precios_sede_variante
           set archivado_en = now(), archivado_por = v_actor, archivado_motivo = 'Quedó igual al precio de la prenda'
         where id = v_vig.id;
        perform retail.fn_precio_sede_anotar(v_id, p_ubicacion_id, v_vig.precio, true, v_abajo, v_prenda is not null, v_motivo, v_actor);
        v_n := v_n + 1;
      end if;
      continue;
    end if;

    -- Mismo precio y mismo motivo: nada que hacer. Un motivo diferente SÍ es un cambio: nace otra fila, con la misma fecha de inicio.
    if v_vig.id is not null and v_vig.precio = v_precio and v_vig.motivo = v_motivo then
      continue;
    end if;
    if v_vig.id is not null then
      update retail.precios_sede_variante set archivado_en = now(), archivado_por = v_actor where id = v_vig.id;
    end if;
    insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo, vigente_desde, creado_por)
    values (v_id, p_ubicacion_id, v_precio, v_motivo,
            case when v_vig.id is not null and v_vig.precio = v_precio then v_vig.vigente_desde else now() end, v_actor);
    perform retail.fn_precio_sede_anotar(v_id, p_ubicacion_id, coalesce(v_vig.precio, v_abajo), v_vig.id is not null or v_prenda is not null,
                                         v_precio, true, v_motivo, v_actor);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;
revoke all on function retail.poner_precio_sede_variantes(uuid, uuid, jsonb, text) from public, anon;
grant execute on function retail.poner_precio_sede_variantes(uuid, uuid, jsonb, text) to authenticated;
comment on function retail.poner_precio_sede_variantes(uuid, uuid, jsonb, text) is
  'ADR-0370 (act. 2026-10-28): excepciones de precio por combinación en una tienda ({variante_id: precio}), todo o nada. Los candados del precio de la prenda '
  '(módulo, tienda abierta, solo la tuya) y los de cada combinación (es de la prenda, no es de obsequio, no baja del costo de esa talla). Igual a lo de abajo = quitarla.';

-- Quita la excepción de una combinación en una tienda (queda archivada). Devuelve 1, o 0 si no había.
create or replace function retail.quitar_precio_sede_variante(p_variante_id uuid, p_ubicacion_id uuid, p_motivo text default null)
returns integer
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_actor uuid;
  v_producto uuid;
  v_grilla numeric;
  v_prenda numeric;
  v_vig retail.precios_sede_variante%rowtype;
begin
  for v_producto, v_grilla in select v.producto_id, v.precio from retail.variantes v where v.id = p_variante_id loop
    exit;
  end loop;
  if v_producto is null then
    raise exception 'Esa combinación no existe.' using hint = 'precio_sede_combinacion';
  end if;
  perform retail.fn_precio_sede_exigir(v_producto, p_ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);

  for v_vig in
    select * from retail.precios_sede_variante pv
     where pv.variante_id = p_variante_id and pv.ubicacion_id = p_ubicacion_id and pv.archivado_en is null
  loop
    exit;
  end loop;
  if v_vig.id is null then
    return 0;
  end if;
  update retail.precios_sede_variante
     set archivado_en = now(), archivado_por = v_actor, archivado_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = v_vig.id;
  for v_prenda in
    select ps.precio from retail.precios_sede_prenda ps
     where ps.producto_id = v_producto and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null
  loop
    exit;
  end loop;
  perform retail.fn_precio_sede_anotar(p_variante_id, p_ubicacion_id, v_vig.precio, true, coalesce(v_prenda, v_grilla), v_prenda is not null, p_motivo, v_actor);
  return 1;
end;
$fn$;
revoke all on function retail.quitar_precio_sede_variante(uuid, uuid, text) from public, anon;
grant execute on function retail.quitar_precio_sede_variante(uuid, uuid, text) to authenticated;
comment on function retail.quitar_precio_sede_variante(uuid, uuid, text) is
  'ADR-0370 (act. 2026-10-28): quita la excepción de precio de una combinación en una tienda; vuelve a valer el precio de la prenda aquí o el general.';

-- ---------- 2. Limpieza sola ----------

-- Archiva las excepciones de una prenda que ya no tienen efecto: la talla se apagó o es de obsequio, o quedó igual a lo de abajo.
create or replace function retail.fn_precio_sede_variante_depurar(p_producto_id uuid)
returns integer
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_vig record;
  v_prenda numeric;
  v_abajo numeric;
  v_motivo text;
  v_actor uuid;
  v_n integer := 0;
begin
  for v_vig in
    select pv.id, pv.variante_id, pv.ubicacion_id, pv.precio, v.activo, v.precio as grilla, pr.categoria_id
      from retail.precios_sede_variante pv
      join retail.variantes v on v.id = pv.variante_id
      join retail.productos pr on pr.id = v.producto_id
     where v.producto_id = p_producto_id and pv.archivado_en is null
     order by pv.id
  loop
    v_prenda := null;
    for v_prenda in
      select ps.precio from retail.precios_sede_prenda ps
       where ps.producto_id = p_producto_id and ps.ubicacion_id = v_vig.ubicacion_id and ps.archivado_en is null
    loop
      exit;
    end loop;
    v_abajo := coalesce(v_prenda, v_vig.grilla);
    if not v_vig.activo then
      v_motivo := 'La talla se desactivó';
    elsif v_vig.grilla = 0 and retail.fn_categoria_admite_precio_cero(v_vig.categoria_id) then
      v_motivo := 'La talla pasó a ser de obsequio';
    elsif v_vig.precio = v_abajo then
      v_motivo := 'Quedó igual al precio de la prenda';
    else
      continue;
    end if;
    if v_actor is null then
      v_actor := retail.fn_precio_sede_actor();
    end if;
    update retail.precios_sede_variante
       set archivado_en = now(), archivado_por = v_actor, archivado_motivo = v_motivo
     where id = v_vig.id;
    perform retail.fn_precio_sede_anotar(v_vig.variante_id, v_vig.ubicacion_id, v_vig.precio, true, v_abajo, v_prenda is not null, v_motivo, v_actor);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;
revoke all on function retail.fn_precio_sede_variante_depurar(uuid) from public, anon, authenticated;

-- El disparador diferido que ya depura el precio de la prenda: ahora también las excepciones (primero la prenda, de la que dependen).
select pg_temp.reemplazar('retail.fn_variantes_depurar_precio_de_tienda()',
$v$  if exists (select 1 from retail.precios_sede_prenda ps where ps.producto_id = new.producto_id and ps.archivado_en is null) then
    perform retail.fn_precio_sede_depurar(new.producto_id);
  end if;$v$,
$n$  if exists (select 1 from retail.precios_sede_prenda ps where ps.producto_id = new.producto_id and ps.archivado_en is null) then
    perform retail.fn_precio_sede_depurar(new.producto_id);
  end if;
  -- ADR-0370 (act. 2026-10-28): las excepciones por combinación también se depuran (la talla se apagó, quedó igual a lo de abajo).
  if exists (select 1 from retail.precios_sede_variante pv join retail.variantes vv on vv.id = pv.variante_id
              where vv.producto_id = new.producto_id and pv.archivado_en is null) then
    perform retail.fn_precio_sede_variante_depurar(new.producto_id);
  end if;$n$,
1);

-- «¿Esta prenda tiene un precio de tienda?» también si solo tiene excepciones: así el disparador «si tiene» corre para ella.
select pg_temp.reemplazar('retail.fn_producto_tiene_precio_de_tienda(uuid)',
$v$  select exists (select 1 from retail.precios_sede_prenda ps where ps.producto_id = p_producto_id and ps.archivado_en is null);$v$,
$n$  select exists (select 1 from retail.precios_sede_prenda ps where ps.producto_id = p_producto_id and ps.archivado_en is null)
      or exists (select 1 from retail.precios_sede_variante pv join retail.variantes vv on vv.id = pv.variante_id
                  where vv.producto_id = p_producto_id and pv.archivado_en is null);$n$,
1);

-- ---------- 3. La prenda entera manda ----------

-- Un precio NUEVO de la prenda en una tienda archiva las excepciones de sus combinaciones en esa tienda.
create or replace function retail.fn_precios_sede_prenda_limpia_excepciones() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  update retail.precios_sede_variante pv
     set archivado_en = now(), archivado_por = retail.fn_precio_sede_actor(),
         archivado_motivo = 'La prenda entera pasó a valer otro precio en esta tienda'
   where pv.ubicacion_id = new.ubicacion_id and pv.archivado_en is null
     and pv.variante_id in (select v.id from retail.variantes v where v.producto_id = new.producto_id);
  return null;
end;
$fn$;
revoke all on function retail.fn_precios_sede_prenda_limpia_excepciones() from public, anon, authenticated;

create or replace trigger precios_sede_prenda_limpia_excepciones
  after insert on retail.precios_sede_prenda
  for each row execute function retail.fn_precios_sede_prenda_limpia_excepciones();

-- Lo que valía una combinación justo antes de que la prenda entera pasara a valer otro precio (para que el historial no mienta).
create or replace function retail.fn_precio_sede_antes_de_la_prenda(p_variante_id uuid, p_ubicacion_id uuid)
returns numeric
language sql stable security definer set search_path = retail, public, extensions as $fn$
  select pv.precio from retail.precios_sede_variante pv
   where pv.variante_id = p_variante_id and pv.ubicacion_id = p_ubicacion_id
     and pv.archivado_en = now() and pv.archivado_motivo like 'La prenda entera%'
   order by pv.created_at desc limit 1;
$fn$;
revoke all on function retail.fn_precio_sede_antes_de_la_prenda(uuid, uuid) from public, anon, authenticated;

select pg_temp.reemplazar('retail.poner_precio_sede(uuid,uuid,numeric,text)',
$v$      coalesce(v_vig.precio, v_var.precio), v_vig.id is not null, v_precio, true, v_motivo, v_actor);$v$,
$n$      coalesce(retail.fn_precio_sede_antes_de_la_prenda(v_var.id, p_ubicacion_id), v_vig.precio, v_var.precio),
      v_vig.id is not null or retail.fn_precio_sede_antes_de_la_prenda(v_var.id, p_ubicacion_id) is not null, v_precio, true, v_motivo, v_actor);$n$,
1);

-- ---------- 4. Leer ----------

-- Las combinaciones que en esta tienda valen otro precio que su grilla: ahora también las que solo tienen una excepción.
select pg_temp.reemplazar('retail.fn_precios_en_sede(uuid)',
$v$retail.fn_precio_en_sede(v.id, ps.ubicacion_id) as precio
            from retail.precios_sede_prenda ps
            join retail.variantes v on v.producto_id = ps.producto_id
           where ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null and auth.uid() is not null) x$v$,
$n$retail.fn_precio_en_sede(v.id, p_ubicacion_id) as precio
            from retail.variantes v
           where auth.uid() is not null
             and (exists (select 1 from retail.precios_sede_prenda ps
                           where ps.producto_id = v.producto_id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null)
                  or exists (select 1 from retail.precios_sede_variante pv
                              where pv.variante_id = v.id and pv.ubicacion_id = p_ubicacion_id and pv.archivado_en is null))) x$n$,
1);

-- Las excepciones cuentan entre los «precios propios de una tienda» de la prenda (la hacen no eliminable, como su precio de tienda). El ancla es
-- el renglón de ANTES (el de la tabla histórica `precios_sede`) y no toca el del precio de la prenda: otra migración (20261014234000) ancla su
-- reemplazo sobre ese renglón tal cual, y una prueba que la recarga sobre la base ya migrada lo busca intacto.
select pg_temp.reemplazar('retail.fn_producto_historia(uuid)',
$v$        (select count(*) from retail.precios_sede x where x.variante_id in (select id from vs))$v$,
$n$        (select count(*) from retail.precios_sede x where x.variante_id in (select id from vs))
        + (select count(*) from retail.precios_sede_variante y where y.variante_id in (select id from vs))$n$,
1);

-- El filtro de Productos por precio: la misma regla de cobro, escrita en línea.
select pg_temp.reemplazar('retail.fn_productos_filtro(text,uuid,uuid,uuid,text[],text[],uuid[],text,text,text,numeric,numeric,text,uuid,boolean,uuid)',
$v$                else coalesce((select ps.precio from retail.precios_sede_prenda ps$v$,
$n$                else coalesce((select pv.precio from retail.precios_sede_variante pv
                                where pv.variante_id = v.id and pv.ubicacion_id = p_ubicacion_id and pv.archivado_en is null),
                              (select ps.precio from retail.precios_sede_prenda ps$n$,
1);

-- Las excepciones vigentes de una prenda, por tienda y combinación (la ficha de la prenda).
create or replace function retail.fn_precios_sede_variantes_producto(p_producto_id uuid)
returns table(variante_id uuid, ubicacion_id uuid, sede text, precio numeric, desde timestamptz, motivo text, creado_por_nombre text)
language sql stable security definer set search_path = retail, public, extensions as $fn$
  select pv.variante_id, pv.ubicacion_id, u.nombre, pv.precio, pv.vigente_desde, pv.motivo,
         nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), '')
    from retail.precios_sede_variante pv
    join retail.variantes v on v.id = pv.variante_id
    join retail.ubicaciones u on u.id = pv.ubicacion_id
    left join public.personas pe on pe.id = pv.creado_por
   where v.producto_id = p_producto_id and pv.archivado_en is null and auth.uid() is not null
   order by u.nombre, v.id;
$fn$;
revoke all on function retail.fn_precios_sede_variantes_producto(uuid) from public, anon;
grant execute on function retail.fn_precios_sede_variantes_producto(uuid) to authenticated;
comment on function retail.fn_precios_sede_variantes_producto(uuid) is
  'ADR-0370 (act. 2026-10-28): las excepciones de precio por combinación vigentes de una prenda, una fila por tienda y combinación.';

-- ---------- 5. Comprobación ----------
do $$
begin
  if to_regprocedure('retail.poner_precio_sede_variantes(uuid,uuid,jsonb,text)') is null
     or to_regprocedure('retail.quitar_precio_sede_variante(uuid,uuid,text)') is null
     or to_regprocedure('retail.fn_precios_sede_variantes_producto(uuid)') is null then
    raise exception 'faltan las funciones de escribir o leer las excepciones';
  end if;
  if position('fn_precio_sede_variante_depurar' in pg_get_functiondef('retail.fn_variantes_depurar_precio_de_tienda()'::regprocedure)) = 0 then
    raise exception 'el disparador de depuración no depura las excepciones';
  end if;
  if position('precios_sede_variante' in pg_get_functiondef('retail.fn_precios_en_sede(uuid)'::regprocedure)) = 0
     or position('precios_sede_variante' in pg_get_functiondef('retail.fn_producto_historia(uuid)'::regprocedure)) = 0
     or position('precios_sede_variante' in pg_get_functiondef('retail.fn_producto_tiene_precio_de_tienda(uuid)'::regprocedure)) = 0 then
    raise exception 'una función que muestra precios por tienda no cuenta las excepciones';
  end if;
  if position('precios_sede_variante' in pg_get_functiondef(
       'retail.fn_productos_filtro(text,uuid,uuid,uuid,text[],text[],uuid[],text,text,text,numeric,numeric,text,uuid,boolean,uuid)'::regprocedure)) = 0 then
    raise exception 'el filtro de Productos no aplica las excepciones';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'precios_sede_prenda_limpia_excepciones' and tgrelid = 'retail.precios_sede_prenda'::regclass) then
    raise exception 'falta el disparador que limpia las excepciones al poner el precio de la prenda';
  end if;
end;
$$;

reset lock_timeout;
