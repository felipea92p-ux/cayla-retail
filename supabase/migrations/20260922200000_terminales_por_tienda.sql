-- ============================================================================
-- 20260922200000_terminales_por_tienda.sql — CAYLA V2
--
-- Renumerada al fusionar con main (2026-09-22): tanto el ADR (0152→0159) como esta migración
-- (20260922140000→20260922200000) chocaban con trabajo de otra sesión del mismo día
-- («Ficha de clienta v1»). Mismo contenido, solo los nombres cambiaron.
--
-- ADR-0159. Cuentas TERMINAL por tienda: dos por tienda, compartidas por quien trabaja
-- ahí — una de VENTAS y una ADMINISTRATIVA.
--
-- EL PROBLEMA PRIMERO. Hasta hoy retail solo distingue `lider` y `colaborador`. Una cuenta compartida
-- por toda una tienda no puede ser líder (cambia de tienda, ve las tres, da y quita accesos) ni un
-- colaborador común (no cierra caja, no ajusta stock, no edita el catálogo). Necesita el punto medio:
-- los poderes de UN oficio, en UNA tienda. Un colaborador sigue siendo el rol; lo que cambia es una
-- columna, `terminal`, y un candado por capacidad.
--
-- QUÉ HACE
--   1. `colaboradores.terminal` (y en `colaboradores_suspendidos`, para que suspender y reactivar no
--      pierda el tipo): null = una persona; 'ventas' | 'administrativa' = una terminal. Solo un
--      colaborador (nunca un líder) puede ser terminal, y hay UNA de cada tipo por tienda.
--   2. `fn_es_terminal(tipo)` y `fn_mi_terminal()`: mismo patrón que `fn_es_lider()`.
--   3. Cinco capacidades, cada una «líder O terminal de tal tipo» (la quinta, solo del líder):
--        fn_puede_gestionar_caja()           → cerrar caja y mover caja                 (terminal de ventas)
--        fn_puede_ajustar_inventario()       → ajustar stock, cerrar conteo, cerrar un
--                                              traslado con diferencia                  (terminal administrativa)
--        fn_puede_editar_catalogo()          → escribir en el Catálogo                  (terminal administrativa)
--        fn_puede_editar_cuentas_proveedor() → cuentas bancarias de proveedores         (terminal administrativa)
--        fn_puede_dar_descuento_por_etiqueta() → asignar una etiqueta con descuento al crear una prenda (SOLO el líder)
--   4. `agregar_terminal(persona, tienda, tipo)`: el alta, solo del líder, siempre como colaborador y
--      solo en una TIENDA (no en el Taller).
--   5. Los candados de hoy (`fn_es_lider()`) de 13 funciones, 5 disparadores y 15 políticas de fila pasan
--      a la capacidad que les toca. Se INYECTAN leyendo la definición real de cada una
--      (`pg_get_functiondef`) — mismo patrón que `fn_aplicar_candado_de_dinero()` (ADR-0126) — porque en
--      producción esas funciones se pegan a mano y copiar un cuerpo del repo pisaría una versión más nueva.
--      Cada reemplazo EXIGE la cantidad exacta de ocurrencias que se midió en producción el 2026-09-21: si
--      la función cambió, aborta con un mensaje claro y no toca nada.
--
-- QUÉ NO HACE (a propósito; sigue siendo solo del líder)
--   · Etiquetas y todo lo que las asigna: pueden llevar descuento y eso es poder de precios.
--   · Anular una venta o un comprobante, aprobar o rechazar devoluciones, series de comprobantes, códigos
--     de descuento, resolver o liquidar prendas dañadas, crear proveedores.
--   · Compras (registrar y pagar): es de ADR-0151, «comprador de tienda». NO se abre `fn_puede_registrar_
--     compras()`: las funciones de pago reciben un `compra_id` sin filtrar por tienda y la terminal de una
--     tienda podría pagar la factura de otra.
--   · Identificar quién atiende (el combo de ventas): es otra sesión.
--
-- CADA TERMINAL ES UNA PERSONA DE DYNAMIC. 57 llaves foráneas de retail apuntan a `personas`
-- (`ventas.usuario_id`, `movimientos.usuario_id`, `compra_pagos.usuario_id`…): una cuenta sin persona no
-- puede ni cobrar. La persona (con su correo) la crea quien administra Dynamic; aquí solo se le da entrada.
--
-- SE ROMPE SI
--   · Otra migración recrea `cerrar_caja`, `registrar_movimiento` (etc.) desde un archivo viejo del repo:
--     vuelve a `fn_es_lider()` y la terminal deja de poder. Falla CERRADO (pierde poder, no lo gana) y
--     `pnpm pruebas:terminales` lo detecta.
--   · Se agrega una política o función de Catálogo nueva con `fn_es_lider()`: la terminal administrativa no
--     puede usarla. Igual: cerrado.
--   · Se da de alta una terminal como líder: el CHECK y `agregar_terminal` lo impiden.
--
-- Re-ejecutable. Producción: se pega entera en el SQL Editor de cayla-dynamic (ya trae `retail.`).
-- ============================================================================

