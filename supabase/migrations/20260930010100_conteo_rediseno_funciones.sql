-- ============================================================================
-- 20260930010100_conteo_rediseno_funciones.sql — CAYLA V2 · Inventario > Conteo (rediseño, 2026-09-29)
-- PARTE 2 de 2: las funciones. Requiere 20260930010000_conteo_rediseno_columnas.sql (parte 1).
--
-- EL PROBLEMA PRIMERO. Ver la parte 1: el conteo de hoy no tiene una lista de lo que se espera, no distingue «sin
-- contar» de «cero», deja cerrar aunque falten prendas y no obliga a mirar una diferencia antes de ajustar el stock.
-- Cada faltante que se cierra se vuelve un movimiento de ajuste y, en Finanzas, una merma (cuenta 659): un falso
-- faltante es una falsa pérdida contable. Esta parte hace que la BASE (no el botón de la pantalla) cumpla las reglas.
--
-- DECIDÍ
--   · El «debe haber» que manda es el stock leído con `for share` EN EL INSTANTE DE VERIFICAR cada variante
--     (`cantidad_sistema`). La foto al abrir es referencia; el libro `movimientos` explica la diferencia entre ambas.
--     Es correcto porque `stock` es la suma de `movimientos` (invariante verificado 103/103 en local): «foto + lo que
--     se movió entre abrir y verificar» es, por definición, el stock al verificar. Una venta de las 09:15 con la
--     variante verificada a las 09:20 no genera falta; una venta de las 09:24 con verificación a las 09:20 tampoco.
--   · El cierre aplica la diferencia como DELTA sobre el stock ACTUAL (`contado − debe_haber`), nunca «fijar el stock
--     en lo contado»: lo vendido después de verificar ya salió por su propio movimiento y se conserva.
--   · Cierre parcial = `cerrar_conteo(id, true)`: las variantes pendientes no se tocan (sin ajuste, `diferencia` NULL).
--     «Parcial» y «cancelado» son DERIVADOS (no hay estado nuevo en `conteos`).
--   · Un conteo abierto por ubicación (se conserva `conteos_un_abierto_por_ubicacion`): quien cuenta piso y almacén
--     los cuenta uno tras otro.
--   · Sububicación obligatoria en tiendas con piso/almacén (`abrir_conteo` recupera la guarda que se perdió en
--     20260916110000). El Taller (racks, stock sin sububicación) sigue contando toda la ubicación.
-- DESCARTÉ
--   · Reconciliar con una ventana `created_at > foto_en` como cifra que manda: `created_at` es `now()` = INICIO de la
--     transacción, no el orden en que se confirmó. Una venta en vuelo (empieza antes de la foto y confirma después)
--     daría un falso faltante de 1 unidad (probado por el explorador del contrato, caso t3), y con él una falsa merma.
--   · Que el cierre fije el stock en lo contado: resucitaría una venta hecha después de contar.
--   · Un estado nuevo en `conteos`: ver la parte 1.
-- SE ROMPE SI
--   · alguien cambia el cierre a `contado − stock_actual` o a «fijar stock», o una función escribe `stock` sin pasar por
--     `fn_aplicar_movimiento` (la foto y el libro dejarían de cuadrar);
--   · un lector nuevo de `conteo_items` cuenta filas sin mirar `cantidad_contada is not null` (exactitud inflada);
--   · dos celulares cuentan la MISMA variante del MISMO conteo a la vez esperando que se sumen: no se suman, gana el último
--     total guardado (cada verificación bloquea la fila de `conteos` y guarda el total, no un incremento; la partición por
--     tandas sigue en el BACKLOG). Lo que sí está cubierto: las ventas y el conteo no se pisan, porque la lectura del stock es
--     `for share` y una venta en curso espera a que la lectura termine, o la lectura espera a la venta.
--
-- LECTORES DE `conteo_items`/`conteos` AUDITADOS con `pg_proc.prosrc` (base local, 2026-09-29): abrir_conteo,
--   conteo_contar, cerrar_conteo, anular_conteo, archivar_conteo_prueba, previsualizar_cierre_conteo, fn_prioridad_conteo,
--   fn_conteos_resumen, fn_soles_diferencia_conteo, fn_movimientos, fn_movimientos_busqueda,
--   fn_movimientos_resumen_procesos, fn_producto_historia, eliminar_producto_con_historia (y fn_puede_ajustar_inventario,
--   que solo nombra el módulo «conteos»). CAMBIAN: abrir_conteo, conteo_contar, cerrar_conteo, fn_conteos_resumen.
--   SE ELIMINAN (sin dependientes SQL): previsualizar_cierre_conteo, fn_prioridad_conteo, fn_soles_diferencia_conteo.
--   NO CAMBIAN: anular_conteo y archivar_conteo_prueba (no leen cantidades); fn_movimientos, fn_movimientos_busqueda y
--   fn_movimientos_resumen_procesos (entran por `movimientos.conteo_item_id`: una fila pendiente nunca tiene
--   movimiento); fn_producto_historia y eliminar_producto_con_historia (una variante con stock ya tiene historia).
--
-- MARCAS DE PARCHE. Las migraciones 20260923120000 (conteo vacío) y 20260924120000 (ADR-0189) parchan estas funciones
-- por ancla y CI las vuelve a pegar y cuenta sus marcas (`concurrencia_linea_de_venta.mjs`, `conteo_vacio_no_se_cierra.mjs`).
-- Las funciones de abajo se reescriben desde su cuerpo VIVO y conservan UNA vez cada marca:
--   conteo_contar → «ADR-0189 (conteo-foto)» y la cadena del upsert que renueva el «debe haber»;
--   cerrar_conteo → «ADR-0189 (conteo-orden)» y «conteo_vacio_no_se_cierra».
-- Con la marca presente, volver a pegar 20260924120000 no cambia nada. 20260923120000 ya no se puede volver a pegar
-- (busca `cerrar_conteo(uuid)`, que esta migración elimina): falla con «no existe la función» y no toca nada.
--
-- PRODUCCIÓN: se pega tal cual en el SQL Editor (ya trae `retail.`). Solo crea/reemplaza/elimina funciones: no toma
-- candados de tablas en uso ni lleva políticas. `lock_timeout` de 3 s. Se puede pegar dos veces. Pegar DESPUÉS de la
-- parte 1 (las funciones usan sus columnas).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 0. Firmas viejas. `create or replace` no puede cambiar los parámetros ni el tipo que devuelve: sin este `drop`
--    quedarían DOS funciones con el mismo nombre (`una_sola_firma.mjs`). Con los tipos escritos, sin ambigüedad.
--    `drop function` no toma los candados de `auth`/`storage` (ADR-0195).
-- ----------------------------------------------------------------------------
drop function if exists retail.conteo_contar(uuid, uuid, integer);
drop function if exists retail.cerrar_conteo(uuid);
drop function if exists retail.fn_conteos_resumen(uuid, integer);
-- Se eliminan del todo: nada más en la base las llama (solo la pantalla vieja) y ya no hay prioridad por valor, ni
-- soles, ni «conviene contar primero» en Conteo. `fn_costos_variantes_json` NO se toca: la usan Compras y Catálogo.
drop function if exists retail.previsualizar_cierre_conteo(uuid);
drop function if exists retail.fn_prioridad_conteo(uuid, uuid);
drop function if exists retail.fn_soles_diferencia_conteo(uuid);

