-- ============================================================================
-- 20260923161700_prendas_por_regularizar.sql — CAYLA V2 (ADR-0179, Felipe 2026-09-23)
--
-- EL PROBLEMA. En hora punta llegan a piso prendas que almacén todavía no etiquetó ni
-- registró, y se venden a un precio estimado. El único camino de la caja era «Monto
-- manual»: un monto suelto, sin saber qué prenda fue. El stock real nunca bajaba y la
-- diferencia de precio no se veía. (En producción ni siquiera existía la variante
-- centinela: el botón fallaba. Verificado por el MCP en solo lectura, 2026-09-23.)
--
-- LA DECISIÓN (spec docs/superpowers/specs/2026-09-23-prendas-sin-registrar-design.md):
-- la caja vende sin pedir permiso, pero anota descripción, categoría, talla y color. La
-- línea queda en `prendas_por_regularizar` y almacén la une después con su prenda real
-- (`regularizar_prenda`, migración siguiente).
--
-- POR QUÉ LA LÍNEA NO MUEVE STOCK AL VENDERSE. La prenda no está en el sistema: no hay stock
-- que bajar. Antes se sembraban 999.999 unidades ficticias de la centinela, que ensuciaban el
-- ledger. Ahora el único movimiento de esa prenda es el real, el que escribe almacén al
-- regularizar. Por eso `anular_venta` salta la línea mientras está pendiente.
--
-- POR QUÉ `registrar_venta` Y `anular_venta` SE PARCHAN Y NO SE REESCRIBEN. Su versión viva no es la
-- de ningún archivo: 20260922224300 (nota de venta) y 20260923100000 (firma del responsable) las
-- cambiaron editando la definición viva. Copiarlas desde un archivo borraría esos cambios (la caja
-- dejaría de aceptar nota de venta). Se insertan solo los bloques «ADR-0179» con el mismo
-- `pg_temp.reemplazar` de 20260922224300: cada ancla debe aparecer exactamente una vez o se aborta todo.
--
-- QUÉ TOCA. (1) asegura la variante centinela (faltaba en producción); (2) tabla nueva con RLS de solo
-- lectura; (3) parches a `registrar_venta` y `anular_venta` (misma firma); (4) triggers: anular la venta
-- saca la prenda de la cola, y un cambio o devolución exige la prenda regularizada; (5) validación final.
--
-- PRODUCCIÓN: pegar con OK de Felipe; ya lleva `retail.` en todo el DDL. Re-ejecutable: los parches
-- detectan si ya se aplicaron.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. La variante centinela (idempotente) ----------
-- Marca CAYLA / proveedor CAYLA SAC: la misma regla que 20260918231000 usó para lo que no tenía.
-- Sin sesión (SQL Editor), el disparador de estado_alta la dejaría «pendiente de revisión» en la cola del
-- líder, y el de código le acuñaría una etiqueta como a una prenda real. Se apagan SOLO para crearla, en
-- esta misma transacción: si algo falla, vuelven solos.
alter table retail.productos disable trigger productos_estado_alta_biut;
alter table retail.variantes disable trigger variantes_asignar_codigo;

insert into retail.productos (id, referencia, descripcion, estado, marca_id, proveedor_id)
values ('11111111-1111-4111-8111-111111111111', 'Prenda sin registrar',
        'Variante centinela: una prenda vendida antes de estar en el sistema. Almacén la regulariza (ADR-0179).', 'activo',
        (select id from retail.marcas where retail.fn_clave_texto(nombre) = 'cayla'),
        (select id from retail.proveedores where retail.fn_clave_texto(nombre) = 'cayla sac'))
on conflict (id) do update set referencia = excluded.referencia, descripcion = excluded.descripcion;

insert into retail.variantes (id, producto_id, sku, precio, costo, activo)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'CARGO-ESPECIAL-01', 0, 0, false)
on conflict (id) do nothing;

alter table retail.productos enable trigger productos_estado_alta_biut;
alter table retail.variantes enable trigger variantes_asignar_codigo;

