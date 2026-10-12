-- ============================================================================
-- 20261010150000_corregir_prenda_sin_registrar.sql — CAYLA V2 (ADR-0369, Felipe 2026-10-09)
--
-- EL PROBLEMA PRIMERO. En hora punta la caja anota a ojo la prenda que vende sin registrar (ADR-0179): «Camisas y Blusas, M,
-- beige». Es muy relativo: lo que una colaboradora llama beige otra lo llama crema, una blusa larga pasa por vestido, y la talla
-- se adivina de la percha. Hasta hoy lo anotado quedaba fijo para siempre, y de eso dependen tres cosas: (1) las prendas que la
-- mesa de Ventas sin registrar ofrece primero (`calceDe`, `fn_candidatas_de_venta`: categoría + talla + color), (2) la velocidad
-- que el motor del piso y el motor de demanda le cuentan a esa categoría/talla/color, y (3) el cierre de arranque, que cuenta las
-- `cerrada_sin_prenda` con lo anotado. Un dato mal anotado ensuciaba las tres sin salida.
--
-- CONTRATO (Liskov)
--   PROMETE: `corregir_prenda_sin_registrar(p_id, p_descripcion, p_categoria_id, p_talla_id, p_color_codigo) → jsonb` con lo que
--            quedó. Cambia SOLO lo anotado por caja (descripción, categoría, talla, color) de una fila `pendiente` o
--            `cerrada_sin_prenda`. Lo de antes no se pierde: la foto de antes y después queda en
--            `prendas_por_regularizar_correcciones` (solo se agrega) y en Actividad (módulo Existencias).
--   ASUME:   la cuenta ve «existencias» (la pantalla vive ahí, ADR-0330) y opera la tienda de la venta
--            (`fn_puede_operar_ubicacion`, como `regularizar_prenda`); firma el responsable del combo (`fn_actor_persona_id(true)`,
--            ADR-0162). Categoría, talla y color activos (la talla, además, aprobada): las mismas listas que ofrece la caja.
--   FALLA:   `prenda_no_existe`, `prenda_no_corregible` (regularizada: ya manda la prenda real; anulada: ya no cuenta),
--            `prenda_datos_invalidos` (descripción vacía o de más de 80, o una categoría/talla/color que no existe o no está activo),
--            `prenda_sin_cambios` (lo pedido es lo que ya estaba: un doble clic cae aquí y la web lo toma como hecho).
--   NO HACE: no toca el precio cobrado (es dinero: lo dice la venta), ni el stock (la prenda sin registrar no lo movió), ni la
--            venta, ni el comprobante ni lo enviado a SUNAT: el comprobante guardó su propio texto al emitirse
--            (`lib/transmision-reglas.ts`, `descripcion_libre` del pedido), y esta tabla no lo alimenta.
--
-- ESTADOS IMPOSIBLES (Lamport). La fila se lee `for update`: una corrección y un `regularizar_prenda` (o un cierre de arranque) se
-- turnan. Si almacén la regularizó primero, la corrección llega a una fila `regularizada` y falla con `prenda_no_corregible` —
-- nunca se reescribe lo anotado de una prenda que ya tiene su prenda real.
--
-- DECIDÍ: `update` de la fila + foto en una tabla que solo agrega. Lo anotado lo leen en vivo la mesa, las candidatas, el motor del
--   piso y el de demanda: tienen que ver el dato corregido sin saber que hubo corrección. El dato viejo vive en `antes`.
-- DESCARTÉ: dejar corregir una `regularizada`. Ahí lo anotado ya es solo historia de lo que dijo caja; la verdad es la prenda real
--   (`variante_id`). Si la prenda real es la equivocada, eso no se arregla aquí.
-- DESCARTÉ: dejar corregir el precio. Es lo que entró a caja y lo que dice el comprobante: lo cambia una nota de crédito, no esto.
--
-- PRODUCCIÓN. Una sola parte, idempotente: una tabla NUEVA (RLS encendido y SIN políticas: solo la escribe una función
-- `security definer`; la lee la web por `fn_correcciones_prenda_sin_registrar`), su candado `create or replace trigger` (nunca
-- `drop trigger`) y dos funciones. No hace `alter` de tablas en uso ni crea políticas: ADR-0195 no aplica. Pegar ANTES de publicar
-- la web: sin la función, el botón «Corregir lo anotado» responde «todavía no está disponible» y nada más.
--
-- VERIFICACIÓN (solo lectura):
--   select to_regprocedure('retail.corregir_prenda_sin_registrar(uuid,text,uuid,uuid,text)') is not null,
--          to_regclass('retail.prendas_por_regularizar_correcciones') is not null;          → t | t
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La foto de cada corrección (solo se agrega) ----------
create table if not exists retail.prendas_por_regularizar_correcciones (
  id uuid primary key default gen_random_uuid(),
  prenda_id uuid not null references retail.prendas_por_regularizar (id),
  -- Quién corrigió: el responsable que firmó (ADR-0162).
  persona_id uuid references public.personas (id),
  terminal_id uuid references retail.terminales (id),
  -- {descripcion, categoria_id, talla_id, color_codigo} antes y después.
  antes jsonb not null,
  despues jsonb not null,
  creado_en timestamptz not null default now()
);

