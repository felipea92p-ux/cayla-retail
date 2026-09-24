-- ============================================================================
-- 20260924110000_concurrencia_caja_e_indices.sql — CAYLA V2 · ADR-0188 (varios usuarios a la vez, etapa 1)
--
-- EL PROBLEMA PRIMERO. Auditoría de concurrencia y volumen del 2026-09-23 (Felipe: «que funcione con varios usuarios a la
-- vez y aguante muchos datos»). Tres hallazgos, los tres verificados contra producción:
--
--   1. UNA VENTA PODÍA CAER EN UNA CAJA YA CERRADA. `cerrar_caja` bloquea la caja (`for update`) y calcula el esperado,
--      pero las funciones que cobran la leían SIN bloqueo («¿hay caja abierta?»). La cajera cobra justo cuando la líder
--      cierra: la venta ve la caja abierta, el cierre no ve la venta (aún no terminó), y la venta termina guardada en una
--      caja CERRADA. El arqueo sale descuadrado y nadie sabe por qué.
--   2. RECIBIR MERCADERÍA TRABABA LAS VENTAS DE ESA PRENDA. `fn_recalcular_costo_variante` bloqueaba la variante con
--      `for update`. Ese candado choca con el que Postgres toma al guardar una línea de venta (la referencia a
--      `variantes`), así que una venta de una prenda que se estaba recibiendo esperaba a la recepción entera, y con dos
--      prendas en orden cruzado Postgres cancelaba una de las dos (bloqueo mutuo, 40P01).
--   3. FALTABAN ÍNDICES en las tablas que más se leen. `ventas` no tenía índice por caja ni por sede: la Caja en vivo
--      pregunta «¿hay ventas nuevas en esta caja?» cada 5 s por pestaña, y cada pregunta recorría la tabla entera
--      (13.100 consultas, 162 millones de filas leídas desde julio, con apenas 7 mil ventas). Lo mismo `stock` por sede,
--      `cambios`, `devoluciones` y `comprobantes` por fecha.
--
-- QUÉ HACE
--   A. Las 7 funciones que cobran o mueven dinero de una caja la leen con `for share`: `registrar_venta`,
--      `registrar_cambio`, `separar_prendas`, `entregar_separacion`, `aprobar_devolucion`, `liquidar_prenda_danada` y
--      `registrar_movimiento_caja`. `for share` no choca entre ventas (dos cajeras cobran a la vez sin esperarse), pero
--      SÍ con el `for update` de `cerrar_caja`: el cierre espera a que terminen las ventas en curso (y las cuenta), y una
--      venta que llega cuando el cierre ya empezó espera, relee la caja, la ve cerrada y recibe el mensaje de siempre
--      («No hay una caja abierta…»). Ninguna de las 7 actualiza `cajas`, así que el candado compartido no puede
--      trabarlas entre sí.
--   B. `fn_recalcular_costo_variante` bloquea con `for no key update`: sigue impidiendo que dos recepciones de la misma
--      prenda calculen el costo promedio a la vez, pero ya no choca con las ventas.
--   C. Índices para los filtros reales de la web y de las funciones (ver la lista abajo).
--
-- CÓMO. A y B se PARCHAN CON ANCLAS sobre la definición viva de cada base (`pg_get_functiondef`), igual que
-- `fn_proveedores` en 20260924100000: el Postgres local y producción tienen cuerpos distintos de estas funciones (otras
-- migraciones en vuelo, pegadas a mano), y copiar un cuerpo aquí pisaría la versión más nueva. Cada ancla tiene que
-- aparecer EXACTAMENTE una vez; si no aparece y el texto ya parchado sí, la función se da por hecha (re-pegable); en
-- cualquier otro caso aborta sin cambiar nada. `create or replace` con la misma firma conserva permisos y comentarios.
--
-- QUÉ NO HACE. No toca datos ni tablas (solo índices). No cambia ningún mensaje ni ninguna firma: la web no cambia.
-- Los índices se crean sin `concurrently` porque el SQL Editor corre en una transacción; con estos tamaños (< 25 mil
-- filas) tardan milisegundos.
--
-- CÓMO SE VERIFICÓ. Contra el Postgres local: la migración corre dos veces seguidas (la segunda no cambia nada), las
-- suites `pruebas:registrar-venta`, `pruebas:registrar-cambio`, `pruebas:aprobar-devolucion-caja`,
-- `pruebas:separaciones`, `pruebas:caja-cierre-traslado`, y una prueba de dos sesiones (cierre y venta a la vez).
--
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path`, no hace falta el prefijo `retail.`. Re-pegable.
-- ============================================================================

set search_path = retail, public, extensions;

-- ----------------------------------------------------------------------------
-- A y B. Candados: parche con anclas
-- ----------------------------------------------------------------------------

do $$
declare
  r record;
  f record;
  v_def text;
  v_veces int;
  v_hechas int := 0;
  v_ya int := 0;
begin
  for r in
    select * from (values
      ('registrar_venta',
       'from cajas where ubicacion_id = p_ubicacion_id and estado = ''abierta'';',
       'from cajas where ubicacion_id = p_ubicacion_id and estado = ''abierta'' for share;'),
      ('registrar_cambio',
       'from cajas where ubicacion_id = p_ubicacion_id and estado = ''abierta'';',
       'from cajas where ubicacion_id = p_ubicacion_id and estado = ''abierta'' for share;'),
      ('separar_prendas',
       'from cajas where ubicacion_id = p_ubicacion_id and estado = ''abierta'';',
       'from cajas where ubicacion_id = p_ubicacion_id and estado = ''abierta'' for share;'),
      ('aprobar_devolucion',
       'from cajas where ubicacion_id = d.ubicacion_id and estado = ''abierta'';',
       'from cajas where ubicacion_id = d.ubicacion_id and estado = ''abierta'' for share;'),
      ('entregar_separacion',
       'from cajas where ubicacion_id = s.ubicacion_id and estado = ''abierta'';',
       'from cajas where ubicacion_id = s.ubicacion_id and estado = ''abierta'' for share;'),
      ('liquidar_prenda_danada',
       'from cajas where ubicacion_id = pd.ubicacion_id and estado = ''abierta'';',
       'from cajas where ubicacion_id = pd.ubicacion_id and estado = ''abierta'' for share;'),
      -- Lee por id y DESPUÉS mira `v_caja.estado`: con `for share`, si el cierre ganó, la fila releída ya dice
      -- 'cerrada' y la función responde «Esta caja ya está cerrada…».
      ('registrar_movimiento_caja',
       'select * into v_caja from cajas where id = p_caja_id;',
       'select * into v_caja from cajas where id = p_caja_id for share;'),
      ('fn_recalcular_costo_variante',
       'from variantes where id = p_variante_id for update;',
       'from variantes where id = p_variante_id for no key update;')
    ) as t(fn, ancla, nuevo)
  loop
    if not exists (select 1 from pg_proc where proname = r.fn and pronamespace = 'retail'::regnamespace) then
      raise exception 'ADR-0188: no existe retail.%', r.fn;
    end if;

    for f in select oid from pg_proc where proname = r.fn and pronamespace = 'retail'::regnamespace loop
      v_def := pg_get_functiondef(f.oid);
      v_veces := (length(v_def) - length(replace(v_def, r.ancla, ''))) / length(r.ancla);

      if v_veces = 1 then
        execute replace(v_def, r.ancla, r.nuevo);
        v_hechas := v_hechas + 1;
      elsif v_veces = 0 and position(r.nuevo in v_def) > 0 then
        v_ya := v_ya + 1;  -- ya parchada (se volvió a pegar)
      else
        raise exception 'ADR-0188: retail.% no tiene el ancla esperada (aparece % veces). Revisar su definición antes de pegar.',
          r.fn, v_veces;
      end if;
    end loop;
  end loop;

  raise notice 'ADR-0188: % funciones parchadas, % ya lo estaban', v_hechas, v_ya;
end;
$$;

-- ----------------------------------------------------------------------------
-- C. Índices
-- ----------------------------------------------------------------------------

-- Caja en vivo (`useCajaEnVivo`, cada 5 s), resumen y serie de caja, cierre (`fn_calcular_esperado_caja`).
create index if not exists ventas_caja_idx on ventas (caja_id);
-- Historial de ventas, ventas del día y resúmenes por sede y rango de fechas.
create index if not exists ventas_ubicacion_fecha_idx on ventas (ubicacion_id, created_at desc, id desc);

-- Stock de una sede (Vender, Existencias). El único índice empezaba por `variante_id`.
create index if not exists stock_ubicacion_idx on stock (ubicacion_id);

-- Cambios: por caja (esperado de caja), por sede y fecha (estadísticas), y lo ya cambiado de una línea de venta.
create index if not exists cambios_caja_idx on cambios (caja_id);
create index if not exists cambios_ubicacion_fecha_idx on cambios (ubicacion_id, created_at desc);
create index if not exists cambios_venta_item_idx on cambios (venta_item_id);

-- Devoluciones: la tabla solo tenía la clave primaria.
create index if not exists devoluciones_caja_idx on devoluciones (caja_id);
create index if not exists devoluciones_venta_idx on devoluciones (venta_id);
create index if not exists devoluciones_ubicacion_fecha_idx on devoluciones (ubicacion_id, created_at desc);
create index if not exists devolucion_items_venta_item_idx on devolucion_items (venta_item_id);

-- Comprobantes del mes y búsqueda por documento de la clienta.
create index if not exists comprobantes_ubicacion_fecha_idx on comprobantes (ubicacion_id, created_at desc, id desc);
create index if not exists comprobantes_fecha_idx on comprobantes (created_at desc, id desc);
create index if not exists comprobantes_cliente_num_doc_idx on comprobantes (cliente_num_doc) where cliente_num_doc is not null;

-- Separaciones de una caja (esperado de caja).
create index if not exists separaciones_caja_idx on separaciones (caja_id) where caja_id is not null;

analyze ventas, stock, cambios, devoluciones, devolucion_items, comprobantes, separaciones;
