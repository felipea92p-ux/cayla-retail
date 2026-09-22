-- ============================================================================
-- 20260923020000_actor_firma_las_operaciones.sql — CAYLA V2 · ADR-0162, fase F3
--
-- EL PROBLEMA PRIMERO. Las funciones de retail averiguan quién opera con
--     select id into v_persona from [public.]personas where auth_user_id = auth.uid();
-- (la variable cambia: v_persona, v_quien, v_persona_id, v_usuario_id). Una terminal del ADR-0162 NO tiene
-- persona: esa búsqueda le devuelve NULL, y la operación o se cae (usuario_id not null) o queda firmada por
-- nadie. La F2 dejó lista `retail.fn_actor_persona_id(p_de_tienda)`: con sesión de terminal devuelve el
-- responsable elegido en el combo (presente en la tienda, si no lanza 42501); con sesión de persona devuelve a
-- la persona misma (mientras `fn_exige_responsable()` siga apagado y no llegue `x-responsable`).
--
-- QUÉ HACE. Recorre las funciones de `retail` desde su definición VIVA (`pg_get_functiondef`, nunca copiando
-- cuerpos del repo: en producción se pegan a mano y el repo puede ir atrás) y cambia esa línea por
--     v_persona := retail.fn_actor_persona_id(true|false);
-- exigiendo EXACTAMENTE una ocurrencia por función. Re-ejecutable: si ya tiene el reemplazo con el mismo
-- booleano, no hace nada.
--
-- FALLA CERRADA. Aborta sin tocar nada (todo va en un solo DO: una excepción deshace lo ya reemplazado) si:
--   · aparece una función con el patrón que no está en NINGUNA lista (alguien agregó una nueva: clasifícala);
--   · una función listada no existe, o no tiene ni el patrón ni el reemplazo (cambió: revísala a mano);
--   · tiene el patrón más de una vez, o ya tiene el reemplazo con el OTRO booleano (cambió su clasificación);
--   · falta la F2 (`fn_actor_persona_id`).
--
-- ¿POR QUÉ UN BOOLEANO? `true` = operación de TIENDA: con sesión de persona, si llega `x-responsable` firma
-- el responsable (ADR-0161). `false` = operación que no es de tienda: la persona firma SIEMPRE a su nombre,
-- aunque llegue el encabezado. Con sesión de terminal da igual: firma el responsable presente, siempre.
--
-- CLASIFICACIÓN (por nombre; la tabla de verdad está en los arreglos del bloque de abajo)
--   DE TIENDA (true, 34 mecánicas + 2 a mano = 36): ventas, caja, cambios, devoluciones, comprobantes,
--     movimientos e inventario (ajustes, movimiento interno, prendas dañadas/cuarentena), apartados, conteos,
--     traslados y su recepción, pedidos no atendidos y clientas, y los disparadores del Catálogo (estado de
--     productos/colores/patrones/tallas/tejidos/etiquetas y el historial de cambios de productos/variantes).
--   NO DE TIENDA (false, 29): Compras entero (registrar, pagar, notas de crédito, reembolsos, adjuntos,
--     reasignar reparto, cerrar ítems, recibir compras/lotes/envíos), Producción y Taller (órdenes,
--     insumos, comprobantes y pagos de producción, costo de variante) y Colaboradores (altas, bajas,
--     suspensiones, comprador de tienda).
--
-- A MANO (2): la variable de persona NO solo firma, también AUTORIZA. Cambiarla por el responsable (elegido
-- sin PIN) cambiaría quién tiene permiso. Se firma con el actor, pero el permiso se sigue mirando en la
-- CUENTA, y una terminal (que no tiene persona) cae en el lado cerrado hasta que Felipe decida:
--   · registrar_venta: el tope de descuento de venta (D-67) se leía de `colaboradores` por v_persona. Con el
--     responsable, elegir a una líder (tope NULL = sin tope) daría descuento ilimitado a cualquiera en la
--     terminal. Ahora: tope de la CUENTA; una terminal tiene tope 0 (todo descuento de venta pide `p_autorizado_por`
--     líder). Los descuentos por línea ya miraban `fn_es_lider()` (la cuenta) y no cambian.
--   · liberar_apartado: «solo quien apartó o una líder» comparaba `a.creado_por = v_persona`. Ahora compara con la
--     persona de la CUENTA y con `coalesce(…, false)`: una terminal no libera apartados (solo la líder). Sin el
--     coalesce, en una terminal `null = x` es NULL, `if not (false or NULL)` NO lanza y el candado quedaba abierto.
--
-- SE QUEDAN ASÍ, A PROPÓSITO (miran `auth.uid()` porque preguntan por la CUENTA, no por quien firma)
--   Los permisos son de la cuenta: si `fn_es_lider()` mirara al responsable, elegir a una líder en el combo le
--   daría a la terminal poderes de líder.
--   · Patrón mecánico, pero es identidad y no firma: `actualizar_mi_foto_perfil` («MI foto»: en una terminal no
--     hay persona y la actualización no toca ninguna fila; con el actor cambiaría la foto del responsable).
--   · Ayudantes de permisos (otra forma, `where p.auth_user_id = auth.uid() and p.estado = 'activo'`):
--     fn_es_lider, fn_tiene_acceso_retail, fn_ubicacion_actual_persona, fn_stock_por_sede, fn_compras_ubicaciones,
--     fn_mi_perfil, fn_persona_actual_resumen, fn_persona_nueva_resumen, fn_terminal_actual (la terminal misma) y
--     fn_actor_persona_id (su rama de persona).
--   · fn_colaboradores: marca «Tú» en la lista (`p.auth_user_id = auth.uid()`): es la cuenta que mira.
--   · listar_apartados: la colaboradora ve SUS apartados (`creado_por = (select … auth.uid())`) — visibilidad, permiso.
--   · fn_historial_colaborador y desactivar_terminal: firman con un `(select id … auth.uid())` en línea, pero solo
--     los llama un líder (una terminal nunca es líder), así que actor y cuenta son la misma persona.
--   · Las que solo preguntan `auth.uid() is null` / `is not null` (hay sesión o no): no buscan persona.
--
-- REVISADAS Y MECÁNICAS AUNQUE USAN LA VARIABLE PARA ALGO MÁS QUE FIRMAR
--   · quitar_colaborador / suspender_colaborador (`if p_persona_id = v_quien`: «no te quites a ti mismo»): son
--     `false` → con sesión de persona el actor ES la cuenta (idéntico a hoy); una terminal no pasa `fn_es_lider()`.
--   · apartar_stock / registrar_pedido_no_atendido (`if v_persona is null then raise`): el actor nunca devuelve
--     NULL con sesión de terminal (lanza antes), así que el chequeo sigue valiendo para una cuenta sin persona.
--   · confirmar_traslado (`coalesce(confirmado_por, v_persona)`): firma, no permiso.
--
-- SE ROMPE SI
--   · Otra migración recrea alguna de estas funciones copiando su cuerpo VIEJO del repo: vuelve la búsqueda por
--     `auth.uid()` y la terminal firma NULL (o se cae). Falla visible, no silenciosa: `pnpm pruebas:actor-firma`
--     lo detecta (ninguna función fuera de la lista de permisos conserva el patrón).
--   · La web manda `x-responsable` (sin `x-ubicacion`) en una llamada de Compras/Producción cuyo INSERT dispara
--     un disparador de Catálogo (`true`): con sesión de persona, ese disparador pediría la tienda y lanzaría 42501.
--     Regla para la F4: el encabezado se manda solo en pantallas de tienda.
--   · Alguien cambia `fn_es_lider()` para que mire al actor: ver la F2.
--
-- Re-ejecutable. En el repo SIN prefijo `retail.` en lo que el search_path resuelve; al pegar en el SQL
-- Editor de producción, empezar con `set search_path to retail, public, extensions;` (todo lo que toca esta
-- migración ya va con `retail.` explícito). Requiere la F2 (`20260923010000_terminales_sin_persona.sql`).
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. Herramienta temporal (vive en pg_temp, desaparece al cerrar la sesión) ====================
-- Mismo patrón que `pg_temp.reemplazar` del ADR-0160: reemplaza un texto exacto en la definición REAL de una
-- función exigiendo `p_veces` ocurrencias. Re-ejecutable: si ya no está el viejo y sí el nuevo, no hace nada.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  if to_regprocedure(p_firma) is null then
    raise notice '% no existe en esta base; se omite (al pegar su migración, volver a pegar esta).', p_firma;
    return;
  end if;
  v_def := pg_get_functiondef(p_firma::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n = 0 and position(p_nuevo in v_def) > 0 then
    return;
  end if;
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % ocurrencias de "%" y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ==================== 2. El reemplazo mecánico ====================
do $migracion$
declare
  -- El patrón, tolerante a espacios: `select id into <var> from [public.]personas where auth_user_id = auth.uid();`
  c_patron constant text := 'select\s+id\s+into\s+(\w+)\s+from\s+(?:public\.)?personas\s+where\s+auth_user_id\s*=\s*auth\.uid\(\)\s*;';

  -- DE TIENDA (true). Firmadas por el responsable si llega `x-responsable` (siempre, en una terminal).
  v_de_tienda text[] := array[
    -- ventas, comprobantes y clientas
    'anular_venta', 'crear_proforma', 'emitir_comprobante', 'emitir_nota', 'anular_comprobante',
    'marcar_comprobante_no_emitido', 'registrar_clienta', 'registrar_pedido_no_atendido',
    -- caja
    'archivar_serie_comprobante', -- solo en producción (Facturación: operación de tienda)
    'abrir_caja', 'cerrar_caja', 'registrar_movimiento_caja',
    -- cambios y devoluciones
    'registrar_cambio', 'crear_devolucion', 'aprobar_devolucion', 'rechazar_devolucion',
    -- inventario: movimientos, ajustes, movimiento interno, prendas dañadas (cuarentena), apartados, conteos
    'registrar_movimiento', 'mover_interno', 'liquidar_prenda_danada', 'resolver_prenda_danada',
    'apartar_stock', 'abrir_conteo', 'cerrar_conteo', 'anular_conteo',
    -- traslados
    'iniciar_traslado', 'registrar_recepcion_traslado', 'confirmar_traslado', 'cerrar_traslado_con_diferencia',
    -- catálogo (disparadores: se disparan en la escritura directa por la API y dentro de las RPC de Catálogo)
    'fn_productos_estado_alta_trigger', 'fn_colores_estado_trigger', 'fn_patrones_estado_trigger',
    'fn_tallas_estado_trigger', 'fn_tejidos_estado_trigger', 'fn_etiquetas_estado_trigger',
    'fn_registrar_cambio_producto'
  ];

  -- NO DE TIENDA (false). La persona firma siempre a su nombre, aunque llegue `x-responsable`.
  v_no_de_tienda text[] := array[
    -- compras
    'registrar_compra', 'registrar_pagos_compra', 'registrar_pago_compras', 'registrar_pago_compras_medios',
    'registrar_nota_credito_compra', 'registrar_reembolso_proveedor', 'registrar_adjunto_compra',
    'archivar_adjunto_compra', 'reasignar_reparto_compra', 'cerrar_linea_compra',
    'recibir_compras', 'recibir_lote', 'recibir_envio',
    -- producción, taller e insumos
    'abrir_produccion', 'cerrar_produccion', 'anular_produccion', 'revertir_produccion',
    'registrar_comprobante_produccion', 'recibir_comprobante_produccion', 'registrar_pago_comprobante_produccion',
    'registrar_gasto', -- solo en producción (gastos: no es operación de tienda)
    'recibir_insumo', 'registrar_consumo_insumo', 'devolver_insumo_de_produccion', 'ajustar_insumo_por_conteo',
    'fn_recalcular_costo_variante',
    -- colaboradores y accesos
    'agregar_colaborador', 'agregar_comprador_de_tienda', 'quitar_colaborador', 'suspender_colaborador'
  ];

  -- A MANO (de tienda): firman con el actor aquí, y su línea de PERMISO se corrige en la sección 3.
  v_a_mano text[] := array['registrar_venta', 'liberar_apartado'];

  -- DE PERMISO / IDENTIDAD: conservan el patrón a propósito (ver cabecera).
  v_permiso text[] := array['actualizar_mi_foto_perfil'];

  v_sin_clasificar text[];
  v_nombre text;
  v_bool text;
  r record;
  v_def text;
  v_n integer;
  v_ok boolean;
  v_hechas integer := 0;
  v_ya integer := 0;
begin
  if to_regprocedure('retail.fn_actor_persona_id(boolean)') is null then
    raise exception 'Falta la F2 del ADR-0162 (retail.fn_actor_persona_id): pega antes 20260923010000_terminales_sin_persona.sql';
  end if;

  -- (a) Ninguna lista se pisa con otra.
  select array_agg(x) into v_sin_clasificar from (
    select x from unnest(v_de_tienda || v_no_de_tienda || v_a_mano || v_permiso) x group by x having count(*) > 1) d;
  if v_sin_clasificar is not null then
    raise exception 'Estas funciones están en dos listas a la vez: %', v_sin_clasificar;
  end if;

  -- (b) Falla cerrada: toda función de retail con el patrón tiene que estar clasificada.
  select array_agg(distinct p.proname order by p.proname) into v_sin_clasificar
    from pg_proc p
   where p.pronamespace = 'retail'::regnamespace and p.prokind = 'f'
     and pg_get_functiondef(p.oid) ~* c_patron
     and p.proname <> all (v_de_tienda || v_no_de_tienda || v_a_mano || v_permiso);
  if v_sin_clasificar is not null then
    raise exception 'Funciones de retail que buscan a la persona con auth.uid() y no están clasificadas: %. Agrégalas a una lista de esta migración (de tienda, no de tienda, a mano o de permiso) — ADR-0162.', v_sin_clasificar;
  end if;

  -- (c) El reemplazo, función por función.
  foreach v_nombre in array v_de_tienda || v_no_de_tienda || v_a_mano loop
    v_bool := case when v_nombre = any (v_no_de_tienda) then 'false' else 'true' end;
    v_ok := false;
    -- Su migración no se pegó en esta base (p. ej. apartar stock o comprador de tienda en producción): se omite con aviso.
    -- OJO: cuando se pegue, esa migración crea la función con la búsqueda vieja → volver a pegar ESTA (re-ejecutable).
    if not exists (select 1 from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.prokind = 'f' and p.proname = v_nombre) then
      raise notice 'ADR-0162 F3: % no existe en esta base; se omite. Al pegar su migración, volver a pegar esta.', v_nombre;
      continue;
    end if;
    for r in select p.oid from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.prokind = 'f' and p.proname = v_nombre loop
      v_def := pg_get_functiondef(r.oid);
      select count(*) into v_n from regexp_matches(v_def, c_patron, 'gi');
      if v_n = 1 then
        execute regexp_replace(v_def, c_patron, '\1 := retail.fn_actor_persona_id(' || v_bool || ');', 'i');
        v_hechas := v_hechas + 1;
        v_ok := true;
      elsif v_n > 1 then
        raise exception '% (%) busca a la persona % veces; se esperaba 1. Cambió desde que se escribió esta migración: revísala a mano.',
          v_nombre, r.oid::regprocedure, v_n;
      elsif v_def ~ ('\w+\s*:=\s*retail\.fn_actor_persona_id\(' || v_bool || '\)') then
        v_ya := v_ya + 1; -- ya aplicada: re-ejecución
        v_ok := true;
      elsif v_def ~ '\w+\s*:=\s*retail\.fn_actor_persona_id\((true|false)\)' then
        raise exception '% ya firma con fn_actor_persona_id, pero con el otro booleano (se esperaba %): su clasificación cambió. Decide cuál vale y corrige la lista.',
          r.oid::regprocedure, v_bool;
      end if;
      -- Una sobrecarga sin patrón ni reemplazo no firma con la persona: no se toca. Pero al menos una debe calzar (abajo).
    end loop;
    if not v_ok then
      raise exception '% no existe o ya no busca a la persona con auth.uid() ni firma con fn_actor_persona_id: cambió desde que se escribió esta migración. Revísala a mano (si su migración no se pegó en esta base, quítala de la lista).', v_nombre;
    end if;
  end loop;

  raise notice 'ADR-0162 F3: % funciones reemplazadas ahora, % ya estaban (de tienda: %, no de tienda: %, a mano: %).',
    v_hechas, v_ya, cardinality(v_de_tienda), cardinality(v_no_de_tienda), cardinality(v_a_mano);
end
$migracion$;

-- ==================== 3. Las dos A MANO: el permiso vuelve a la CUENTA ====================
-- (a) registrar_venta — tope de descuento de VENTA (D-67). Antes: el tope de v_persona (= la cuenta). Ahora
--     v_persona puede ser el responsable elegido sin PIN; el tope se sigue leyendo de la CUENTA. Una terminal
--     NO tiene tope: descuenta sin pedir autorización (decisión de Felipe, 2026-09-22).
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text)',
  'select tope_descuento_pct into v_tope_descuento from colaboradores where persona_id = v_persona;',
  $n$-- ADR-0162: el tope es un PERMISO de la CUENTA, no de quien firma (v_persona puede ser el responsable
    -- elegido en el combo, sin PIN). Una terminal descuenta SIN tope ni autorización (Felipe, 2026-09-22):
    -- NULL = «sin tope», igual que un líder.
    select tope_descuento_pct into v_tope_descuento from colaboradores
      where persona_id = (select id from personas where auth_user_id = auth.uid());
    if exists (select 1 from retail.fn_terminal_actual()) then
      v_tope_descuento := null;
    end if;$n$,
  1);