create index if not exists prendas_por_regularizar_correcciones_prenda_idx
  on retail.prendas_por_regularizar_correcciones (prenda_id, creado_en);

-- Sin políticas: la escribe `corregir_prenda_sin_registrar` y la lee `fn_correcciones_prenda_sin_registrar`, las dos `security definer`.
alter table retail.prendas_por_regularizar_correcciones enable row level security;
revoke all on retail.prendas_por_regularizar_correcciones from public, anon, authenticated;

create or replace function retail.fn_prendas_por_regularizar_correcciones_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  raise exception 'prendas_por_regularizar_correcciones solo se agrega: no se edita ni se borra';
end;
$$;

create or replace trigger trg_prendas_por_regularizar_correcciones_inmutable
  before update or delete on retail.prendas_por_regularizar_correcciones
  for each row execute function retail.fn_prendas_por_regularizar_correcciones_inmutable();

-- ---------- 2. Corregir lo anotado ----------
create or replace function retail.corregir_prenda_sin_registrar(
  p_id uuid, p_descripcion text, p_categoria_id uuid, p_talla_id uuid, p_color_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_p prendas_por_regularizar%rowtype;
  v_persona uuid;
  v_desc text := btrim(coalesce(p_descripcion, ''));
  v_antes jsonb;
  v_despues jsonb;
  v_cat text;
  v_talla text;
  v_color text;
begin
  -- Primero el permiso, después la firma (como `corregir_pagos_venta`).
  perform fn_exigir_modulo('existencias');
  v_persona := fn_actor_persona_id(true);

  select * into v_p from prendas_por_regularizar where id = p_id for update;
  if not found then
    raise exception 'prenda_no_existe' using hint = 'Esa venta sin registrar ya no existe: recarga la página';
  end if;
  if not fn_puede_operar_ubicacion(v_p.ubicacion_id) then
    raise exception 'No tienes permiso para corregir ventas de esa tienda' using errcode = '42501';
  end if;
  if v_p.estado not in ('pendiente', 'cerrada_sin_prenda') then
    raise exception 'prenda_no_corregible'
      using hint = 'Esa venta ya se regularizó con su prenda real o se anuló: lo anotado por caja ya no se corrige';
  end if;

  -- Las mismas listas que ofrece la caja: activas, y la talla además aprobada.
  if v_desc = '' or length(v_desc) > 80
     or not exists (select 1 from categorias where id = p_categoria_id and activo)
     or not exists (select 1 from tallas where id = p_talla_id and activo and estado = 'aprobado')
     or not exists (select 1 from colores where codigo = p_color_codigo and activo) then
    raise exception 'prenda_datos_invalidos' using hint = 'Elige categoría, talla y color de la lista y escribe una descripción corta';
  end if;

  v_antes := jsonb_build_object('descripcion', v_p.descripcion, 'categoria_id', v_p.categoria_id, 'talla_id', v_p.talla_id,
                                'color_codigo', v_p.color_codigo);
  v_despues := jsonb_build_object('descripcion', v_desc, 'categoria_id', p_categoria_id, 'talla_id', p_talla_id,
                                  'color_codigo', p_color_codigo);
  if v_antes = v_despues then
    raise exception 'prenda_sin_cambios' using hint = 'Lo que elegiste es lo que ya estaba anotado';
  end if;

  update prendas_por_regularizar
    set descripcion = v_desc, categoria_id = p_categoria_id, talla_id = p_talla_id, color_codigo = p_color_codigo
    where id = p_id;

  insert into prendas_por_regularizar_correcciones (prenda_id, persona_id, terminal_id, antes, despues)
    values (p_id, v_persona, fn_actividad_terminal_ahora(), v_antes, v_despues);

  -- Actividad: qué cambió, en palabras. Un error del historial nunca detiene la corrección.
  begin
    select nombre into v_cat from categorias where id = p_categoria_id;
    select valor into v_talla from tallas where id = p_talla_id;
    select nombre into v_color from colores where codigo = p_color_codigo;
    perform fn_actividad_anotar(
      'existencias', 'prenda_sin_registrar_corregida',
      'corrigió lo anotado de la venta sin registrar «' || btrim(v_p.descripcion) || '» (' || fn_actividad_soles(v_p.precio_cobrado)
        || '): ahora es «' || v_desc || '» · ' || coalesce(v_cat, '—') || ' · talla ' || coalesce(v_talla, '—') || ' · ' || coalesce(v_color, '—'),
      v_persona, fn_actividad_terminal_ahora(), v_p.ubicacion_id, null,
      'prendas_por_regularizar', v_p.id::text, now(),
      jsonb_build_object('antes', v_antes, 'despues', v_despues, 'estado', v_p.estado),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la corrección de % (%)', p_id, sqlerrm;
  end;

  return v_despues;
end;
$$;

comment on function retail.corregir_prenda_sin_registrar(uuid, text, uuid, uuid, text) is
  'ADR-0369: corrige lo que caja anotó de una prenda vendida sin registrar (descripción, categoría, talla, color) mientras está pendiente o cerrada sin prenda. No toca precio, stock, venta ni comprobante. Foto en prendas_por_regularizar_correcciones.';
revoke all on function retail.corregir_prenda_sin_registrar(uuid, text, uuid, uuid, text) from public, anon;
grant execute on function retail.corregir_prenda_sin_registrar(uuid, text, uuid, uuid, text) to authenticated;

-- ---------- 3. Leer las correcciones de las ventas que la persona ve ----------
-- Para la línea «Corregido por … el …» de la mesa. Devuelve solo la última de cada venta, y solo de las tiendas que la persona opera.
create or replace function retail.fn_correcciones_prenda_sin_registrar(p_ids uuid[])
returns table (prenda_id uuid, veces integer, ultima_en timestamptz, ultima_por uuid, antes jsonb)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select c.prenda_id, count(*) over (partition by c.prenda_id)::integer, c.creado_en, c.persona_id,
         first_value(c.antes) over (partition by c.prenda_id order by c.creado_en, c.id)
    from prendas_por_regularizar_correcciones c
    join prendas_por_regularizar p on p.id = c.prenda_id
   where c.prenda_id = any (p_ids)
     and fn_puede_operar_ubicacion(p.ubicacion_id)
   order by c.prenda_id, c.creado_en desc, c.id desc
$$;

comment on function retail.fn_correcciones_prenda_sin_registrar(uuid[]) is
  'ADR-0369: cuántas veces se corrigió lo anotado de cada venta sin registrar, la última corrección (cuándo y quién) y lo que anotó caja al vender (la primera foto «antes»). Una fila por corrección, ordenadas de la más nueva a la más vieja: la web se queda con la primera de cada venta.';
revoke all on function retail.fn_correcciones_prenda_sin_registrar(uuid[]) from public, anon;
grant execute on function retail.fn_correcciones_prenda_sin_registrar(uuid[]) to authenticated;

select retail.fn_rls_una_vez_por_consulta();

-- ---------- 4. Validación final: si algo no quedó, se deshace todo ----------
do $v$
begin
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'corregir_prenda_sin_registrar') <> 1 then
    raise exception 'corregir prenda sin registrar: debe haber una sola corregir_prenda_sin_registrar';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_prendas_por_regularizar_correcciones_inmutable' and not tgisinternal) then
    raise exception 'corregir prenda sin registrar: falta el candado de solo agregar';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'retail.prendas_por_regularizar_correcciones'::regclass) then
    raise exception 'corregir prenda sin registrar: la tabla quedó sin RLS';
  end if;
end
$v$;