-- ----------------------------------------------------------------------------
-- 1. Ayudante: las líneas de un conteo, con su estado. ES LA ÚNICA REGLA de estados de línea que vive en SQL: la usan
--    `fn_conteo_detalle` (todas las líneas) y las funciones que guardan una línea (la devuelven ya calculada).
--    No valida permisos: solo la llaman funciones `security definer` que ya lo hicieron; por eso NO se le da EXECUTE
--    a `authenticated` (igual que `fn_aplicar_movimiento`).
--
--    Estados (regla única; la web usa la misma):
--      · Se IGNORA la línea SOLO si no está contada, no había nada al abrir Y nunca se mandó a recontar
--        (`contada_anterior` NULL): es la variante inesperada a la que se le borró la cantidad sin haberla recontado;
--        ni se cuenta ni se muestra. Si se mandó a recontar, la línea sigue a la vista como «en reconteo» y cuenta como
--        pendiente: una prenda que la persona ya encontró no puede desaparecer de la lista porque se le pidió volver
--        a contarla (foto 0 no significa «no importa», significa «CAYLA no la esperaba»).
--      · pendiente = sin contar y nunca contada; en_reconteo = sin contar pero con una cifra anterior;
--        correcta = contada igual al «debe haber»; con_diferencia = contada distinta y sin confirmar;
--        diferencia_confirmada = contada distinta y confirmada.
--    «Debe haber» = cantidad_sistema SIEMPRE; `foto` solo es nota. `actual` es el stock vivo (solo con el conteo
--    abierto): sirve para avisar «hoy hay 10 por movimientos posteriores».
-- ----------------------------------------------------------------------------
create or replace function retail.fn_conteo_lineas_json(
  p_conteo_id uuid,
  p_variante_id uuid default null,
  p_con_item boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $function$
  select coalesce(jsonb_agg(l.j order by l.variante_id), '[]'::jsonb)
    from (
      select ci.variante_id,
             jsonb_build_object(
               'variante_id', ci.variante_id,
               'debe_haber', ci.cantidad_sistema,
               'foto', coalesce(ci.cantidad_foto, ci.cantidad_sistema),
               'contada', ci.cantidad_contada,
               'anterior', ci.contada_anterior,
               'verificado_en', ci.verificado_en,
               'confirmada_en', ci.confirmada_en,
               'actual', case when c.estado = 'abierto' then coalesce(st.cantidad, 0) end,
               'diferencia', ci.cantidad_contada - ci.cantidad_sistema,
               'ajuste_movimiento_id', ci.movimiento_id,
               'estado', case
                 when ci.cantidad_contada is null and ci.contada_anterior is null then 'pendiente'
                 when ci.cantidad_contada is null then 'en_reconteo'
                 when ci.cantidad_contada = ci.cantidad_sistema then 'correcta'
                 when ci.confirmada_en is null then 'con_diferencia'
                 else 'diferencia_confirmada'
               end
             ) || case when p_con_item then jsonb_build_object('item_id', ci.id) else '{}'::jsonb end as j
        from conteo_items ci
        join conteos c on c.id = ci.conteo_id
        left join lateral (
          select sum(s.cantidad)::integer as cantidad
            from stock s
           where c.estado = 'abierto'
             and s.variante_id = ci.variante_id
             and s.ubicacion_id = c.ubicacion_id
             and (c.sububicacion_id is null or s.sububicacion_id = c.sububicacion_id)
        ) st on true
       where ci.conteo_id = p_conteo_id
         and (p_variante_id is null or ci.variante_id = p_variante_id)
         and not (ci.cantidad_contada is null and coalesce(ci.cantidad_foto, 0) = 0 and ci.contada_anterior is null)
    ) l;
$function$;

revoke all on function retail.fn_conteo_lineas_json(uuid, uuid, boolean) from public, anon, authenticated;

comment on function retail.fn_conteo_lineas_json(uuid, uuid, boolean) is
  'Las líneas de un conteo con su estado derivado (pendiente, correcta, con_diferencia, en_reconteo, diferencia_confirmada). '
  'Regla única de estados en SQL. Sin permisos propios: solo la llaman funciones security definer que ya los validaron; '
  'no se expone a la web.';

-- ----------------------------------------------------------------------------
-- 2. abrir_conteo — MISMA firma. Además de lo vigente (un abierto por ubicación, alcance coherente, firma del
--    responsable): sububicación obligatoria en tiendas con piso/almacén, y la FOTO de lo que hay.
--    La foto es UN solo `insert … select` desde `stock`: en READ COMMITTED una sentencia ve una imagen consistente de
--    todas las variantes, sin bloquear las ventas. No es autoritativa (ver «DECIDÍ»): el «debe haber» se relee al
--    verificar.
--    Foto de una ubicación sin sububicación (Taller): suma todas las filas de stock de la variante en esa ubicación, que
--    es exactamente lo que lee `conteo_contar` al verificar (así foto y «debe haber» hablan de lo mismo).
-- ----------------------------------------------------------------------------
create or replace function retail.abrir_conteo(
  p_ubicacion_id uuid,
  p_sububicacion_id uuid default null,
  p_alcance text default 'todo',
  p_alcance_categoria_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  v_id uuid;
  v_persona uuid;
  v_separa boolean;
  v_sub_tipo text;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para contar en esa ubicación';
  end if;
  if exists (select 1 from conteos where ubicacion_id = p_ubicacion_id and estado = 'abierto') then
    raise exception 'Ya hay un conteo abierto en esta ubicación — ciérralo antes de abrir otro';
  end if;
  if p_alcance not in ('todo', 'categoria') then
    raise exception 'Alcance de conteo desconocido: %', p_alcance;
  end if;
  if (p_alcance = 'categoria') <> (p_alcance_categoria_id is not null) then
    raise exception 'Elige una categoría cuando el alcance es "categoria", y ninguna cuando es "todo"';
  end if;

  -- Sububicación obligatoria si la ubicación separa piso y almacén: sin ella el conteo sumaría también la cuarentena
  -- y el cierre crearía filas de stock sin sububicación en una tienda que las separa. Solo se cuenta piso o almacén
  -- (la cuarentena tiene su propio proceso). Una ubicación sin esas sububicaciones (el Taller) cuenta TODA la ubicación
  -- con sububicación NULL: aquí cualquier sububicación es inválida.
  select exists (select 1 from sububicaciones
                  where ubicacion_id = p_ubicacion_id and tipo in ('piso_venta', 'almacen_tienda'))
    into v_separa;
  if v_separa then
    if p_sububicacion_id is null then
      raise exception 'Esta ubicación separa piso y almacén — el conteo debe indicar cuál'
        using errcode = 'P0001', hint = 'sububicacion_requerida';
    end if;
    select tipo into v_sub_tipo from sububicaciones
      where id = p_sububicacion_id and ubicacion_id = p_ubicacion_id;
    if v_sub_tipo is null or v_sub_tipo not in ('piso_venta', 'almacen_tienda') then
      raise exception 'Solo se puede contar el piso de venta o el almacén de tienda de esta ubicación'
        using errcode = 'P0001', hint = 'sububicacion_invalida';
    end if;
  elsif p_sububicacion_id is not null then
    raise exception 'Esta ubicación no separa piso y almacén: el conteo es de toda la ubicación'
      using errcode = 'P0001', hint = 'sububicacion_invalida';
  end if;

  v_persona := retail.fn_actor_persona_id(true);
  insert into conteos (ubicacion_id, sububicacion_id, abierto_por, alcance, alcance_categoria_id)
    values (p_ubicacion_id, p_sububicacion_id, v_persona, p_alcance, p_alcance_categoria_id)
    returning id into v_id;

  -- La foto: una fila pendiente (`cantidad_contada` NULL) por cada variante con stock en el lugar del conteo. Sin la
  -- pieza del sistema (el cargo especial no es una prenda) y, si el conteo es de una categoría, solo esa categoría.
  insert into conteo_items (conteo_id, variante_id, cantidad_foto, cantidad_sistema, cantidad_contada)
    select v_id, st.variante_id, sum(st.cantidad)::integer, sum(st.cantidad)::integer, null
      from stock st
      join variantes va on va.id = st.variante_id
      join productos p on p.id = va.producto_id
     where st.ubicacion_id = p_ubicacion_id
       and (p_sububicacion_id is null or st.sububicacion_id = p_sububicacion_id)
       and not fn_producto_es_pieza_del_sistema(p.id)
       and (p_alcance <> 'categoria' or p.categoria_id = p_alcance_categoria_id)
     group by st.variante_id
    having sum(st.cantidad) > 0;

  -- Después de copiar: el momento de la foto es el fin de la copia (`clock_timestamp()` avanza dentro de una transacción).
  update conteos set foto_en = clock_timestamp() where id = v_id;
  return v_id;
end;
$function$;

comment on function retail.abrir_conteo(uuid, uuid, text, uuid) is
  'Abre un conteo y congela la foto de lo que CAYLA espera: una fila pendiente por cada variante con stock en la sububicación '
  '(o en toda la ubicación si no separa piso y almacén), en un solo insert desde stock. Un conteo abierto por ubicación; '
  'sububicación obligatoria (piso o almacén) en tiendas que las separan (hints sububicacion_requerida / sububicacion_invalida).';

-- ----------------------------------------------------------------------------
-- 3. conteo_contar — verifica UNA variante (o la deja pendiente si p_cantidad_contada es NULL).
--    Reescrita desde el cuerpo vivo (con los parches de ADR-0189): conserva el orden de bloqueos (conteo `for update`,
--    luego stock de la prenda `for share`).
--    Firma con el responsable como todas las que guardan: el candado de asistencia es el mismo en todas partes.
-- ----------------------------------------------------------------------------
create or replace function retail.conteo_contar(
  p_conteo_id uuid,
  p_variante_id uuid,
  p_cantidad_contada integer,
  p_confirmo_fuera_de_alcance boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  c conteos%rowtype;
  v_item conteo_items%rowtype;
  v_sistema integer;
  v_categoria uuid;
begin
  select * into c from conteos where id = p_conteo_id for update;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;
  if c.estado <> 'abierto' then raise exception 'Ese conteo ya está %', c.estado; end if;
  if not fn_puede_operar_ubicacion(c.ubicacion_id) then
    raise exception 'No tienes permiso para contar en esa ubicación';
  end if;
  perform retail.fn_actor_persona_id(true);

  if p_cantidad_contada < 0 then
    raise exception 'La cantidad contada no puede ser negativa'
      using errcode = 'P0001', hint = 'cantidad_invalida';
  end if;

  -- NULL = des-contar: la variante vuelve a pendiente. No se borra la fila (así el conteo conserva su foto). El «debe
  -- haber» vuelve a la foto. Una variante inesperada (foto 0) a la que se le quita la cantidad queda ignorada, SALVO que
  -- ya se hubiera mandado a recontar: `contada_anterior` se conserva y entonces sigue visible «en reconteo».
  if p_cantidad_contada is null then
    update conteo_items
       set cantidad_contada = null, verificado_en = null, confirmada_en = null,
           cantidad_sistema = coalesce(cantidad_foto, 0)
     where conteo_id = p_conteo_id and variante_id = p_variante_id;
    return (retail.fn_conteo_lineas_json(p_conteo_id, p_variante_id, true)) -> 0;
  end if;

  -- conteo de ubicación completa (sububicacion_id null): sigue sumando TODAS las sububicaciones, igual que antes de
  -- que existiera esa columna. Conteo específico: filtra exacto.
  -- ADR-0189 (conteo-foto): `for share` sobre las filas de stock de la prenda en esta sede: si una venta la está
  -- moviendo, la lectura espera a que termine y la cuenta. Siempre en el mismo orden (por sububicación).
  perform 1 from stock
    where variante_id = p_variante_id and ubicacion_id = c.ubicacion_id
    order by sububicacion_id nulls first
    for share;

  select coalesce(sum(cantidad), 0) into v_sistema from stock
    where variante_id = p_variante_id and ubicacion_id = c.ubicacion_id
      and (c.sububicacion_id is null or sububicacion_id = c.sububicacion_id);

  -- Una variante que NO estaba en la foto y no es de la categoría del conteo: hay que confirmar que se agrega.
  select * into v_item from conteo_items where conteo_id = p_conteo_id and variante_id = p_variante_id;
  if not found and c.alcance = 'categoria' and not coalesce(p_confirmo_fuera_de_alcance, false) then
    select p.categoria_id into v_categoria
      from variantes va join productos p on p.id = va.producto_id
     where va.id = p_variante_id;
    if found and v_categoria is distinct from c.alcance_categoria_id then
      raise exception 'Esta prenda no pertenece al conteo actual.'
        using errcode = 'P0001', hint = 'fuera_de_alcance';
    end if;
  end if;

  -- Verificar = leer el stock AHORA y guardar el total contado. El «debe haber» se renueva en cada verificación: una
  -- venta hecha antes de contar ya no cuenta como falta. `verificado_en` se toma DESPUÉS de leer el stock.
  -- La foto (`cantidad_foto`) no se toca: una variante nueva nace con foto 0. Si la variante se mandó a recontar y sale la
  -- misma cifra que la vez anterior (y sigue habiendo diferencia), la diferencia queda confirmada sola.
  insert into conteo_items (conteo_id, variante_id, cantidad_foto, cantidad_sistema, cantidad_contada, verificado_en)
    values (p_conteo_id, p_variante_id, 0, v_sistema, p_cantidad_contada, clock_timestamp())
    on conflict (conteo_id, variante_id) do update set
      cantidad_sistema = excluded.cantidad_sistema,
      cantidad_contada = excluded.cantidad_contada,
      verificado_en = excluded.verificado_en,
      confirmada_en = case
        when conteo_items.contada_anterior is not null
         and excluded.cantidad_contada = conteo_items.contada_anterior
         and excluded.cantidad_contada <> excluded.cantidad_sistema
        then excluded.verificado_en
        else null
      end;

  return (retail.fn_conteo_lineas_json(p_conteo_id, p_variante_id, true)) -> 0;
end;
$function$;

revoke all on function retail.conteo_contar(uuid, uuid, integer, boolean) from public, anon;
grant execute on function retail.conteo_contar(uuid, uuid, integer, boolean) to authenticated;

comment on function retail.conteo_contar(uuid, uuid, integer, boolean) is
  'Verifica una variante de un conteo abierto: lee el stock ahora (for share), guarda el «debe haber» y lo contado, y devuelve '
  'la línea. NULL la deja pendiente; negativo se rechaza (cantidad_invalida); una variante fuera de la categoría del conteo '
  'pide confirmación (fuera_de_alcance). No borra la foto.';

-- ----------------------------------------------------------------------------
-- 4. conteo_recontar — manda a volver a contar una variante con diferencia. Guarda lo que se había contado (para
--    detectar «salió lo mismo» y confirmar sola) y la deja «en reconteo». El «debe haber» no cambia hasta la nueva
--    verificación. Vale también para una variante inesperada (foto 0): al tener `contada_anterior` deja de estar
--    ignorada, sigue en la lista como «en reconteo» y cuenta como pendiente (el cierre exige cierre parcial).
-- ----------------------------------------------------------------------------
create or replace function retail.conteo_recontar(p_conteo_id uuid, p_variante_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  c conteos%rowtype;
  v_filas integer;
begin
  select * into c from conteos where id = p_conteo_id for update;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;
  if c.estado <> 'abierto' then raise exception 'Ese conteo ya está %', c.estado; end if;
  if not fn_puede_operar_ubicacion(c.ubicacion_id) then
    raise exception 'No tienes permiso para contar en esa ubicación';
  end if;
  perform retail.fn_actor_persona_id(true);

  update conteo_items
     set contada_anterior = cantidad_contada, cantidad_contada = null, verificado_en = null, confirmada_en = null
   where conteo_id = p_conteo_id and variante_id = p_variante_id
     and cantidad_contada is not null and cantidad_contada <> cantidad_sistema;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'Solo se puede volver a contar una variante que tiene diferencia'
      using errcode = 'P0001', hint = 'recontar_no_aplica';
  end if;

  return (retail.fn_conteo_lineas_json(p_conteo_id, p_variante_id, true)) -> 0;
end;
$function$;

revoke all on function retail.conteo_recontar(uuid, uuid) from public, anon;
grant execute on function retail.conteo_recontar(uuid, uuid) to authenticated;

comment on function retail.conteo_recontar(uuid, uuid) is
  'Manda a volver a contar una variante verificada con diferencia: guarda lo contado en contada_anterior y la deja pendiente '
  '(«en reconteo»). Solo en un conteo abierto; si la variante no tiene diferencia, hint recontar_no_aplica.';

-- ----------------------------------------------------------------------------
-- 5. conteo_confirmar_diferencia — «sí, esta diferencia es real». Sin confirmar no se cierra el conteo.
--    Repetirla no cambia la hora de la primera confirmación (un doble clic no reescribe nada).
-- ----------------------------------------------------------------------------
create or replace function retail.conteo_confirmar_diferencia(p_conteo_id uuid, p_variante_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  c conteos%rowtype;
  v_filas integer;
begin
  select * into c from conteos where id = p_conteo_id for update;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;
  if c.estado <> 'abierto' then raise exception 'Ese conteo ya está %', c.estado; end if;
  if not fn_puede_operar_ubicacion(c.ubicacion_id) then
    raise exception 'No tienes permiso para contar en esa ubicación';
  end if;
  perform retail.fn_actor_persona_id(true);

  update conteo_items
     set confirmada_en = coalesce(confirmada_en, clock_timestamp())
   where conteo_id = p_conteo_id and variante_id = p_variante_id
     and cantidad_contada is not null and cantidad_contada <> cantidad_sistema;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'Solo se puede confirmar una variante que tiene diferencia'
      using errcode = 'P0001', hint = 'confirmar_no_aplica';
  end if;

  return (retail.fn_conteo_lineas_json(p_conteo_id, p_variante_id, true)) -> 0;
end;
$function$;

revoke all on function retail.conteo_confirmar_diferencia(uuid, uuid) from public, anon;
grant execute on function retail.conteo_confirmar_diferencia(uuid, uuid) to authenticated;

comment on function retail.conteo_confirmar_diferencia(uuid, uuid) is
  'Confirma que la diferencia de una variante es real (confirmada_en). Solo en un conteo abierto y sobre una línea con '
  'diferencia; si no, hint confirmar_no_aplica. Idempotente.';

-- ----------------------------------------------------------------------------
-- 6. fn_conteo_detalle — TODO lo que necesita la pantalla en UN solo jsonb (un solo renglón: no lo alcanza el tope de
--    1.000 filas de PostgREST, y un conteo de una tienda grande pasa de eso). Devuelve NULL si la persona no opera la
--    sede del conteo. Prefijo `fn_`: es lectura y el loader global no la bloquea.
--    El resumen se calcula DESDE las líneas ya con su estado, para que la regla de estados viva en un solo lugar:
--      variantes = verificadas + pendientes; verificadas = correctas + con_diferencia + confirmadas;
--      pendientes = pendiente + en_reconteo (todo lo no verificado); en_reconteo es una parte de pendientes.
--      unidades_* = sobre líneas verificadas con diferencia (confirmadas o no).
-- ----------------------------------------------------------------------------
create or replace function retail.fn_conteo_detalle(p_conteo_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $function$
declare
  c conteos%rowtype;
  v_lineas jsonb;
  v_conteo jsonb;
  v_resumen jsonb;
begin
  select * into c from conteos where id = p_conteo_id;
  if not found or not fn_puede_operar_ubicacion(c.ubicacion_id) then
    return null;
  end if;

  v_lineas := retail.fn_conteo_lineas_json(p_conteo_id);

  select jsonb_build_object(
           'id', c.id,
           'numero', c.numero,
           'estado', c.estado,
           'ubicacion_id', c.ubicacion_id,
           'sububicacion_id', c.sububicacion_id,
           'sububicacion_tipo', su.tipo,
           'sububicacion_nombre', su.nombre,
           'alcance', c.alcance,
           'alcance_categoria_id', c.alcance_categoria_id,
           'alcance_categoria_nombre', cat.nombre,
           'abierto_por', c.abierto_por,
           'abierto_por_nombre', nullif(trim(coalesce(pa.nombres, '') || ' ' || coalesce(pa.apellidos, '')), ''),
           'cerrado_por', c.cerrado_por,
           'cerrado_en', c.cerrado_en,
           'created_at', c.created_at,
           'foto_en', c.foto_en,
           'es_prueba', c.es_prueba)
    into v_conteo
    from (select 1) x
    left join sububicaciones su on su.id = c.sububicacion_id
    left join categorias cat on cat.id = c.alcance_categoria_id
    left join public.personas pa on pa.id = c.abierto_por;

  select jsonb_build_object(
           'variantes', count(*),
           'verificadas', count(*) filter (where (l ->> 'contada') is not null),
           'pendientes', count(*) filter (where (l ->> 'contada') is null),
           'correctas', count(*) filter (where l ->> 'estado' = 'correcta'),
           'con_diferencia', count(*) filter (where l ->> 'estado' = 'con_diferencia'),
           'confirmadas', count(*) filter (where l ->> 'estado' = 'diferencia_confirmada'),
           'en_reconteo', count(*) filter (where l ->> 'estado' = 'en_reconteo'),
           'unidades_sobrantes', coalesce(sum((l ->> 'diferencia')::integer) filter (where (l ->> 'diferencia')::integer > 0), 0),
           'unidades_faltantes', coalesce(sum(-(l ->> 'diferencia')::integer) filter (where (l ->> 'diferencia')::integer < 0), 0))
    into v_resumen
    from jsonb_array_elements(v_lineas) l;

  return jsonb_build_object('conteo', v_conteo, 'resumen', v_resumen, 'lineas', v_lineas);
end;
$function$;

revoke all on function retail.fn_conteo_detalle(uuid) from public, anon;
grant execute on function retail.fn_conteo_detalle(uuid) to authenticated;

comment on function retail.fn_conteo_detalle(uuid) is
  'El conteo completo para la pantalla en un solo jsonb: {conteo, resumen, lineas[]}. Cada línea trae debe_haber, foto, contada, '
  'anterior, actual (stock vivo, solo con el conteo abierto), diferencia y estado derivado. NULL si la persona no opera la sede '
  'del conteo. Lectura (prefijo fn_): el loader global no la bloquea.';

-- ----------------------------------------------------------------------------
-- 7. cerrar_conteo — reescrita desde el cuerpo vivo (con los parches de 20260922200000, 20260923100000,
--    20260923120000 y 20260924120000).
--    ORDEN DE ERRORES (todos P0001 con hint; primero lo de siempre, luego las reglas nuevas):
--      existe → ya no está abierto → permiso (ajustar inventario y operar la sede) → sin variantes verificadas
--      → pendientes sin cierre parcial → diferencias sin confirmar.
--    Las reglas nuevas van DESPUÉS del permiso (a quien no puede cerrar le sigue saliendo el mensaje de permiso; a una
--    terminal sin responsable, «Elige quién hace esta operación») y ANTES de tocar stock: si algo falla, no se movió nada.
--    Todo o nada: un ajuste que dejaría el stock negativo, o por debajo de lo apartado, aborta el cierre entero.
-- ----------------------------------------------------------------------------
create or replace function retail.cerrar_conteo(p_conteo_id uuid, p_parcial boolean default false)
returns table(
  lineas_ajustadas integer,
  unidades_sobrantes integer,
  unidades_faltantes integer,
  lineas_correctas integer,
  lineas_pendientes integer
)
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  c conteos%rowtype; r record; v_dif integer; v_mov_id uuid; v_persona uuid;
  v_ajustadas integer := 0; v_sobran integer := 0; v_faltan integer := 0; v_correctas integer := 0;
  v_verificadas integer; v_pendientes integer; v_sin_confirmar integer;
begin
  select * into c from conteos where id = p_conteo_id for update;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;
  if c.estado <> 'abierto' then raise exception 'Ese conteo ya está %', c.estado; end if;
  if not fn_puede_ajustar_inventario() then
    raise exception 'Solo un líder puede cerrar un conteo — es la aprobación de lo contado';
  end if;
  if not fn_puede_operar_ubicacion(c.ubicacion_id) then
    raise exception 'No tienes permiso sobre esa ubicación';
  end if;
  v_persona := retail.fn_actor_persona_id(true);

  -- Estado del conteo con la regla única: verificada = contada; pendiente = sin contar y NO ignorada (es decir, con algo
  -- esperado al abrir, o mandada a recontar: incluye las que están en reconteo, también una inesperada); sin confirmar =
  -- contada, distinta del «debe haber» y sin confirmar.
  select count(*) filter (where cantidad_contada is not null),
         count(*) filter (where cantidad_contada is null and (coalesce(cantidad_foto, 0) > 0 or contada_anterior is not null)),
         count(*) filter (where cantidad_contada is not null and cantidad_contada <> cantidad_sistema and confirmada_en is null)
    into v_verificadas, v_pendientes, v_sin_confirmar
    from conteo_items where conteo_id = p_conteo_id;

  -- conteo_vacio_no_se_cierra (ADR-0174): sin variantes verificadas no hay nada que aprobar; se cancela.
  if v_verificadas = 0 then
    raise exception 'Este conteo no tiene ninguna variante verificada: no se cierra. Si no se va a contar, cancélalo.'
      using errcode = 'P0001', hint = 'conteo_vacio';
  end if;
  if v_pendientes > 0 and not coalesce(p_parcial, false) then
    raise exception '%', case when v_pendientes = 1 then 'Falta 1 variante por contar'
                              else format('Faltan %s variantes por contar', v_pendientes) end
      || '. Vuelve a contar o cierra como conteo parcial.'
      using errcode = 'P0001', hint = 'conteo_pendientes';
  end if;
  if v_sin_confirmar > 0 then
    raise exception '%', case when v_sin_confirmar = 1 then 'Hay 1 variante con diferencia sin confirmar'
                              else format('Hay %s variantes con diferencia sin confirmar', v_sin_confirmar) end
      || '. Confirma o vuelve a contar cada una antes de cerrar.'
      using errcode = 'P0001', hint = 'diferencias_sin_confirmar';
  end if;

  -- ADR-0189 (conteo-orden): el stock de las prendas con diferencia, bloqueado de una vez y en orden de prenda
  -- (lo mismo que tomaría el ajuste, `for no key update`): dos procesos que ajustan varias prendas no se cruzan.
  perform 1 from stock s
    where s.ubicacion_id = c.ubicacion_id
      and s.variante_id in (select ci.variante_id from conteo_items ci
                             where ci.conteo_id = p_conteo_id and ci.diferencia is null
                               and ci.cantidad_contada is not null and ci.cantidad_contada <> ci.cantidad_sistema)
    order by s.variante_id, s.sububicacion_id nulls first
    for no key update;

  -- Solo las líneas verificadas, en orden de variante (el mismo orden de los bloqueos). Las pendientes no se tocan:
  -- ni ajuste, ni `diferencia`. La diferencia es contada − «debe haber» y se aplica como DELTA sobre el stock ACTUAL:
  -- lo vendido después de verificar ya salió por su propio movimiento y se conserva. Un ajuste de cierre es siempre
  -- `tipo = 'ajuste'`, `motivo = 'conteo'` y lleva `conteo_item_id`: Finanzas y Movimientos lo leen así.
  for r in select * from conteo_items
            where conteo_id = p_conteo_id and cantidad_contada is not null and diferencia is null
            order by variante_id loop
    v_dif := r.cantidad_contada - r.cantidad_sistema;
    v_mov_id := null;
    if v_dif <> 0 then
      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, conteo_item_id, usuario_id)
        values (r.variante_id, c.ubicacion_id, c.sububicacion_id, 'ajuste', v_dif, 'conteo', r.id, v_persona)
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
      v_ajustadas := v_ajustadas + 1;
      if v_dif > 0 then v_sobran := v_sobran + v_dif; else v_faltan := v_faltan - v_dif; end if;
    else
      v_correctas := v_correctas + 1;
    end if;
    update conteo_items set diferencia = v_dif, movimiento_id = v_mov_id where id = r.id;
  end loop;

  update conteos set estado = 'cerrado', cerrado_en = now(), cerrado_por = v_persona where id = p_conteo_id;

  return query select v_ajustadas, v_sobran, v_faltan, v_correctas, v_pendientes;
end;
$function$;

revoke all on function retail.cerrar_conteo(uuid, boolean) from public, anon;
grant execute on function retail.cerrar_conteo(uuid, boolean) to authenticated;

comment on function retail.cerrar_conteo(uuid, boolean) is
  'Cierra un conteo abierto: ajusta el stock con un movimiento por cada variante verificada con diferencia (contado − debe haber, '
  'como delta sobre el stock actual). Rechaza (P0001): sin variantes verificadas (conteo_vacio), con pendientes sin p_parcial '
  '(conteo_pendientes) y con diferencias sin confirmar (diferencias_sin_confirmar). Las pendientes de un cierre parcial no se tocan. '
  'Devuelve líneas ajustadas, unidades sobrantes y faltantes, líneas correctas y líneas pendientes.';

-- ----------------------------------------------------------------------------
-- 8. fn_conteos_resumen — el historial. MISMAS columnas y orden que antes, SALVO: sin `soles_diferencia` (Conteo ya no
--    muestra plata) y con dos al final. `lineas`, `lineas_con_diferencia`, `sistema`, `contado` y `diferencia` cuentan SOLO
--    variantes verificadas: una pendiente no infla la exactitud (Análisis: `lineas_con_diferencia / lineas`).
--    Sigue siendo `security invoker`: la lista de conteos y sus líneas la limita la seguridad por filas.
--      pendientes = líneas sin contar y no ignoradas (pendiente o en reconteo, esta última también si es una inesperada).
--      parcial    = cerrado con pendientes.
-- ----------------------------------------------------------------------------
create or replace function retail.fn_conteos_resumen(p_ubicacion_id uuid, p_limite integer default 20)
returns table(
  id uuid,
  numero integer,
  estado text,
  created_at timestamptz,
  cerrado_en timestamptz,
  sububicacion_id uuid,
  sububicacion_nombre text,
  sububicacion_tipo text,
  alcance text,
  alcance_categoria_nombre text,
  abierto_por uuid,
  cerrado_por uuid,
  lineas integer,
  lineas_con_diferencia integer,
  sistema integer,
  contado integer,
  diferencia integer,
  pendientes integer,
  parcial boolean
)
language sql
stable
security invoker
set search_path = retail, public, extensions
as $function$
  select c.id,
         c.numero,
         c.estado,
         c.created_at,
         c.cerrado_en,
         c.sububicacion_id,
         s.nombre,
         s.tipo,
         c.alcance,
         cat.nombre,
         c.abierto_por,
         c.cerrado_por,
         coalesce(agg.lineas, 0),
         coalesce(agg.lineas_con_diferencia, 0),
         coalesce(agg.sistema, 0),
         coalesce(agg.contado, 0),
         coalesce(agg.diferencia, 0),
         coalesce(agg.pendientes, 0),
         (c.estado = 'cerrado' and coalesce(agg.pendientes, 0) > 0)
    from conteos c
    left join sububicaciones s on s.id = c.sububicacion_id
    left join categorias cat on cat.id = c.alcance_categoria_id
    left join lateral (
      select count(*) filter (where ci.cantidad_contada is not null)::integer as lineas,
             count(*) filter (where ci.cantidad_contada is not null and ci.cantidad_contada <> ci.cantidad_sistema)::integer as lineas_con_diferencia,
             (sum(ci.cantidad_sistema) filter (where ci.cantidad_contada is not null))::integer as sistema,
             sum(ci.cantidad_contada)::integer as contado,
             sum(ci.cantidad_contada - ci.cantidad_sistema)::integer as diferencia,
             count(*) filter (where ci.cantidad_contada is null and (coalesce(ci.cantidad_foto, 0) > 0 or ci.contada_anterior is not null))::integer as pendientes
        from conteo_items ci
       where ci.conteo_id = c.id
    ) agg on true
   where c.ubicacion_id = p_ubicacion_id
   order by (c.estado = 'abierto') desc, c.created_at desc
   limit greatest(p_limite, 1);
$function$;

revoke all on function retail.fn_conteos_resumen(uuid, integer) from public, anon;
grant execute on function retail.fn_conteos_resumen(uuid, integer) to authenticated;

comment on function retail.fn_conteos_resumen(uuid, integer) is
  'Historial de conteos de una ubicación (el abierto primero, luego los más recientes). lineas, lineas_con_diferencia, sistema, '
  'contado y diferencia cuentan SOLO variantes verificadas; pendientes cuenta las que faltan por contar; parcial = cerrado con '
  'pendientes. Security invoker: la seguridad por filas decide qué conteos ve cada persona.';