-- (b) liberar_apartado — «solo quien apartó o una líder», y ahora también una TERMINAL, siempre (Felipe, 2026-09-22).
--     Se compara con la persona de la CUENTA (no con el responsable elegido sin PIN) y con coalesce.
select pg_temp.reemplazar(
  'retail.liberar_apartado(uuid, text)',
  'if not (fn_es_lider() or a.creado_por = v_persona) then',
  $n$-- ADR-0162: el permiso es de la CUENTA (v_persona puede ser el responsable elegido sin PIN). Una TERMINAL
  -- libera siempre (Felipe, 2026-09-22): entregar la prenda o soltar un apartado vencido es operación del mostrador.
  -- coalesce: sin él, en una terminal la comparación daría NULL.
  if not (fn_es_lider() or exists (select 1 from retail.fn_terminal_actual())
          or coalesce(a.creado_por = (select id from personas where auth_user_id = auth.uid()), false)) then$n$,
  1);

-- (c) listar_apartados — la columna `puede_liberar` que lee la pantalla tiene que decir lo mismo que el candado de
--     `liberar_apartado` (arriba, b): una TERMINAL libera siempre (Felipe, 2026-09-22). Sin esto la base acepta la
--     liberación pero la pantalla esconde el botón. Si la función no existe en esta base (producción, hasta que se pegue
--     apartar stock), se omite con aviso.
select pg_temp.reemplazar(
  'retail.listar_apartados(uuid)',
  '(fn_es_lider() or a.creado_por is not distinct from (select pe.id from personas pe where pe.auth_user_id = auth.uid()))',
  '(fn_es_lider() or exists (select 1 from retail.fn_terminal_actual()) or a.creado_por is not distinct from (select pe.id from personas pe where pe.auth_user_id = auth.uid()))',
  1);