-- ---------- 2. La cola ----------
create table if not exists retail.prendas_por_regularizar (
  id uuid primary key default gen_random_uuid(),
  venta_item_id uuid not null unique references retail.venta_items (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  descripcion text not null check (btrim(descripcion) <> ''),
  categoria_id uuid not null references retail.categorias (id),
  talla_id uuid not null references retail.tallas (id),
  color_codigo text not null references retail.colores (codigo),
  precio_cobrado numeric(12, 2) not null check (precio_cobrado > 0),
  vendido_por uuid references public.personas (id),
  vendido_en timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'regularizada', 'anulada')),
  variante_id uuid references retail.variantes (id),
  forma text check (forma in ('ya_registrada', 'llego_nueva')),
  precio_oficial numeric(12, 2),
  diferencia numeric(12, 2),
  regularizado_por uuid references public.personas (id),
  regularizado_en timestamptz,
  -- Regularizada ⇔ trae todo lo de almacén: nunca a medias (principio 2).
  constraint prendas_por_regularizar_completa check (
    (estado = 'regularizada') = (variante_id is not null and forma is not null and precio_oficial is not null
                                  and diferencia is not null and regularizado_en is not null)
  )
);
comment on table retail.prendas_por_regularizar is
  'Prenda vendida en caja antes de estar en el sistema (ADR-0179). Nace pendiente en registrar_venta; almacén la une a su variante real con regularizar_prenda. diferencia = precio_cobrado − precio_oficial: negativa = descuento no planificado, positiva = sobreprecio.';
create index if not exists prendas_por_regularizar_pendientes_idx
  on retail.prendas_por_regularizar (ubicacion_id, vendido_en) where estado = 'pendiente';

alter table retail.prendas_por_regularizar enable row level security;
-- Solo lectura desde el navegador; escriben registrar_venta y regularizar_prenda (security definer).
drop policy if exists prendas_por_regularizar_select on retail.prendas_por_regularizar;
create policy prendas_por_regularizar_select on retail.prendas_por_regularizar for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id));
revoke all on retail.prendas_por_regularizar from public, anon;
grant select on retail.prendas_por_regularizar to authenticated;

-- ---------- 3. Parches sobre la definición viva ----------
-- Reemplaza `p_viejo` por `p_nuevo` en la función. Si ya está aplicado (aparece `p_nuevo`), no hace
-- nada; si `p_viejo` no aparece exactamente `p_veces` veces, aborta todo. (Igual que 20260922224300.)
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void language plpgsql as $f$
declare v_def text; v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then return; end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception 'prendas sin registrar: en % se esperaban % apariciones de «%» y hay %', p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 3a. registrar_venta: exige los datos de la prenda sin registrar (primer recorrido, antes del descuento).
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text)',
  '    v_descuento := coalesce((v_item ->> ''descuento_unitario'')::numeric, 0);',
  $n$    -- ADR-0179: una prenda sin registrar sin sus datos no se puede regularizar después.
    if (v_item ->> 'variante_id')::uuid = c_cargo_especial and (
         btrim(coalesce(v_item ->> 'descripcion_libre', '')) = ''
         or nullif(v_item ->> 'categoria_id', '') is null
         or nullif(v_item ->> 'talla_id', '') is null
         or nullif(v_item ->> 'color_codigo', '') is null
         or (v_item ->> 'cantidad')::integer <> 1
         or (v_item ->> 'precio_unitario')::numeric - coalesce((v_item ->> 'descuento_unitario')::numeric, 0) <= 0) then
      raise exception 'prenda_sin_registrar_incompleta'
        using hint = 'Una prenda sin registrar necesita descripción, categoría, talla, color, precio y cantidad 1';
    end if;

    v_descuento := coalesce((v_item ->> 'descuento_unitario')::numeric, 0);$n$,
  1);

-- 3b. registrar_venta: la línea de la centinela no mueve stock; queda en la cola (segundo recorrido).
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text)',
  '      returning id into v_item_id;',
  $n$      returning id into v_item_id;

    -- ADR-0179: la prenda sin registrar no mueve stock (no está en el sistema); queda en la cola
    -- y su único movimiento es el real, el que escribe almacén al regularizarla.
    if (v_item ->> 'variante_id')::uuid = c_cargo_especial then
      insert into prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id,
                                           color_codigo, precio_cobrado, vendido_por)
        values (v_item_id, p_ubicacion_id, btrim(v_item ->> 'descripcion_libre'),
                (v_item ->> 'categoria_id')::uuid, (v_item ->> 'talla_id')::uuid, v_item ->> 'color_codigo',
                (v_item ->> 'precio_unitario')::numeric - coalesce((v_item ->> 'descuento_unitario')::numeric, 0),
                coalesce(p_asesora_id, v_persona));
      continue;
    end if;$n$,
  1);