-- ==================== 1. La columna y sus candados ====================
alter table retail.colaboradores add column if not exists terminal text;
alter table retail.colaboradores_suspendidos add column if not exists terminal text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'colaboradores_terminal_valida') then
    alter table retail.colaboradores add constraint colaboradores_terminal_valida
      check (terminal is null or (terminal in ('ventas', 'administrativa') and rol = 'colaborador'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'colaboradores_suspendidos_terminal_valida') then
    alter table retail.colaboradores_suspendidos add constraint colaboradores_suspendidos_terminal_valida
      check (terminal is null or (terminal in ('ventas', 'administrativa') and rol = 'colaborador'));
  end if;
end $$;

-- Una terminal de cada tipo por tienda. Parcial: las personas (terminal null) no cuentan.
create unique index if not exists colaboradores_una_terminal_por_tipo_y_tienda
  on retail.colaboradores (ubicacion_asignada_id, terminal) where terminal is not null;

-- ==================== 2. Quién es terminal ====================
-- Mismo patrón que `fn_es_lider()`: SECURITY DEFINER porque `colaboradores_select` es solo del líder y
-- una terminal no puede leer su propia fila. `exists` nunca devuelve null: sin sesión o sin fila, false.
create or replace function retail.fn_es_terminal(p_tipo text default null)
returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select exists (
    select 1 from public.personas p
    join retail.colaboradores c on c.persona_id = p.id
    where p.auth_user_id = auth.uid() and p.estado = 'activo'
      and c.terminal is not null and (p_tipo is null or c.terminal = p_tipo)
  );
$$;

-- El tipo de terminal de quien mira (null si es una persona). La web lo lee UNA vez por petición.
create or replace function retail.fn_mi_terminal()
returns text
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select c.terminal from public.personas p
  join retail.colaboradores c on c.persona_id = p.id
  where p.auth_user_id = auth.uid() and p.estado = 'activo'
  limit 1;
$$;

-- ==================== 3. Las capacidades ====================
-- Cada una es «líder O terminal de tal tipo». Nunca devuelven null (los dos lados son boolean no nulos):
-- lección de docs/datos/14-DYNAMIC.md §6, un `not null` no dispara el `raise exception` y el permiso pasa.
create or replace function retail.fn_puede_gestionar_caja() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select fn_es_lider() or fn_es_terminal('ventas'); $$;

create or replace function retail.fn_puede_ajustar_inventario() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select fn_es_lider() or fn_es_terminal('administrativa'); $$;

create or replace function retail.fn_puede_editar_catalogo() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select fn_es_lider() or fn_es_terminal('administrativa'); $$;

create or replace function retail.fn_puede_editar_cuentas_proveedor() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select fn_es_lider() or fn_es_terminal('administrativa'); $$;

-- Sigue siendo SOLO del líder a propósito: una etiqueta con `descuento_pct` baja el precio de las prendas que
-- la llevan. `crear_producto_con_variantes` deja elegir cualquier etiqueta aprobada, así que sin este candado
-- la terminal administrativa podría colgarle un descuento a una prenda que ella misma crea (ver sección 8.d).
create or replace function retail.fn_puede_dar_descuento_por_etiqueta() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select fn_es_lider(); $$;

comment on function retail.fn_puede_dar_descuento_por_etiqueta() is
  'Solo el líder: asignar una etiqueta con descuento a una prenda al crearla (ADR-0159). Punto único para abrirlo el día que se decida.';
comment on function retail.fn_puede_gestionar_caja() is
  'Líder o terminal de ventas: cerrar caja y mover caja (ADR-0159; refina ADR-0143).';
comment on function retail.fn_puede_ajustar_inventario() is
  'Líder o terminal administrativa: ajustar stock, cerrar conteo y cerrar un traslado con diferencia (ADR-0159; refina ADR-0143).';
comment on function retail.fn_puede_editar_catalogo() is
  'Líder o terminal administrativa: escribir en el Catálogo (ADR-0159). Las etiquetas NO entran: llevan descuentos.';
comment on function retail.fn_puede_editar_cuentas_proveedor() is
  'Líder o terminal administrativa: cuentas bancarias de proveedores (ADR-0159).';

-- ==================== 4. El alta de una terminal ====================
-- Copia de `agregar_colaborador` (definición de producción del 2026-09-21) con tres diferencias: pide el
-- tipo, exige una TIENDA activa (no el Taller) y avisa si esa tienda ya tiene su terminal de ese tipo.
-- Función NUEVA y no un parámetro más en `agregar_colaborador`: `create or replace` con otra firma dejaría
-- dos versiones vivas a la vez (la lección de `recibir_lote` / `registrar_movimiento`).
create or replace function retail.agregar_terminal(p_persona_id uuid, p_ubicacion_id uuid, p_terminal text)
returns void
language plpgsql security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_quien uuid;
  v_filas integer;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede gestionar colaboradores';
  end if;
  if p_terminal is null or p_terminal not in ('ventas', 'administrativa') then
    raise exception 'El tipo de terminal debe ser ventas o administrativa';
  end if;
  if not exists (select 1 from public.personas where id = p_persona_id and estado = 'activo') then
    raise exception 'Esa persona no existe o no está activa en Dynamic';
  end if;
  if not exists (select 1 from ubicaciones where id = p_ubicacion_id and activo and tipo = 'tienda') then
    raise exception 'Una terminal se asigna a una tienda activa (no al Taller)';
  end if;
  if exists (select 1 from colaboradores_suspendidos where persona_id = p_persona_id) then
    raise exception 'Esa persona está suspendida — reactívala en vez de agregarla de nuevo';
  end if;
  if exists (select 1 from colaboradores where ubicacion_asignada_id = p_ubicacion_id and terminal = p_terminal) then
    raise exception 'Esa tienda ya tiene su terminal de %', p_terminal;
  end if;
  select id into v_quien from public.personas where auth_user_id = auth.uid();
  insert into colaboradores (persona_id, agregado_por, rol, ubicacion_asignada_id, terminal)
    values (p_persona_id, v_quien, 'colaborador', p_ubicacion_id, p_terminal)
    on conflict (persona_id) do nothing;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'Esa persona ya tiene acceso a retail — actualiza la pantalla para verla en la lista';
  end if;
  perform retail.fn_historial_colaborador(p_persona_id, 'alta', 'colaborador', null, p_ubicacion_id, 'Terminal ' || p_terminal);
end;
$fn$;

-- ==================== 5. Grants ====================
revoke all on function retail.fn_es_terminal(text) from public, anon;
grant execute on function retail.fn_es_terminal(text) to authenticated;
revoke all on function retail.fn_mi_terminal() from public, anon;
grant execute on function retail.fn_mi_terminal() to authenticated;
revoke all on function retail.fn_puede_gestionar_caja() from public, anon;
grant execute on function retail.fn_puede_gestionar_caja() to authenticated;
revoke all on function retail.fn_puede_ajustar_inventario() from public, anon;
grant execute on function retail.fn_puede_ajustar_inventario() to authenticated;
revoke all on function retail.fn_puede_editar_catalogo() from public, anon;
grant execute on function retail.fn_puede_editar_catalogo() to authenticated;
revoke all on function retail.fn_puede_editar_cuentas_proveedor() from public, anon;
grant execute on function retail.fn_puede_editar_cuentas_proveedor() to authenticated;
revoke all on function retail.fn_puede_dar_descuento_por_etiqueta() from public, anon;
grant execute on function retail.fn_puede_dar_descuento_por_etiqueta() to authenticated;
revoke all on function retail.agregar_terminal(uuid, uuid, text) from public, anon;
grant execute on function retail.agregar_terminal(uuid, uuid, text) to authenticated;

-- ==================== 6. Herramientas temporales de la inyección ====================
-- Viven en `pg_temp`: desaparecen al cerrar la sesión y no dejan objetos en el esquema.

-- Reemplaza `p_viejo` por `p_nuevo` en la definición REAL de una función, exigiendo `p_veces` ocurrencias.
-- Re-ejecutable: si ya no queda `p_viejo` y sí `p_nuevo`, no hace nada. Si no calza, aborta.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
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

-- Inserta un bloque ANTES de una línea ancla única de la definición real. La marca dice si ya se insertó
-- (re-ejecutable). Aborta si el ancla no aparece exactamente una vez.
create or replace function pg_temp.insertar_antes(p_firma text, p_ancla text, p_bloque text, p_marca text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el bloque desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_ancla, p_bloque || p_ancla);
end;
$f$;

-- Cambia el candado de una política de fila: `retail.fn_es_lider()` → la capacidad. Mismo criterio.
create or replace function pg_temp.conceder_politica(p_tabla text, p_politica text, p_capacidad text)
returns void
language plpgsql
as $f$
declare
  v_qual text;
  v_check text;
  v_sql text;
  -- Con o sin esquema: `pg_policies` lo muestra SIN `retail.` cuando el `search_path` de quien pega lo incluye
  -- (el SQL Editor con `set search_path to retail, public;`). Buscar solo la forma con prefijo abortaba.
  v_viejo constant text := '(retail\.)?fn_es_lider\(\)';
  v_nuevo text := 'retail.' || p_capacidad || '()';
begin
  select qual, with_check into v_qual, v_check
    from pg_policies where schemaname = 'retail' and tablename = p_tabla and policyname = p_politica;
  if not found then
    raise exception 'No existe la política % de retail.%', p_politica, p_tabla;
  end if;
  if coalesce(v_qual, '') || ' ' || coalesce(v_check, '') !~ v_viejo then
    if position(p_capacidad in coalesce(v_qual, '') || coalesce(v_check, '')) > 0 then
      return; -- ya aplicada
    end if;
    raise exception 'La política % de retail.% no pide fn_es_lider(): cambió desde que se escribió esta migración.', p_politica, p_tabla;
  end if;
  v_sql := format('alter policy %I on retail.%I', p_politica, p_tabla);
  if v_qual is not null then
    v_sql := v_sql || format(' using (%s)', regexp_replace(v_qual, v_viejo, v_nuevo, 'g'));
  end if;
  if v_check is not null then
    v_sql := v_sql || format(' with check (%s)', regexp_replace(v_check, v_viejo, v_nuevo, 'g'));
  end if;
  execute v_sql;
end;
$f$;

-- ==================== 7. Suspender y reactivar conservan el tipo de terminal ====================
-- Sin esto, suspender y reactivar a una terminal la devolvería como colaborador común: perdería sus poderes
-- (falla cerrado) y su lugar de «terminal de la tienda».
select pg_temp.reemplazar('retail.suspender_colaborador(uuid, text)',
  'suspendido_por, motivo)', 'suspendido_por, motivo, terminal)', 1);
select pg_temp.reemplazar('retail.suspender_colaborador(uuid, text)',
  'v_quien, v_motivo);', 'v_quien, v_motivo, v_fila.terminal);', 1);
select pg_temp.reemplazar('retail.reactivar_colaborador(uuid)',
  'rol, ubicacion_asignada_id)', 'rol, ubicacion_asignada_id, terminal)', 1);
select pg_temp.reemplazar('retail.reactivar_colaborador(uuid)',
  'v_fila.rol, v_fila.ubicacion_asignada_id);', 'v_fila.rol, v_fila.ubicacion_asignada_id, v_fila.terminal);', 1);

-- ==================== 8. Conceder cada capacidad ====================
-- (a) Caja: terminal de ventas. Mismos rechazos y mismo mensaje que en ADR-0143; solo cambia quién pasa.
select pg_temp.reemplazar('retail.cerrar_caja(uuid, numeric)', 'fn_es_lider()', 'fn_puede_gestionar_caja()', 1);
select pg_temp.reemplazar('retail.registrar_movimiento_caja(uuid, text, numeric, text, text, boolean)', 'fn_es_lider()', 'fn_puede_gestionar_caja()', 1);

-- (b) Inventario: terminal administrativa.
select pg_temp.reemplazar('retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid)', 'fn_es_lider()', 'fn_puede_ajustar_inventario()', 1);
select pg_temp.reemplazar('retail.cerrar_conteo(uuid)', 'fn_es_lider()', 'fn_puede_ajustar_inventario()', 1);
select pg_temp.reemplazar('retail.cerrar_traslado_con_diferencia(uuid, text)', 'fn_es_lider()', 'fn_puede_ajustar_inventario()', 1);

-- (c) Cuentas bancarias de proveedores: terminal administrativa. Ver `guardar_cuentas_proveedor`: la pantalla
--     vive en Compras → Proveedores, que llega con ADR-0151; el candado queda listo desde ahora.
select pg_temp.reemplazar('retail.guardar_cuentas_proveedor(uuid, text, text, text[], text)', 'fn_es_lider()', 'fn_puede_editar_cuentas_proveedor()', 1);

-- (d) Catálogo, funciones: terminal administrativa.
select pg_temp.reemplazar('retail.actualizar_categoria(uuid, text, text, text, text)', 'fn_es_lider()', 'fn_puede_editar_catalogo()', 1);
select pg_temp.reemplazar('retail.actualizar_categoria_ejes(uuid, uuid[], uuid[], uuid[], uuid[])', 'fn_es_lider()', 'fn_puede_editar_catalogo()', 1);
select pg_temp.reemplazar('retail.desactivar_categoria(uuid)', 'fn_es_lider()', 'fn_puede_editar_catalogo()', 1);
select pg_temp.reemplazar('retail.reactivar_categoria(uuid)', 'fn_es_lider()', 'fn_puede_editar_catalogo()', 1);
select pg_temp.reemplazar('retail.crear_marca(text, uuid)', 'fn_es_lider()', 'fn_puede_editar_catalogo()', 1);
select pg_temp.reemplazar('retail.censo_crear_variante(text, uuid, text, uuid, text, numeric, numeric, uuid, uuid)', 'fn_es_lider()', 'fn_puede_editar_catalogo()', 3);
select pg_temp.reemplazar('retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid)', 'fn_es_lider()', 'fn_puede_editar_catalogo()', 1);

--     La terminal administrativa NO puede colgarle una etiqueta con descuento a la prenda que crea: el bloque se
--     inserta justo antes de que la función lea las etiquetas elegidas y usa la capacidad que sigue siendo del líder.
select pg_temp.insertar_antes('retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid)',
  $a$select coalesce(array_agg(distinct e), '{}'::uuid[]) into v_etiquetas from unnest(coalesce(p_etiqueta_ids, '{}'::uuid[])) e;$a$,
  $b$if not fn_puede_dar_descuento_por_etiqueta()
     and exists (select 1 from etiquetas x where x.id = any(coalesce(p_etiqueta_ids, '{}'::uuid[])) and x.descuento_pct is not null) then
    raise exception 'Solo un líder puede asignar una etiqueta con descuento.';
  end if;
  $b$,
  'Solo un líder puede asignar una etiqueta con descuento.');

-- (e) Catálogo, disparadores: lo que crea o aprueba la terminal administrativa queda APROBADO, igual que si
--     lo hiciera un líder (si no, una prenda o un atributo nuevo quedaría «pendiente» esperando a un líder y
--     escribir en el Catálogo no serviría de nada). El de etiquetas NO se toca: las etiquetas llevan descuento.
select pg_temp.reemplazar('retail.fn_productos_estado_alta_trigger()', 'fn_es_lider()', 'fn_puede_editar_catalogo()', 3);
select pg_temp.reemplazar('retail.fn_colores_estado_trigger()', 'fn_es_lider()', 'fn_puede_editar_catalogo()', 1);
select pg_temp.reemplazar('retail.fn_patrones_estado_trigger()', 'fn_es_lider()', 'fn_puede_editar_catalogo()', 1);
select pg_temp.reemplazar('retail.fn_tallas_estado_trigger()', 'fn_es_lider()', 'fn_puede_editar_catalogo()', 1);
select pg_temp.reemplazar('retail.fn_tejidos_estado_trigger()', 'fn_es_lider()', 'fn_puede_editar_catalogo()', 1);

-- (f) Catálogo, políticas de fila (la puerta directa por la API). Sin `etiqueta_categorias`, `etiquetas`
--     ni `variante_etiquetas`.
select pg_temp.conceder_politica('categoria_patrones', 'categoria_patrones_write_lider', 'fn_puede_editar_catalogo');
select pg_temp.conceder_politica('categoria_tallas', 'categoria_tallas_write_lider', 'fn_puede_editar_catalogo');
select pg_temp.conceder_politica('categoria_tejidos', 'categoria_tejidos_write_lider', 'fn_puede_editar_catalogo');
select pg_temp.conceder_politica('categorias', 'categorias_write_lider', 'fn_puede_editar_catalogo');
select pg_temp.conceder_politica('codigos_barras', 'codigos_barras_write_lider', 'fn_puede_editar_catalogo');
select pg_temp.conceder_politica('colores', 'colores_update_lider', 'fn_puede_editar_catalogo');
select pg_temp.conceder_politica('familias', 'familias_write_lider', 'fn_puede_editar_catalogo');
select pg_temp.conceder_politica('marca_proveedores', 'marca_proveedores_write_lider', 'fn_puede_editar_catalogo');
select pg_temp.conceder_politica('marcas', 'marcas_write_lider', 'fn_puede_editar_catalogo');
select pg_temp.conceder_politica('patrones', 'patrones_update_lider', 'fn_puede_editar_catalogo');
select pg_temp.conceder_politica('producto_fotos', 'producto_fotos_write_lider', 'fn_puede_editar_catalogo');
select pg_temp.conceder_politica('productos', 'productos_write_lider', 'fn_puede_editar_catalogo');
select pg_temp.conceder_politica('tallas', 'tallas_update_lider', 'fn_puede_editar_catalogo');
select pg_temp.conceder_politica('tejidos', 'tejidos_update_lider', 'fn_puede_editar_catalogo');
select pg_temp.conceder_politica('variantes', 'variantes_write_lider', 'fn_puede_editar_catalogo');
