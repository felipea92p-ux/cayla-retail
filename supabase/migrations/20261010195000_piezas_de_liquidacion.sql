-- ============================================================================
-- 20261010195000_piezas_de_liquidacion.sql — CAYLA V2 (ADR-0375, Felipe 2026-10-10)
--
-- EL PROBLEMA PRIMERO. En el almacén hay prendas de las que queda UNA sola unidad, con tiempo guardadas, que nunca entraron
-- al sistema y que se van a liquidar. Registrarlas como productos (ficha, foto, talla, color) es trabajo perdido: no vuelven.
-- Pero venderlas por fuera deja la caja sin cuadrar y sin boleta, y venderlas como «Prenda sin registrar» (ADR-0179) le deja
-- a almacén una tarea por cada una. Felipe (2026-10-10, 10 preguntas): cada prenda su precio, que se va bajando con una
-- etiqueta nueva que dice «LIQUIDACIÓN»; cada sede liquida lo suyo; las etiquetan el líder y las terminales de almacén y
-- caja; al venderla queda el monto y la categoría; venta final (sin cambio ni devolución); cuenta como venta normal; sin
-- otros descuentos; y un precio mínimo bajo el cual solo un líder etiqueta.
--
-- LA PIEZA DE LIQUIDACIÓN. No es un producto del catálogo: es una fila con su sede, su categoría y su precio, y una
-- etiqueta con un código corto (`LQ` + 6). Cambiar el precio imprime una etiqueta NUEVA con otro código, y la vieja deja de
-- valer: una prenda nunca se cobra a un precio que ya no rige, ni se vende dos veces. La caja la vende escaneando el código
-- como una línea de la variante centinela (la de «Prenda sin registrar», ya excluida de stock, ledger, demanda y piso), pero
-- en vez de caer a la cola de almacén, marca la pieza como vendida. No mueve stock: nunca estuvo en `stock`.
--
-- CONTRATO (Liskov)
--   PROMETE: `crear_pieza_liquidacion(sede, categoría, precio) → jsonb` (la pieza y su código);
--            `cambiar_precio_pieza_liquidacion(código, precio) → jsonb` (el código NUEVO; el viejo queda sin valer);
--            `retirar_pieza_liquidacion(código, motivo) → jsonb`; `guardar_precio_minimo_liquidacion(monto)` (solo líder);
--            lecturas `fn_pieza_liquidacion(código)` y `fn_piezas_liquidacion(sede)`. `registrar_venta` acepta una línea
--            con `pieza_liquidacion_codigo` y la vende al precio de su etiqueta vigente.
--   ASUME:   quien etiqueta ve el módulo «liquidacion» y opera la sede (`fn_puede_operar_ubicacion`); firma el responsable
--            del combo (`fn_actor_persona_id(true)`, ADR-0162).
--   FALLA:   `liquidacion_bajo_minimo` (precio bajo el mínimo y la cuenta no es líder), `liquidacion_etiqueta_vieja`,
--            `liquidacion_ya_vendida`, `liquidacion_retirada`, `liquidacion_otra_sede`, `liquidacion_precio_distinto`,
--            `liquidacion_sin_descuentos`, `liquidacion_no_existe`, `liquidacion_sin_cambios`, `liquidacion_datos_invalidos`,
--            `liquidacion_venta_final` (un cambio o una devolución de una pieza de liquidación).
--   NO HACE: no toca `stock` ni `movimientos` (la pieza nunca estuvo en el inventario); no alimenta demanda ni Análisis.
--
-- ESTADOS IMPOSIBLES (Lamport). La pieza se lee `for update` al cambiar el precio, al retirarla y al venderla: una venta y
-- una rebaja simultáneas se turnan, y la que llega segunda ve la etiqueta vieja o la pieza vendida. Un índice único deja
-- UNA sola etiqueta vigente por pieza, y `venta_item_id` es único. Anular la venta devuelve la pieza a «disponible».
--
-- DECIDÍ: reusar la variante centinela para la línea de venta. Cada lugar que excluye a la «Prenda sin registrar» de stock,
--   ledger, motor de demanda y plan del piso la excluye ya; una variante nueva habría que agregarla en ocho lugares.
-- DESCARTÉ: un producto «Liquidación S/ 20» con stock (lotes por precio): Felipe eligió un precio por prenda que se va bajando.
-- DESCARTÉ: dejar el mismo código al rebajar. Una etiqueta vieja olvidada en la prenda cobraría el precio de antes.
--
-- PRODUCCIÓN. Una sola parte, idempotente: tablas NUEVAS (RLS encendido y SIN políticas: solo las tocan funciones
-- `security definer`), funciones, dos `create or replace trigger` (nunca `drop trigger`) y dos reemplazos ANCLADOS a
-- `registrar_venta` (`pg_temp.reemplazar`: falla sin tocar nada si la función viva no es la revisada). No hace `alter` de
-- tablas en uso ni crea políticas (ADR-0195 no aplica). El módulo nace sin rol (ADR-0161): solo lo ve el líder.
--
-- VERIFICACIÓN (solo lectura):
--   select to_regprocedure('retail.crear_pieza_liquidacion(uuid,uuid,numeric)') is not null,
--          position('pieza_liquidacion_codigo' in pg_get_functiondef(
--            (select p.oid from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta'))) > 0;
--   → t | t
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El precio mínimo (una fila) ----------
create table if not exists retail.parametros_liquidacion (
  id boolean primary key default true check (id),
  -- Bajo este precio solo un líder etiqueta (Felipe 2026-10-10: S/ 10).
  precio_minimo numeric(10, 2) not null default 10 check (precio_minimo > 0),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references public.personas (id)
);
insert into retail.parametros_liquidacion (id) values (true) on conflict (id) do nothing;
alter table retail.parametros_liquidacion enable row level security;
revoke all on retail.parametros_liquidacion from public, anon, authenticated;

-- ---------- 2. Las piezas ----------
create table if not exists retail.piezas_liquidacion (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  categoria_id uuid not null references retail.categorias (id),
  -- El precio de la etiqueta vigente (copia de `piezas_liquidacion_etiquetas.precio` de la vigente).
  precio numeric(10, 2) not null check (precio > 0),
  estado text not null default 'disponible' check (estado in ('disponible', 'vendida', 'retirada')),
  creada_por uuid references public.personas (id),
  terminal_id uuid references retail.terminales (id),
  creado_en timestamptz not null default now(),
  venta_item_id uuid unique references retail.venta_items (id),
  vendida_en timestamptz,
  retirada_en timestamptz,
  retirada_por uuid references public.personas (id),
  motivo_retiro text,
  -- Una vendida dice qué línea la vendió; una retirada, cuándo; una disponible, ninguna de las dos.
  constraint piezas_liquidacion_estado_coherente check (
    (estado = 'disponible' and venta_item_id is null and retirada_en is null)
    or (estado = 'vendida' and venta_item_id is not null and vendida_en is not null)
    or (estado = 'retirada' and retirada_en is not null and venta_item_id is null))
);
create index if not exists piezas_liquidacion_sede_idx on retail.piezas_liquidacion (ubicacion_id, estado, creado_en desc);
alter table retail.piezas_liquidacion enable row level security;
revoke all on retail.piezas_liquidacion from public, anon, authenticated;

-- Cada etiqueta impresa (solo se agrega; `vigente` es lo único que cambia). La vigente es la que la caja acepta.
create table if not exists retail.piezas_liquidacion_etiquetas (
  codigo text primary key check (codigo ~ '^LQ[0-9A-Z]{6}$'),
  pieza_id uuid not null references retail.piezas_liquidacion (id),
  precio numeric(10, 2) not null check (precio > 0),
  vigente boolean not null default true,
  persona_id uuid references public.personas (id),
  terminal_id uuid references retail.terminales (id),
  creado_en timestamptz not null default now()
);
create unique index if not exists piezas_liquidacion_etiquetas_una_vigente
  on retail.piezas_liquidacion_etiquetas (pieza_id) where vigente;
create index if not exists piezas_liquidacion_etiquetas_pieza_idx
  on retail.piezas_liquidacion_etiquetas (pieza_id, creado_en);
alter table retail.piezas_liquidacion_etiquetas enable row level security;
revoke all on retail.piezas_liquidacion_etiquetas from public, anon, authenticated;

-- ---------- 3. Piezas internas ----------
-- Un código corto y legible: sin 0/O ni 1/I, para que se pueda dictar o escribir a mano si la pistola no lee.
create or replace function retail.fn_codigo_liquidacion_nuevo() returns text
language plpgsql volatile set search_path = retail, public, extensions as $$
declare
  c_alfabeto constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea;
  v_codigo text;
begin
  loop
    v_bytes := gen_random_bytes(6);
    v_codigo := 'LQ';
    for i in 0 .. 5 loop
      v_codigo := v_codigo || substr(c_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from piezas_liquidacion_etiquetas where codigo = v_codigo);
  end loop;
  return v_codigo;
end;
$$;
revoke all on function retail.fn_codigo_liquidacion_nuevo() from public, anon, authenticated;

-- El precio de una etiqueta: positivo, en céntimos, y bajo el mínimo solo si quien etiqueta es líder.
create or replace function retail.fn_exigir_precio_liquidacion(p_precio numeric) returns numeric
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_min numeric;
begin
  if p_precio is null or p_precio <= 0 or p_precio > 99999 or round(p_precio, 2) <> p_precio then
    raise exception 'liquidacion_datos_invalidos' using hint = 'Escribe un precio mayor que cero, con hasta dos decimales';
  end if;
  v_min := (select precio_minimo from parametros_liquidacion where id);
  if p_precio < coalesce(v_min, 0) and not fn_es_lider() then
    raise exception 'liquidacion_bajo_minimo'
      using hint = format('Una pieza de liquidación no baja de S/ %s sin un líder: pídele que la etiquete él', to_char(v_min, 'FM99990.00'));
  end if;
  return p_precio;
end;
$$;
revoke all on function retail.fn_exigir_precio_liquidacion(numeric) from public, anon, authenticated;

-- La pieza tal como la lee la web: su etiqueta vigente, su categoría y su sede.
create or replace function retail.fn_pieza_liquidacion_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = retail, public, extensions as $$
  select jsonb_build_object(
    'id', p.id, 'estado', p.estado, 'precio', p.precio, 'ubicacion_id', p.ubicacion_id, 'ubicacion', u.nombre,
    'categoria_id', p.categoria_id, 'categoria', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia,
    'codigo', (select e.codigo from piezas_liquidacion_etiquetas e where e.pieza_id = p.id and e.vigente),
    'etiquetas', (select count(*) from piezas_liquidacion_etiquetas e where e.pieza_id = p.id),
    'precio_inicial', (select e.precio from piezas_liquidacion_etiquetas e where e.pieza_id = p.id order by e.creado_en, e.codigo limit 1),
    'creado_en', p.creado_en, 'vendida_en', p.vendida_en, 'retirada_en', p.retirada_en, 'motivo_retiro', p.motivo_retiro,
    'venta_id', (select vi.venta_id from venta_items vi where vi.id = p.venta_item_id))
  from piezas_liquidacion p
  join categorias c on c.id = p.categoria_id
  join ubicaciones u on u.id = p.ubicacion_id
  where p.id = p_id
$$;
revoke all on function retail.fn_pieza_liquidacion_json(uuid) from public, anon, authenticated;

-- ---------- 4. Etiquetar una pieza nueva ----------
create or replace function retail.crear_pieza_liquidacion(p_ubicacion_id uuid, p_categoria_id uuid, p_precio numeric)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_terminal uuid;
  v_precio numeric;
  v_id uuid;
  v_codigo text;
  v_cat text;
begin
  perform fn_exigir_modulo('liquidacion');
  v_persona := fn_actor_persona_id(true);
  v_terminal := fn_actividad_terminal_ahora();
  if p_ubicacion_id is null or not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para etiquetar piezas de esa tienda' using errcode = '42501';
  end if;
  select nombre into v_cat from categorias where id = p_categoria_id and activo;
  if v_cat is null then
    raise exception 'liquidacion_datos_invalidos' using hint = 'Elige una categoría de la lista';
  end if;
  v_precio := fn_exigir_precio_liquidacion(p_precio);

  insert into piezas_liquidacion (ubicacion_id, categoria_id, precio, creada_por, terminal_id)
    values (p_ubicacion_id, p_categoria_id, v_precio, v_persona, v_terminal)
    returning id into v_id;
  v_codigo := fn_codigo_liquidacion_nuevo();
  insert into piezas_liquidacion_etiquetas (codigo, pieza_id, precio, persona_id, terminal_id)
    values (v_codigo, v_id, v_precio, v_persona, v_terminal);

  begin
    perform fn_actividad_anotar(
      'liquidacion', 'pieza_liquidacion_creada',
      'etiquetó una pieza de liquidación: ' || v_cat || ' a ' || fn_actividad_soles(v_precio) || ' (' || v_codigo || ')',
      v_persona, v_terminal, p_ubicacion_id, null, 'piezas_liquidacion', v_id::text, now(),
      jsonb_build_object('codigo', v_codigo, 'precio', v_precio, 'categoria_id', p_categoria_id), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la pieza de liquidación % (%)', v_id, sqlerrm;
  end;

  return fn_pieza_liquidacion_json(v_id);
end;
$$;
revoke all on function retail.crear_pieza_liquidacion(uuid, uuid, numeric) from public, anon;
grant execute on function retail.crear_pieza_liquidacion(uuid, uuid, numeric) to authenticated;

-- ---------- 5. Cambiar el precio: etiqueta nueva, la vieja deja de valer ----------
create or replace function retail.cambiar_precio_pieza_liquidacion(p_codigo text, p_precio numeric)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_terminal uuid;
  v_e piezas_liquidacion_etiquetas%rowtype;
  v_p piezas_liquidacion%rowtype;
  v_precio numeric;
  v_codigo text;
begin
  perform fn_exigir_modulo('liquidacion');
  v_persona := fn_actor_persona_id(true);
  v_terminal := fn_actividad_terminal_ahora();

  select * into v_e from piezas_liquidacion_etiquetas where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then
    raise exception 'liquidacion_no_existe' using hint = 'Ese código no es de una pieza de liquidación';
  end if;
  select * into v_p from piezas_liquidacion where id = v_e.pieza_id for update;
  if not fn_puede_operar_ubicacion(v_p.ubicacion_id) then
    raise exception 'No tienes permiso para cambiar piezas de esa tienda' using errcode = '42501';
  end if;
  if v_p.estado = 'vendida' then
    raise exception 'liquidacion_ya_vendida' using hint = 'Esa pieza ya se vendió';
  elsif v_p.estado = 'retirada' then
    raise exception 'liquidacion_retirada' using hint = 'Esa pieza se retiró de la liquidación';
  end if;
  -- Se relee con el candado puesto: otra rebaja pudo ganar mientras esperábamos.
  select * into v_e from piezas_liquidacion_etiquetas where codigo = v_e.codigo;
  if not v_e.vigente then
    raise exception 'liquidacion_etiqueta_vieja'
      using hint = format('Esa etiqueta ya no vale: la pieza tiene otra (%s) a S/ %s',
                          (select codigo from piezas_liquidacion_etiquetas where pieza_id = v_p.id and vigente),
                          to_char(v_p.precio, 'FM99990.00'));
  end if;
  v_precio := fn_exigir_precio_liquidacion(p_precio);
  if v_precio = v_p.precio then
    raise exception 'liquidacion_sin_cambios' using hint = 'Ese ya es su precio';
  end if;

  update piezas_liquidacion_etiquetas set vigente = false where codigo = v_e.codigo;
  v_codigo := fn_codigo_liquidacion_nuevo();
  insert into piezas_liquidacion_etiquetas (codigo, pieza_id, precio, persona_id, terminal_id)
    values (v_codigo, v_p.id, v_precio, v_persona, v_terminal);
  update piezas_liquidacion set precio = v_precio where id = v_p.id;

  begin
    perform fn_actividad_anotar(
      'liquidacion', 'pieza_liquidacion_precio',
      'cambió el precio de una pieza de liquidación de ' || fn_actividad_soles(v_p.precio) || ' a ' || fn_actividad_soles(v_precio)
        || ' (' || v_e.codigo || ' → ' || v_codigo || ')',
      v_persona, v_terminal, v_p.ubicacion_id, null, 'piezas_liquidacion', v_p.id::text, now(),
      jsonb_build_object('antes', v_p.precio, 'despues', v_precio, 'codigo_viejo', v_e.codigo, 'codigo', v_codigo), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el cambio de precio de % (%)', v_p.id, sqlerrm;
  end;

  return fn_pieza_liquidacion_json(v_p.id);
end;
$$;
revoke all on function retail.cambiar_precio_pieza_liquidacion(text, numeric) from public, anon;
grant execute on function retail.cambiar_precio_pieza_liquidacion(text, numeric) to authenticated;

-- ---------- 6. Retirar (se perdió, se donó, se dañó): nunca se borra ----------
create or replace function retail.retirar_pieza_liquidacion(p_codigo text, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_e piezas_liquidacion_etiquetas%rowtype;
  v_p piezas_liquidacion%rowtype;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  perform fn_exigir_modulo('liquidacion');
  v_persona := fn_actor_persona_id(true);
  if v_motivo = '' or length(v_motivo) > 120 then
    raise exception 'liquidacion_datos_invalidos' using hint = 'Escribe en pocas palabras por qué sale de la liquidación';
  end if;
  select * into v_e from piezas_liquidacion_etiquetas where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then
    raise exception 'liquidacion_no_existe' using hint = 'Ese código no es de una pieza de liquidación';
  end if;
  select * into v_p from piezas_liquidacion where id = v_e.pieza_id for update;
  if not fn_puede_operar_ubicacion(v_p.ubicacion_id) then
    raise exception 'No tienes permiso para cambiar piezas de esa tienda' using errcode = '42501';
  end if;
  if v_p.estado <> 'disponible' then
    raise exception 'liquidacion_ya_vendida' using hint = 'Esa pieza ya no está a la venta';
  end if;

  update piezas_liquidacion set estado = 'retirada', retirada_en = now(), retirada_por = v_persona, motivo_retiro = v_motivo
    where id = v_p.id;
  update piezas_liquidacion_etiquetas set vigente = false where pieza_id = v_p.id and vigente;

  begin
    perform fn_actividad_anotar(
      'liquidacion', 'pieza_liquidacion_retirada',
      'retiró una pieza de liquidación de ' || fn_actividad_soles(v_p.precio) || ': ' || v_motivo,
      v_persona, fn_actividad_terminal_ahora(), v_p.ubicacion_id, null, 'piezas_liquidacion', v_p.id::text, now(),
      jsonb_build_object('motivo', v_motivo, 'precio', v_p.precio), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el retiro de % (%)', v_p.id, sqlerrm;
  end;

  return fn_pieza_liquidacion_json(v_p.id);
end;
$$;
revoke all on function retail.retirar_pieza_liquidacion(text, text) from public, anon;
grant execute on function retail.retirar_pieza_liquidacion(text, text) to authenticated;

-- ---------- 7. El precio mínimo: solo el líder lo cambia ----------
create or replace function retail.guardar_precio_minimo_liquidacion(p_minimo numeric)
returns numeric
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_antes numeric;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder cambia el precio mínimo de la liquidación' using errcode = '42501';
  end if;
  v_persona := fn_actor_persona_id(true);
  if p_minimo is null or p_minimo <= 0 or p_minimo > 99999 or round(p_minimo, 2) <> p_minimo then
    raise exception 'liquidacion_datos_invalidos' using hint = 'Escribe un monto mayor que cero';
  end if;
  v_antes := (select precio_minimo from parametros_liquidacion where id for update);
  update parametros_liquidacion set precio_minimo = p_minimo, actualizado_en = now(), actualizado_por = v_persona where id;
  begin
    perform fn_actividad_anotar(
      'liquidacion', 'liquidacion_precio_minimo',
      'cambió el precio mínimo de la liquidación de ' || fn_actividad_soles(v_antes) || ' a ' || fn_actividad_soles(p_minimo),
      v_persona, fn_actividad_terminal_ahora(), null, null, 'parametros_liquidacion', 'true', now(),
      jsonb_build_object('antes', v_antes, 'despues', p_minimo), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el precio mínimo (%)', sqlerrm;
  end;
  return p_minimo;
end;
$$;
revoke all on function retail.guardar_precio_minimo_liquidacion(numeric) from public, anon;
grant execute on function retail.guardar_precio_minimo_liquidacion(numeric) to authenticated;

-- ---------- 8. Lecturas ----------
-- Una etiqueta escaneada: la caja y la pantalla de Liquidación la leen igual. Un código de otra sede devuelve solo dónde está.
create or replace function retail.fn_pieza_liquidacion(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_e piezas_liquidacion_etiquetas%rowtype;
  v_ub uuid;
begin
  select * into v_e from piezas_liquidacion_etiquetas where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then
    return null;
  end if;
  v_ub := (select ubicacion_id from piezas_liquidacion where id = v_e.pieza_id);
  if not fn_puede_operar_ubicacion(v_ub) then
    return jsonb_build_object('codigo_leido', v_e.codigo, 'otra_sede', true,
                              'ubicacion', (select nombre from ubicaciones where id = v_ub));
  end if;
  return fn_pieza_liquidacion_json(v_e.pieza_id)
    || jsonb_build_object('codigo_leido', v_e.codigo, 'vigente', v_e.vigente, 'otra_sede', false);
end;
$$;
revoke all on function retail.fn_pieza_liquidacion(text) from public, anon;
grant execute on function retail.fn_pieza_liquidacion(text) to authenticated;

-- La pantalla: el mínimo y las piezas de la sede (todas las disponibles; las vendidas y retiradas de los últimos 120 días).
create or replace function retail.fn_piezas_liquidacion(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  perform fn_exigir_modulo('liquidacion');
  if p_ubicacion_id is null or not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para ver las piezas de esa tienda' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'precio_minimo', (select precio_minimo from parametros_liquidacion where id),
    'piezas', coalesce((
      select jsonb_agg(fn_pieza_liquidacion_json(p.id) order by p.estado <> 'disponible', coalesce(p.vendida_en, p.retirada_en, p.creado_en) desc)
        from piezas_liquidacion p
       where p.ubicacion_id = p_ubicacion_id
         and (p.estado = 'disponible' or coalesce(p.vendida_en, p.retirada_en) > now() - interval '120 days')), '[]'::jsonb));
end;
$$;
revoke all on function retail.fn_piezas_liquidacion(uuid) from public, anon;
grant execute on function retail.fn_piezas_liquidacion(uuid) to authenticated;

-- ---------- 9. La venta ----------
-- Lo que `registrar_venta` exige de una línea de liquidación, ANTES de cobrar. Deja la pieza con candado hasta el final.
create or replace function retail.fn_validar_linea_liquidacion(p_item jsonb, p_ubicacion_id uuid, p_canje_club boolean)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  v_e piezas_liquidacion_etiquetas%rowtype;
  v_p piezas_liquidacion%rowtype;
begin
  select * into v_e from piezas_liquidacion_etiquetas
    where codigo = upper(btrim(coalesce(p_item ->> 'pieza_liquidacion_codigo', '')));
  if not found then
    raise exception 'liquidacion_no_existe' using hint = 'Ese código no es de una pieza de liquidación';
  end if;
  select * into v_p from piezas_liquidacion where id = v_e.pieza_id for update;
  select * into v_e from piezas_liquidacion_etiquetas where codigo = v_e.codigo;
  if (p_item ->> 'variante_id')::uuid is distinct from c_cargo_especial
     or coalesce((p_item ->> 'cantidad')::integer, 0) <> 1
     or btrim(coalesce(p_item ->> 'descripcion_libre', '')) = '' then
    raise exception 'liquidacion_datos_invalidos' using hint = 'Una pieza de liquidación se vende de a una, con su nombre';
  end if;
  if v_p.ubicacion_id <> p_ubicacion_id then
    raise exception 'liquidacion_otra_sede' using hint = 'Esa pieza es de otra tienda: se vende allá';
  end if;
  if v_p.estado = 'vendida' then
    raise exception 'liquidacion_ya_vendida' using hint = 'Esa pieza ya se vendió';
  elsif v_p.estado = 'retirada' then
    raise exception 'liquidacion_retirada' using hint = 'Esa pieza se retiró de la liquidación: no se vende';
  end if;
  if not v_e.vigente then
    raise exception 'liquidacion_etiqueta_vieja'
      using hint = format('Esa etiqueta ya no vale: la pieza cuesta ahora S/ %s. Cóbrala con su etiqueta nueva',
                          to_char(v_p.precio, 'FM99990.00'));
  end if;
  if round((p_item ->> 'precio_unitario')::numeric, 2) <> v_e.precio then
    raise exception 'liquidacion_precio_distinto'
      using hint = format('La etiqueta dice S/ %s y la caja mandó S/ %s', to_char(v_e.precio, 'FM99990.00'), p_item ->> 'precio_unitario');
  end if;
  if coalesce((p_item ->> 'descuento_unitario')::numeric, 0) <> 0
     or coalesce((p_item ->> 'descuento_club_unitario')::numeric, 0) <> 0
     or p_canje_club then
    raise exception 'liquidacion_sin_descuentos'
      using hint = 'Una pieza de liquidación tiene precio final: sin descuentos ni regalos del club. Cóbrala en otra venta';
  end if;
end;
$$;
revoke all on function retail.fn_validar_linea_liquidacion(jsonb, uuid, boolean) from public, anon, authenticated;

-- Después de insertar la línea: la pieza queda vendida por ESA línea. Si ya no está disponible (la misma pieza dos veces en
-- una venta), falla y la venta entera se deshace.
create or replace function retail.fn_vender_pieza_liquidacion(p_codigo text, p_venta_item_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  update piezas_liquidacion p set estado = 'vendida', venta_item_id = p_venta_item_id, vendida_en = now()
    from piezas_liquidacion_etiquetas e
   where e.codigo = upper(btrim(p_codigo)) and e.vigente and p.id = e.pieza_id and p.estado = 'disponible';
  if not found then
    raise exception 'liquidacion_ya_vendida' using hint = 'Esa pieza ya está en esta venta o ya se vendió';
  end if;
end;
$$;
revoke all on function retail.fn_vender_pieza_liquidacion(text, uuid) from public, anon, authenticated;

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

-- 9a. Antes de cobrar: la línea de liquidación se valida contra su etiqueta, y no se le piden los datos de «Prenda sin registrar».
select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname = 'registrar_venta'),
  $v$    -- ADR-0179: una prenda sin registrar sin sus datos no se puede regularizar después.
    if (v_item ->> 'variante_id')::uuid = c_cargo_especial and ($v$,
  $v$    -- ADR-0371: una pieza de liquidación se cobra al precio de su etiqueta vigente, sin descuentos, en su sede.
    if nullif(v_item ->> 'pieza_liquidacion_codigo', '') is not null then
      perform retail.fn_validar_linea_liquidacion(v_item, p_ubicacion_id, p_canjear_cumpleanos or p_canjear_aniversario);
    end if;

    -- ADR-0179: una prenda sin registrar sin sus datos no se puede regularizar después.
    if (v_item ->> 'variante_id')::uuid = c_cargo_especial and nullif(v_item ->> 'pieza_liquidacion_codigo', '') is null and ($v$,
  1);

-- 9b. Al guardar: la pieza queda vendida y no cae a la cola de almacén (no hay nada que regularizar).
select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname = 'registrar_venta'),
  $v$    if (v_item ->> 'variante_id')::uuid = c_cargo_especial then
      insert into prendas_por_regularizar$v$,
  $v$    -- ADR-0371: la pieza de liquidación no mueve stock ni va a la cola: queda vendida por esta línea.
    if nullif(v_item ->> 'pieza_liquidacion_codigo', '') is not null then
      perform retail.fn_vender_pieza_liquidacion(v_item ->> 'pieza_liquidacion_codigo', v_item_id);
      continue;
    end if;

    if (v_item ->> 'variante_id')::uuid = c_cargo_especial then
      insert into prendas_por_regularizar$v$,
  1);

-- ---------- 10. Anular, cambiar, devolver ----------
-- Anular la venta devuelve la pieza a la liquidación (con su etiqueta vigente de siempre).
create or replace function retail.fn_piezas_liquidacion_al_anular() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  if new.estado = 'anulada' and old.estado is distinct from 'anulada' then
    update piezas_liquidacion p set estado = 'disponible', venta_item_id = null, vendida_en = null
      from venta_items vi
     where vi.id = p.venta_item_id and vi.venta_id = new.id and p.estado = 'vendida';
  end if;
  return new;
end;
$$;
create or replace trigger trg_piezas_liquidacion_al_anular
  after update of estado on retail.ventas
  for each row execute function retail.fn_piezas_liquidacion_al_anular();

-- Venta final (Felipe 2026-10-10): una pieza de liquidación no se cambia ni se devuelve.
create or replace function retail.fn_liquidacion_venta_final() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  if exists (select 1 from piezas_liquidacion where venta_item_id = new.venta_item_id) then
    raise exception 'liquidacion_venta_final'
      using hint = 'Las prendas de liquidación son venta final: no tienen cambio ni devolución';
  end if;
  return new;
end;
$$;
create or replace trigger trg_cambios_liquidacion_venta_final
  before insert on retail.cambios
  for each row execute function retail.fn_liquidacion_venta_final();
create or replace trigger trg_devolucion_items_liquidacion_venta_final
  before insert on retail.devolucion_items
  for each row execute function retail.fn_liquidacion_venta_final();

-- ---------- 11. El módulo (ADR-0161: nace sin rol, solo lo ve el líder) ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('liquidacion', 'Catálogo', 'Liquidación',
   'Etiquetar las prendas sueltas que se liquidan sin registrarlas en el catálogo, bajarles el precio con una etiqueta nueva y retirarlas',
   145, false, true)
on conflict (clave) do nothing;

select retail.fn_rls_una_vez_por_consulta();

-- ---------- 12. Validación final: si algo no quedó, se deshace todo ----------
do $v$
declare
  v_def text := pg_get_functiondef((select p.oid from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta'));
begin
  if (length(v_def) - length(replace(v_def, 'pieza_liquidacion_codigo', ''))) / length('pieza_liquidacion_codigo') <> 4 then
    raise exception 'piezas de liquidación: registrar_venta no quedó con sus dos reemplazos';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_venta') <> 1 then
    raise exception 'piezas de liquidación: debe haber una sola registrar_venta';
  end if;
  if not exists (select 1 from retail.modulos where clave = 'liquidacion') then
    raise exception 'piezas de liquidación: falta el módulo';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'retail.piezas_liquidacion'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'retail.piezas_liquidacion_etiquetas'::regclass) then
    raise exception 'piezas de liquidación: una tabla quedó sin RLS';
  end if;
end
$v$;