-- 3c. anular_venta: una prenda sin registrar todavía pendiente nunca movió stock — no hay nada que
--     devolver. (Ya regularizada, su línea apunta a la variante real y tiene su salida `venta`.)
select pg_temp.reemplazar(
  'retail.anular_venta(uuid, text, jsonb)',
  '    if v_condicion = ''vendible'' then',
  $n$    -- ADR-0179: la prenda sin registrar pendiente no movió stock; no hay nada que devolver.
    if v_condicion = 'vendible' and v_venta_item.variante_id = '22222222-2222-4222-8222-222222222222' then
      null;
    elsif v_condicion = 'vendible' then$n$,
  1);

-- ---------- 4. Triggers ----------

-- Anular la venta saca de la cola lo que seguía pendiente.
create or replace function retail.fn_prendas_por_regularizar_al_anular()
returns trigger
language plpgsql
security definer
set search_path = retail, public
as $$
begin
  if new.estado = 'anulada' and old.estado is distinct from 'anulada' then
    update prendas_por_regularizar p set estado = 'anulada'
      from venta_items vi
      where vi.id = p.venta_item_id and vi.venta_id = new.id and p.estado = 'pendiente';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_prendas_por_regularizar_al_anular on retail.ventas;
create trigger trg_prendas_por_regularizar_al_anular after update of estado on retail.ventas
  for each row execute function retail.fn_prendas_por_regularizar_al_anular();

-- Cambio o devolución de una prenda que almacén aún no identificó: no se sabe a qué stock vuelve.
create or replace function retail.fn_exige_prenda_regularizada()
returns trigger
language plpgsql
security definer
set search_path = retail, public
as $$
begin
  if exists (select 1 from prendas_por_regularizar where venta_item_id = new.venta_item_id and estado = 'pendiente') then
    raise exception 'prenda_sin_regularizar'
      using hint = 'Pide a almacén que regularice esta prenda (Recibir ▸ Por regularizar) antes de cambiarla o devolverla';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_cambios_exige_regularizada on retail.cambios;
create trigger trg_cambios_exige_regularizada before insert on retail.cambios
  for each row execute function retail.fn_exige_prenda_regularizada();
drop trigger if exists trg_devolucion_items_exige_regularizada on retail.devolucion_items;
create trigger trg_devolucion_items_exige_regularizada before insert on retail.devolucion_items
  for each row execute function retail.fn_exige_prenda_regularizada();

revoke all on function retail.fn_prendas_por_regularizar_al_anular() from public, anon, authenticated;
revoke all on function retail.fn_exige_prenda_regularizada() from public, anon, authenticated;

select retail.fn_rls_una_vez_por_consulta();

-- ---------- 5. Validación final: si algo no quedó, se deshace todo ----------
do $v$
declare
  c_rv constant text := 'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text)';
begin
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('registrar_venta', 'anular_venta')) <> 2 then
    raise exception 'prendas sin registrar: quedaron sobrecargas de registrar_venta/anular_venta';
  end if;
  if pg_get_functiondef(c_rv::regprocedure) not like '%prenda_sin_registrar_incompleta%'
     or pg_get_functiondef(c_rv::regprocedure) not like '%insert into prendas_por_regularizar%' then
    raise exception 'prendas sin registrar: registrar_venta no quedó parchada';
  end if;
  -- Lo que ya tenía la versión viva sigue ahí (nota de venta, 20260922224300).
  if pg_get_functiondef(c_rv::regprocedure) not like '%''nota_venta''%' then
    raise exception 'prendas sin registrar: registrar_venta perdió la nota de venta';
  end if;
  if pg_get_functiondef('retail.anular_venta(uuid, text, jsonb)'::regprocedure) not like '%ADR-0179%' then
    raise exception 'prendas sin registrar: anular_venta no quedó parchada';
  end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O' and tgname in
      ('trg_prendas_por_regularizar_al_anular', 'trg_cambios_exige_regularizada', 'trg_devolucion_items_exige_regularizada',
       'productos_estado_alta_biut', 'variantes_asignar_codigo')) <> 5 then
    raise exception 'prendas sin registrar: algún disparador quedó apagado o no se creó';
  end if;
  if not exists (select 1 from retail.variantes where id = '22222222-2222-4222-8222-222222222222') then
    raise exception 'prendas sin registrar: falta la variante centinela';
  end if;
end
$v$;
